import type { StatsData } from "./record";
import { match } from "./testGames";

/**
 * OVERVIEW's test fixture (never imported by the page): four players and seven two-seat games
 * with known numbers. It imports only `record.ts` and `testGames.ts`.
 */

/** The fixture's "now": Sun 15 Nov 2026, 12:00 UTC. */
export const OVERVIEW_NOW = Date.UTC(2026, 10, 15, 12);

/** `n` days before the fixture's day, at `h` o'clock UTC: a game's end. */
export function overviewDay(n: number, h = 20): number {
  return Date.UTC(2026, 10, 15 - n, h);
}

/**
 * Players 1 Ann, 2 Bo, 3 Cy and 9 Zed, and these games (each ending at `overviewDay(n)`, 30
 * minutes long): g01 (9 days ago) Cy beats Zed; g02 (6) Zed beats Ann as Fascist; g03 (5) and g04
 * (4) Ann beats Zed; g05 (3) Ann beats Bo as Fascist; g06 (2) Ann beats Zed; g07 (2, at 21:00) Bo
 * beats Cy. Every other game is won by the Liberals.
 *
 * So Ann has won her last four and leads the win streak, the hot hand (4 of 5) and the month;
 * Ann and Zed have five games each, and Bo and Cy, with two, are provisional.
 */
export function overviewFixture(): { data: StatsData; now: number } {
  const d = overviewDay;
  return {
    data: {
      players: [
        { number: 1, name: "Ann" },
        { number: 2, name: "Bo" },
        { number: 3, name: "Cy" },
        { number: 9, name: "Zed" },
      ],
      games: [
        match("g01", d(9), [3], [9]),
        match("g02", d(6), [9], [1], "FASCIST"),
        match("g03", d(5), [1], [9]),
        match("g04", d(4), [1], [9]),
        match("g05", d(3), [1], [2], "FASCIST"),
        match("g06", d(2), [1], [9]),
        match("g07", d(2, 21), [2], [3]),
      ],
    },
    now: OVERVIEW_NOW,
  };
}
