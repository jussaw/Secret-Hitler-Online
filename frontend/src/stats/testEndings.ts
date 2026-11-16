import type { FinishedOutcome } from "./endings";
import { ev } from "./game/sampleGames";
import type { GameEvent, GameRecord, Side } from "./record";
import { game, seatsOf } from "./testGames";

/**
 * Builders for ENDINGS' tests (never imported by the page): a finished game of a chosen size,
 * outcome, length and board, and rounds of failed elections, chaos and vetoes to put in it. It
 * imports only `record.ts`, `testGames.ts`, `game/sampleGames.ts` and `endings.ts`'s types.
 */

export const MINUTE = 60_000;

const T0 = Date.UTC(2026, 10, 1, 20, 0);
const HOUR = 3_600_000;
let made = 0;

const WINNER: Record<FinishedOutcome, Side> = {
  LIBERAL_POLICIES: "LIBERAL",
  HITLER_EXECUTED: "LIBERAL",
  FASCIST_POLICIES: "FASCIST",
  HITLER_ELECTED: "FASCIST",
};

/** Each outcome's final board by default (Liberal, Fascist): none a close or a lopsided finish. */
const BOARD: Record<FinishedOutcome, [number, number]> = {
  LIBERAL_POLICIES: [5, 2],
  HITLER_EXECUTED: [2, 4],
  FASCIST_POLICIES: [2, 6],
  HITLER_ELECTED: [2, 3],
};

export interface EndedOptions {
  /** How long it lasted: 30 by default. */
  minutes?: number;
  /** 6 by default, or the events' largest `r` when they are given. */
  rounds?: number;
  /** Recorded from its start (true by default); false makes `startedAt` the restore. */
  complete?: boolean;
  /** The final board, the outcome's `BOARD` by default. */
  liberal?: number;
  fascist?: number;
  /** Its timeline before the `end`. */
  events?: GameEvent[];
}

/**
 * A finished game of `seats` seats, players 1 to `seats` (`seatsOf`'s roles), that ended by
 * `outcome`: Phase 17's `game`, with ids `e1`, `e2`, … and `endedAt` an hour apart in call
 * order, `startedAt` `minutes` before it, and a timeline of `events` then the `end`.
 */
export function ended(seats: number, outcome: FinishedOutcome, options: EndedOptions = {}): GameRecord {
  made += 1;
  const endedAt = T0 + made * HOUR;
  const length = (options.minutes ?? 30) * MINUTE;
  const before = options.events ?? [];
  const rounds = options.rounds ?? (options.events ? before.reduce((most, e) => Math.max(most, e.r), 0) : 6);
  const [liberal, fascist] = BOARD[outcome];
  const players = Array.from({ length: seats }, (_, i) => i + 1);
  return game(`e${made}`, endedAt, seatsOf(players), WINNER[outcome], {
    startedAt: endedAt - length,
    outcome,
    complete: options.complete ?? true,
    liberalPolicies: options.liberal ?? liberal,
    fascistPolicies: options.fascist ?? fascist,
    rounds,
    events: [...before, { type: "end", t: length, r: rounds, outcome }],
  });
}

// Rounds for a timeline: seat 0 president and seat 1 chancellor throughout, round `r` at `r`
// minutes. The board an `enact` carries is not kept from one round to the next.

/** Round `r`: a nomination voted down 1–4, the tracker moving to `tracker`. */
export function failed(r: number, tracker: number): GameEvent[] {
  const t = r * MINUTE;
  return [ev.nominate(r, t, 0, 1), ev.election(r, t + 1_000, false, 1, 4), ev.tracker(r, t + 1_000, tracker)];
}

/** Rounds `r` to `r + 2` voted down, the tracker at 1, 2 and 3, then `L` enacted by chaos in `r + 2`. */
export function chaosRun(r: number): GameEvent[] {
  return [
    ...failed(r, 1),
    ...failed(r + 1, 2),
    ...failed(r + 2, 3),
    ev.enact(r + 2, (r + 2) * MINUTE + 2_000, "L", "chaos", undefined, 1, 0),
  ];
}

/**
 * Round `r`: a government voted in 3–2, `LFF` drawn and the `L` discarded, then the chancellor's
 * veto and the president's answer. Accepted, the tracker moves to `tracker`, and at 3 `L` is
 * enacted by chaos in round `r`; refused, the chancellor enacts `F`.
 */
export function vetoed(r: number, accepted: boolean, tracker = 1): GameEvent[] {
  const t = r * MINUTE;
  const events: GameEvent[] = [
    ev.nominate(r, t, 0, 1),
    ev.election(r, t + 1_000, true, 3, 2),
    ev.draw(r, t + 2_000, 0, "LFF"),
    ev.discard(r, t + 3_000, 0, 0, "L"),
    ev.veto(r, t + 4_000, 1),
    ev.vetoAnswer(r, t + 5_000, 0, accepted),
  ];
  if (!accepted) return [...events, ev.enact(r, t + 6_000, "F", "chancellor", 1, 0, 1)];
  events.push(ev.tracker(r, t + 5_000, tracker));
  if (tracker === 3) events.push(ev.enact(r, t + 6_000, "L", "chaos", undefined, 1, 0));
  return events;
}
