import { EVENT_FIELDS, type Card, type GameEvent, type GameRecord, type Role, type Side } from "./record";

/**
 * A game's timeline as rounds (`rounds(record)`): one entry per round, with its government, votes,
 * cards, veto, policy, power, end, blame and decision times, worked out once here so that no page
 * or stat reads the raw events for them again. Pure: it reads only the record, and never throws
 * on a format-1 record (a missing event leaves its field null, and an unknown type is skipped).
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

export interface Vote {
  seat: number;
  ja: boolean;
  /** The voter's decision time, from the nomination; null for a CPU, or when it cannot be said. */
  ms: number | null;
}

export type Power =
  | { kind: "peek"; seat: number; cards: Card[] }
  | { kind: "investigate"; seat: number; target: number; result: Side }
  | { kind: "execute"; seat: number; target: number; role: Role }
  | { kind: "specialElection"; seat: number; target: number };

export interface Round {
  r: number;
  /** The president's seat. */
  president: number;
  /** The chancellor's seat; null if no nomination happened (the lobby closed first). */
  chancellor: number | null;
  /** In arrival order. */
  votes: Vote[];
  election: { passed: boolean; ja: number; nein: number } | null;
  /** The tracker's value if it moved this round (3 in a chaos round). */
  trackerAfter: number | null;
  /** The president's three. */
  hand: Card[] | null;
  discard: { index: number; card: Card } | null;
  /** The two handed on. */
  chancellorHand: Card[] | null;
  /** Asked; a null answer if the lobby closed first. */
  veto: { accepted: boolean | null } | null;
  enacted: { policy: Card; by: "chancellor" | "chaos" } | null;
  power: Power | null;
  endTerm: { by: "president" | "countdown" } | null;
  pauses: number;
  reshuffled: boolean;
  /** One seat per dropped connection, in order, repeats kept. */
  disconnects: number[];
  /** The seat that chose a Fascist over a Liberal. */
  blame: number | null;
  /** Decision times; null for a CPU, when an event is missing, or across a `restored` event. */
  ms: {
    nominate: number | null;
    discard: number | null;
    chancellor: number | null;
    /** The chancellor's choice after a refused veto. */
    chancellorAfterVeto: number | null;
    vetoAnswer: number | null;
    power: number | null;
    /** Set for both kinds of ending. */
    endTerm: number | null;
  };
}

/** The events of one type. */
type Event<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;

/** A round on its way: its fields, and where its events are in the record's `events`. */
interface Draft {
  round: Round;
  /** The nominating seat, or null when the round has no recorded nomination. */
  nominator: number | null;
  /** The seat of the round's first president's move (a draw, a power, END TERM, …), or null. */
  mover: number | null;
  /** The places of the round's events in `events`, in order. */
  at: number[];
  /** The place of each of `round.votes`' events. */
  voteAt: number[];
}

/** Events that name the president by `seat`, for a round whose nomination was not recorded. */
const PRESIDENT_MOVES: ReadonlySet<GameEvent["type"]> = new Set<GameEvent["type"]>([
  "draw",
  "discard",
  "vetoAnswer",
  "peek",
  "investigate",
  "execute",
  "specialElection",
  "endTerm",
  "timerPause",
  "timerResume",
]);

/** Events that are no move of the game: a round of only these is not a round played. */
const NOT_MOVES: ReadonlySet<GameEvent["type"]> = new Set<GameEvent["type"]>([
  "end",
  "restored",
  "disconnect",
  "reconnect",
]);

/** Events that are no action a term's END TERM is timed from. */
const NOT_ACTIONS: ReadonlySet<GameEvent["type"]> = new Set<GameEvent["type"]>([
  "timerPause",
  "timerResume",
  "disconnect",
  "reconnect",
  "restored",
]);

const POWERS: ReadonlySet<GameEvent["type"]> = new Set<GameEvent["type"]>([
  "peek",
  "investigate",
  "execute",
  "specialElection",
]);

function isKnown(event: GameEvent): boolean {
  return Object.prototype.hasOwnProperty.call(EVENT_FIELDS, event.type);
}

function isChancellorEnact(event: GameEvent): boolean {
  return event.type === "enact" && event.by === "chancellor";
}

/** A round's fields from its own events, in order (its president, blame and times come later). */
function draft(r: number, at: number[], events: GameEvent[]): Draft {
  const round: Round = {
    r,
    president: 0,
    chancellor: null,
    votes: [],
    election: null,
    trackerAfter: null,
    hand: null,
    discard: null,
    chancellorHand: null,
    veto: null,
    enacted: null,
    power: null,
    endTerm: null,
    pauses: 0,
    reshuffled: false,
    disconnects: [],
    blame: null,
    ms: {
      nominate: null,
      discard: null,
      chancellor: null,
      chancellorAfterVeto: null,
      vetoAnswer: null,
      power: null,
      endTerm: null,
    },
  };
  const voteAt: number[] = [];
  let nominator: number | null = null;
  let nominee: number | null = null;
  let mover: number | null = null;
  let enactor: number | null = null;
  let vetoer: number | null = null;
  for (const i of at) {
    const e = events[i];
    if (mover === null && PRESIDENT_MOVES.has(e.type)) mover = (e as { seat: number }).seat;
    switch (e.type) {
      case "nominate":
        if (nominator === null) {
          nominator = e.president;
          nominee = e.chancellor;
        }
        break;
      case "vote":
        round.votes.push({ seat: e.seat, ja: e.ja, ms: null });
        voteAt.push(i);
        break;
      case "election":
        round.election = { passed: e.passed, ja: e.ja, nein: e.nein };
        break;
      case "tracker":
        round.trackerAfter = e.value;
        break;
      case "draw":
        if (round.hand === null) round.hand = [...e.cards];
        break;
      case "discard":
        if (round.discard === null) round.discard = { index: e.index, card: e.card };
        break;
      case "veto":
        if (round.veto === null) round.veto = { accepted: null };
        if (vetoer === null) vetoer = e.seat;
        break;
      case "vetoAnswer":
        if (round.veto !== null && round.veto.accepted === null) round.veto = { accepted: e.accepted };
        break;
      case "enact":
        round.enacted = { policy: e.policy, by: e.by };
        if (e.by === "chancellor" && e.seat !== undefined && enactor === null) enactor = e.seat;
        break;
      case "reshuffle":
        round.reshuffled = true;
        break;
      case "peek":
        round.power = { kind: "peek", seat: e.seat, cards: [...e.cards] };
        break;
      case "investigate":
        round.power = { kind: "investigate", seat: e.seat, target: e.target, result: e.result };
        break;
      case "execute":
        round.power = { kind: "execute", seat: e.seat, target: e.target, role: e.role };
        break;
      case "specialElection":
        round.power = { kind: "specialElection", seat: e.seat, target: e.target };
        break;
      case "endTerm":
        round.endTerm = { by: e.by };
        break;
      case "timerPause":
        round.pauses++;
        break;
      case "disconnect":
        round.disconnects.push(e.seat);
        break;
      default:
        break;
    }
  }
  // The chancellor: the nominee, else whoever enacted or asked to veto.
  round.chancellor = nominee ?? enactor ?? vetoer;

  // The two cards handed on: the hand without its discard, when both are known.
  if (round.hand !== null && round.discard !== null) {
    const { index } = round.discard;
    if (Number.isInteger(index) && index >= 0 && index < round.hand.length) {
      round.chancellorHand = round.hand.filter((_, i) => i !== index);
    }
  }
  return { round, nominator, mover, at, voteAt };
}

/** The first seat after `seat` in turn order that is not in `dead` (itself, if every other is). */
function nextLiving(seat: number, dead: ReadonlySet<number>, seats: number): number {
  if (seats <= 0) return 0;
  const from = ((seat % seats) + seats) % seats;
  for (let i = 1; i <= seats; i++) {
    const next = (from + i) % seats;
    if (!dead.has(next)) return next;
  }
  return from;
}

/**
 * The president after `last`, as `SecretHitlerGame.endPresidentialTerm` picks them: the target of
 * `last`'s special election; else, when `last`'s president was named by a special election in
 * `before`, the first living seat after the one who called it; else the first living seat after
 * `last`'s president. `dead` is everyone dead at the end of `last`.
 */
function rotation(last: Round, before: Round | undefined, dead: ReadonlySet<number>, seats: number): number {
  if (last.power?.kind === "specialElection") return last.power.target;
  const special = before?.power?.kind === "specialElection" && before.power.target === last.president;
  const from = special && before?.power ? before.power.seat : last.president;
  return nextLiving(from, dead, seats);
}

/**
 * Who chose a Fascist over a Liberal: in a government whose president held a Liberal and whose
 * chancellor enacted a Fascist, the president if they discarded the one Liberal of their hand,
 * else the chancellor, who was handed one of each.
 */
function blameOf(round: Round): number | null {
  const { hand, discard, enacted } = round;
  if (hand === null || discard === null || enacted === null) return null;
  if (enacted.policy !== "F" || enacted.by !== "chancellor") return null;
  const liberals = hand.filter((card) => card === "L").length;
  if (liberals === 0) return null;
  return liberals === 1 && discard.card === "L" ? round.president : round.chancellor;
}

/**
 * Fills in a round's decision times (`Round.ms` and each `Vote.ms`): each runs from the event that
 * asked for a decision to the event that made it, and is null when the deciding seat is a CPU,
 * when either event is missing, or when a `restored` event lies between the two. Events are found
 * by their place in `events`, so the restart check compares places, not times.
 */
function time(d: Draft, record: GameRecord, restoredAt: number[]): void {
  const { events, seats } = record;
  const { round, at } = d;
  const cpu = (seat: number | null) => seat !== null && seats[seat] !== undefined && seats[seat].cpu === true;
  /** The time from the event at `from` (-1: the game's start) to the one at `to`, decided by `seat`. */
  const span = (from: number | undefined, to: number | undefined, seat: number | null): number | null => {
    if (from === undefined || to === undefined || cpu(seat)) return null;
    if (restoredAt.some((k) => from < k && k < to)) return null;
    return events[to].t - (from < 0 ? 0 : events[from].t);
  };
  /** The place of the round's first event after `from` that `matches`. */
  const next = (from: number | undefined, matches: (e: GameEvent) => boolean): number | undefined =>
    from === undefined ? undefined : at.find((i) => i > from && matches(events[i]));
  const firstOf = (matches: (e: GameEvent) => boolean) => at.find((i) => matches(events[i]));

  const nominate = firstOf((e) => e.type === "nominate");
  if (nominate !== undefined) {
    // From the last END TERM or restart before it; with neither, from a complete game's start.
    let from: number | undefined = record.complete ? -1 : undefined;
    for (let i = nominate - 1; i >= 0; i--) {
      if (events[i].type === "endTerm" || events[i].type === "restored") {
        from = i;
        break;
      }
    }
    round.ms.nominate = span(from, nominate, round.president);
  }
  round.votes.forEach((vote, k) => {
    const to = d.voteAt[k];
    vote.ms = nominate !== undefined && to > nominate ? span(nominate, to, vote.seat) : null;
  });

  const draw = firstOf((e) => e.type === "draw");
  const discard = next(draw, (e) => e.type === "discard");
  round.ms.discard = span(draw, discard, round.president);
  const firstDiscard = firstOf((e) => e.type === "discard");
  round.ms.chancellor = span(firstDiscard, next(firstDiscard, (e) => e.type === "veto" || isChancellorEnact(e)), round.chancellor);

  const veto = firstOf((e) => e.type === "veto");
  const answer = next(veto, (e) => e.type === "vetoAnswer");
  round.ms.vetoAnswer = span(veto, answer, round.president);
  if (answer !== undefined && (events[answer] as Event<"vetoAnswer">).accepted === false) {
    round.ms.chancellorAfterVeto = span(answer, next(answer, isChancellorEnact), round.chancellor);
  }

  const enact = firstOf(isChancellorEnact);
  round.ms.power = span(enact, next(enact, (e) => POWERS.has(e.type)), round.president);

  const endTerm = firstOf((e) => e.type === "endTerm");
  if (endTerm !== undefined) {
    let from: number | undefined;
    for (const i of at) {
      if (i >= endTerm) break;
      if (!NOT_ACTIONS.has(events[i].type)) from = i;
    }
    round.ms.endTerm = span(from, endTerm, (events[endTerm] as Event<"endTerm">).seat);
  }
}

/**
 * The record's rounds, one per round number in its timeline, ascending, each built from its own
 * events in order. A round of a finished record that holds only `end`, `restored`, `disconnect`
 * and `reconnect` events is left out, and so is each leading round of a `complete: false` record
 * that names no president. A round with no recorded nomination takes its president from the
 * rotation after the round before it (the first round: from its president's first move, else seat
 * 0).
 */
export function rounds(record: GameRecord): Round[] {
  const { events } = record;
  const byRound = new Map<number, number[]>();
  const restoredAt: number[] = [];
  events.forEach((event, i) => {
    if (!isKnown(event)) return;
    if (event.type === "restored") restoredAt.push(i);
    const list = byRound.get(event.r);
    if (list) list.push(i);
    else byRound.set(event.r, [i]);
  });
  const finished = record.outcome !== "UNFINISHED";
  const drafts = Array.from(byRound.keys())
    .sort((a, b) => a - b)
    .map((r) => draft(r, byRound.get(r)!, events))
    .filter((d) => !(finished && d.at.every((i) => NOT_MOVES.has(events[i].type))));

  // A seat is dead once an execution targets it; in a record that starts late, also from the start
  // when it ends dead and no recorded execution killed it.
  const executed = new Set<number>();
  for (const event of events) if (event.type === "execute") executed.add(event.target);
  const dead = new Set<number>();
  if (!record.complete) {
    record.seats.forEach((seat, i) => {
      if (!seat.alive && !executed.has(i)) dead.add(i);
    });
  }

  const out: Round[] = [];
  for (const d of drafts) {
    const last = out.length > 0 ? out[out.length - 1] : undefined;
    if (d.nominator !== null) d.round.president = d.nominator;
    else if (last !== undefined) d.round.president = rotation(last, out[out.length - 2], dead, record.seats.length);
    else if (d.mover !== null) d.round.president = d.mover; // a record that starts mid-term
    else if (!record.complete) continue; // a leading round of a late record that names no one
    else d.round.president = 0; // round 1's first president, or a record that cannot say
    for (const i of d.at) {
      const e = events[i];
      if (e.type === "execute") dead.add(e.target);
    }
    d.round.blame = blameOf(d.round);
    time(d, record, restoredAt);
    out.push(d.round);
  }
  return out;
}

/** One decision's time in whole seconds, at least 1: "8 s", and from a minute "1 min 05 s". */
export function formatDecisionTime(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}
