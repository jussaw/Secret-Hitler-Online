import type { GameEvent, GameRecord, Role, Side } from "./record";
import { game, seatsOf } from "./testGames";

/**
 * Builders for RIVALS' and ENDINGS' tests (never imported by the page): ten named players, games
 * of chosen seats and sides, and a run of nominations. It imports only `record.ts` and
 * `testGames.ts`.
 */

/** Players 1 to 10, in alphabetical order. */
export const NAMES = new Map<number, string>(
  ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal", "Ivy", "Jo"].map((name, i) => [i + 1, name])
);

/** `n` results of `make`, each made by its own call. */
export function repeat<T>(n: number, make: () => T): T[] {
  return Array.from({ length: n }, () => make());
}

const T0 = Date.UTC(2026, 10, 1, 20, 0);
const HOUR = 3_600_000;
let made = 0;

/**
 * A finished game of `seats` (a player, or null for a CPU seat, and a role each, in turn order)
 * that `winner` won: Phase 17's `game`, with ids `g1`, `g2`, … and `endedAt` an hour apart in call
 * order. Given `events`, it holds them in place of its lone `end`, and its `rounds` is their
 * largest `r`.
 */
export function played(seats: [number | null, Role][], winner: Side, events?: GameEvent[]): GameRecord {
  made += 1;
  const overrides: Partial<GameRecord> =
    events === undefined ? {} : { events, rounds: events.reduce((most, e) => Math.max(most, e.r), 0) };
  return game(
    `g${made}`,
    T0 + made * HOUR,
    seatsOf(
      seats.map(([player]) => player),
      seats.map(([, role]) => role)
    ),
    winner,
    overrides
  );
}

/**
 * Five seats with `x` and `y` on `side`, which wins when `won`: Liberal `[x, y, CPU]` against a
 * CPU Fascist and a CPU Hitler, or Fascist `x` and Hitler `y` against three CPU Liberals.
 */
export function together(x: number, y: number, side: Side, won: boolean): GameRecord {
  const winner: Side = won ? side : side === "LIBERAL" ? "FASCIST" : "LIBERAL";
  return side === "LIBERAL"
    ? played([[x, "LIBERAL"], [y, "LIBERAL"], [null, "LIBERAL"], [null, "FASCIST"], [null, "HITLER"]], winner)
    : played([[x, "FASCIST"], [y, "HITLER"], [null, "LIBERAL"], [null, "LIBERAL"], [null, "LIBERAL"]], winner);
}

/** `winner` a Liberal and `loser` a Fascist, beside two CPU Liberals and a CPU Hitler; Liberals win. */
export function beats(winner: number, loser: number): GameRecord {
  return played([[winner, "LIBERAL"], [loser, "FASCIST"], [null, "LIBERAL"], [null, "LIBERAL"], [null, "HITLER"]], "LIBERAL");
}
