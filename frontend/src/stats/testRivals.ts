import { ev } from "./game/sampleGames";
import type { GameEvent, GameRecord, Role, Side } from "./record";
import { game, seatsOf } from "./testGames";
import { buildStats, type StatsContext } from "./useStats";

/**
 * Builders for RIVALS' and ENDINGS' tests (never imported by the page or the browser tests): ten
 * named players, games of chosen seats and sides, a round's nomination, and the tabs' stats.
 */

/** Players 1 to 10, in alphabetical order. */
export const NAMES = new Map<number, string>(
  ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus", "Hal", "Ivy", "Jo"].map((name, i) => [i + 1, name])
);

/** `n` results of `make`, each made by its own call. */
export function repeat<T>(n: number, make: () => T): T[] {
  return Array.from({ length: n }, () => make());
}

/** When the first built game ends; each next one ends an hour later. */
export const T0 = Date.UTC(2026, 10, 1, 20, 0);
export const HOUR = 3_600_000;
let made = 0;

/** The largest `r` among `events`: the round a timeline ends in. */
export function lastRound(events: GameEvent[]): number {
  return events.reduce((most, e) => Math.max(most, e.r), 0);
}

/**
 * A finished game of `seats` (a player, or null for a CPU seat, and a role each, in turn order)
 * that `winner` won: Phase 17's `game`, with ids `g1`, `g2`, … and `endedAt` an hour apart in call
 * order. Given `events`, it holds them in place of its lone `end`, and its `rounds` is their
 * largest `r`.
 */
export function played(seats: [number | null, Role][], winner: Side, events?: GameEvent[]): GameRecord {
  made += 1;
  const overrides: Partial<GameRecord> =
    events === undefined ? {} : { events, rounds: lastRound(events) };
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

/**
 * Round `r`'s nomination of the seat `chancellor` by the seat `president`, at `r` minutes: voted
 * in 3–2 when `passed`, else voted down 1–4 with the tracker moving to 1.
 */
export function nominated(r: number, president: number, chancellor: number, passed: boolean): GameEvent[] {
  const t = r * 60_000;
  return [
    ev.nominate(r, t, president, chancellor),
    passed ? ev.election(r, t, true, 3, 2) : ev.election(r, t, false, 1, 4),
    ...(passed ? [] : [ev.tracker(r, t, 1)]),
  ];
}

/** The stats of `games` with `NAMES` as the players, every player on and CPU games counted when `cpu`. */
export function statsOf(games: GameRecord[], cpu = false): StatsContext {
  const players = Array.from(NAMES, ([number, name]) => ({ number, name }));
  return buildStats({ players, games }, { players: null, cpu });
}
