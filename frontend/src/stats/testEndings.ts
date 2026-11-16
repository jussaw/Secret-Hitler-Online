import type { FinishedOutcome } from "./endings";
import type { GameEvent, GameRecord, Side } from "./record";
import { game, seatsOf } from "./testGames";

/**
 * Builders for ENDINGS' tests (never imported by the page): a finished game of a chosen size,
 * outcome, length and board. It imports only `record.ts`, `testGames.ts` and `endings.ts`'s types.
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
