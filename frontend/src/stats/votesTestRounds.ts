import { seatsOf } from "./testGames";
import { ev } from "./game/sampleGames";
import type { Card, GameEvent, GameRecord, Outcome, Role, Side } from "./record";
import { makeRecord } from "./testRecords";

/**
 * Builders of terms and games for the VOTES & POWERS tests (never imported by the page): a term
 * is one round's events, from the nomination to END TERM, and a game is a list of terms. Every
 * event is built through Phase 16's `ev`, so the records read as the server writes them.
 */

/** Five seats: three Liberals, the Fascist, then Hitler. */
export const FIVE: Role[] = ["LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "HITLER"];
/** Seven seats: four Liberals, two Fascists, then Hitler. */
export const SEVEN: Role[] = ["LIBERAL", "LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "FASCIST", "HITLER"];
/** Every seat of a five-seat game. */
export const ALL = [0, 1, 2, 3, 4];

/** The whole numbers from `from` up to, not including, `to`. */
export function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

type PowerType = "peek" | "investigate" | "execute" | "specialElection";
type Event<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;
/** `T` without `t` and `r`, one union member at a time, so `type` still narrows. */
type WithoutAt<T> = T extends unknown ? Omit<T, "t" | "r"> : never;
/** A presidential power's event, without its time and round (the term gives them). */
export type PowerEvent = WithoutAt<Event<PowerType>>;

export interface TermOptions {
  /** A failed election, or an accepted veto, puts this policy on the board by chaos. */
  chaos?: Card;
  /** The chancellor asks to veto, and the president accepts (true) or refuses (false). */
  veto?: boolean;
  /** The power the enacted policy gave, used after it. */
  power?: PowerEvent;
  /** The game ends at the election (Hitler elected): nothing follows it, not even END TERM. */
  ends?: boolean;
}

/** An investigation by `seat` of `target`, who showed `result`. */
export function investigate(seat: number, target: number, result: Side): TermOptions {
  return { power: { type: "investigate", seat, target, result } };
}

/** An execution by `seat` of `target`, whose role was `role`. */
export function execute(seat: number, target: number, role: Role): TermOptions {
  return { power: { type: "execute", seat, target, role } };
}

/**
 * One term of round `r`, every event at `t` 0 (`gameOf` times them): the nomination, a vote from
 * each seat in `ja`, then in `nein`, and the election, passed with more Ja than Nein. A failed
 * election moves the tracker (to 3 with `chaos`, which then enacts by chaos). A passed one draws
 * FFL and discards an F; then, with `veto`, the chancellor asks and the president answers, an
 * accepted veto moving the tracker as a failed election does and a refused one enacting the F;
 * without, the chancellor enacts the F and the `power` follows. END TERM closes every term but an
 * `ends` one. The board counts in `enact` are placeholders.
 */
export function term(
  r: number,
  president: number,
  chancellor: number,
  ja: number[],
  nein: number[],
  options: TermOptions = {}
): GameEvent[] {
  const passed = ja.length > nein.length;
  const events: GameEvent[] = [ev.nominate(r, 0, president, chancellor)];
  for (const seat of ja) events.push(ev.vote(r, 0, seat, true));
  for (const seat of nein) events.push(ev.vote(r, 0, seat, false));
  events.push(ev.election(r, 0, passed, ja.length, nein.length));
  if (options.ends) return events;

  const failedPath = () => {
    events.push(ev.tracker(r, 0, options.chaos ? 3 : 1));
    if (options.chaos) events.push(ev.enact(r, 0, options.chaos, "chaos", undefined, 0, 0));
  };
  if (!passed) {
    failedPath();
  } else {
    events.push(ev.draw(r, 0, president, "FFL"));
    events.push(ev.discard(r, 0, president, 0, "F"));
    if (options.veto !== undefined) {
      events.push(ev.veto(r, 0, chancellor));
      events.push(ev.vetoAnswer(r, 0, president, options.veto));
      if (options.veto) failedPath();
      else events.push(ev.enact(r, 0, "F", "chancellor", chancellor, 0, 0));
    } else {
      events.push(ev.enact(r, 0, "F", "chancellor", chancellor, 0, 0));
      if (options.power) events.push({ ...options.power, t: 0, r } as GameEvent);
    }
  }
  events.push(ev.endTerm(r, 0, president, "president"));
  return events;
}

export interface GameOptions {
  /** Each seat's player number, `null` for a CPU seat; by default seat `i` is player `i + 1`. */
  players?: (number | null)[];
  /** Each seat's name at the time, in place of `P<number>`. */
  names?: string[];
  /** By default `LIBERAL_POLICIES`. */
  outcome?: Outcome;
}

const WINNER: Record<Outcome, Side | null> = {
  LIBERAL_POLICIES: "LIBERAL",
  HITLER_EXECUTED: "LIBERAL",
  FASCIST_POLICIES: "FASCIST",
  HITLER_ELECTED: "FASCIST",
  UNFINISHED: null,
};

const DAY = 24 * 60 * 60 * 1000;
let made = 0;

/**
 * A finished game of `roles` holding `terms` in order, then an `end` event: its events 1,000 ms
 * apart, `rounds` the last term's round, the seats `seatsOf` makes (with `options.players` and
 * `options.names`), a seat an execution targets dead at the end, and `outcome` with its winner.
 * Each call gets a fresh `id` and ends a day after the call before it, so counted games keep the
 * order they were made in. Named apart from `testGames.ts`'s `game`.
 */
export function gameOf(roles: Role[], terms: GameEvent[][], options: GameOptions = {}): GameRecord {
  const players = options.players ?? roles.map((_, seat) => seat + 1);
  const executed = new Set<number>();
  const events: GameEvent[] = [];
  for (const e of terms.flat()) {
    if (e.type === "execute") executed.add(e.target);
    events.push({ ...e, t: (events.length + 1) * 1000 });
  }
  const last = terms.length > 0 && terms[terms.length - 1].length > 0 ? terms[terms.length - 1][0].r : 1;
  const outcome = options.outcome ?? "LIBERAL_POLICIES";
  const end = (events.length + 1) * 1000;
  events.push(ev.end(last, end, outcome));
  const seats = seatsOf(players, roles).map((seat, i) => ({
    ...seat,
    name: options.names !== undefined && i < options.names.length ? options.names[i] : seat.name,
    alive: !executed.has(i),
  }));
  const n = ++made;
  const startedAt = makeRecord().startedAt + n * DAY;
  return makeRecord({
    id: `votes-${n}`,
    startedAt,
    endedAt: startedAt + end,
    outcome,
    winner: WINNER[outcome],
    hasCpu: seats.some((seat) => seat.cpu),
    rounds: last,
    seats,
    events,
  });
}

/** Every event of `type` in `games`, oldest game first, with the game it is in. */
export function eventsOf<T extends GameEvent["type"]>(
  games: GameRecord[],
  type: T
): { g: GameRecord; e: Extract<GameEvent, { type: T }> }[] {
  const out: { g: GameRecord; e: Extract<GameEvent, { type: T }> }[] = [];
  for (const g of games) {
    for (const e of g.events) if (e.type === type) out.push({ g, e: e as Extract<GameEvent, { type: T }> });
  }
  return out;
}

/** The sum of `f` over `items`. */
export function sum<T>(items: Iterable<T>, f: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += f(item);
  return total;
}
