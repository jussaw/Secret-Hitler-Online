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

/** A round on its way: its fields, and the events it was built from. */
interface Draft {
  round: Round;
  /** The nominating seat, or null when the round has no recorded nomination. */
  nominator: number | null;
  /** The seat of the round's first president's move (a draw, a power, END TERM, …), or null. */
  mover: number | null;
  events: GameEvent[];
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

function isKnown(event: GameEvent): boolean {
  return Object.prototype.hasOwnProperty.call(EVENT_FIELDS, event.type);
}

/** The first event of `type` in `events`, or undefined. */
function first<T extends GameEvent["type"]>(events: GameEvent[], type: T): Event<T> | undefined {
  return events.find((e): e is Event<T> => e.type === type);
}

/** A round's fields from its own events, in order (its president is filled in later). */
function draft(r: number, events: GameEvent[]): Draft {
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
  let president: number | null = null;
  let chancellor: number | null = null;
  for (const e of events) {
    switch (e.type) {
      case "nominate":
        if (president === null || chancellor === null) {
          president = e.president;
          chancellor = e.chancellor;
        }
        break;
      case "vote":
        round.votes.push({ seat: e.seat, ja: e.ja, ms: null });
        break;
      case "election":
        round.election = { passed: e.passed, ja: e.ja, nein: e.nein };
        break;
      case "tracker":
        round.trackerAfter = e.value;
        break;
      case "draw":
        round.hand = [...e.cards];
        break;
      case "discard":
        round.discard = { index: e.index, card: e.card };
        break;
      case "veto":
        if (round.veto === null) round.veto = { accepted: null };
        break;
      case "vetoAnswer":
        if (round.veto !== null && round.veto.accepted === null) round.veto = { accepted: e.accepted };
        break;
      case "enact":
        round.enacted = { policy: e.policy, by: e.by };
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
  if (chancellor === null) {
    const enact = events.find((e): e is Event<"enact"> => e.type === "enact" && e.by === "chancellor" && e.seat !== undefined);
    const veto = first(events, "veto");
    chancellor = enact?.seat ?? veto?.seat ?? null;
  }
  round.chancellor = chancellor;

  const move = events.find((e) => PRESIDENT_MOVES.has(e.type)) as { seat: number } | undefined;

  // The two cards handed on: the hand without its discard, when both are known.
  if (round.hand !== null && round.discard !== null) {
    const { index } = round.discard;
    if (Number.isInteger(index) && index >= 0 && index < round.hand.length) {
      round.chancellorHand = round.hand.filter((_, i) => i !== index);
    }
  }
  return { round, nominator: president, mover: move === undefined ? null : move.seat, events };
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
 * The record's rounds, one per round number in its timeline, ascending. A round of a finished
 * record that holds only `end`, `restored`, `disconnect` and `reconnect` is left out, and so is
 * each leading round of a `complete: false` record that names no president.
 */
export function rounds(record: GameRecord): Round[] {
  const byRound = new Map<number, GameEvent[]>();
  for (const event of record.events) {
    if (!isKnown(event)) continue;
    const list = byRound.get(event.r);
    if (list) list.push(event);
    else byRound.set(event.r, [event]);
  }
  const finished = record.outcome !== "UNFINISHED";
  const drafts = Array.from(byRound.keys())
    .sort((a, b) => a - b)
    .map((r) => draft(r, byRound.get(r)!))
    .filter((d) => !(finished && d.events.every((e) => NOT_MOVES.has(e.type))));

  // A seat is dead once an execution targets it; in a record that starts late, also from the start
  // when it ends dead and no recorded execution killed it.
  const executed = new Set<number>();
  for (const event of record.events) if (event.type === "execute") executed.add(event.target);
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
    for (const e of d.events) if (e.type === "execute") dead.add(e.target);
    out.push(d.round);
  }
  return out;
}
