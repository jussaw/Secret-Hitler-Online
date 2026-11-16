import type { GameRecord, Outcome, Role, Seat, Side } from "./record";
import { makeRecord } from "./testRecords";

/**
 * Builders of records for the stats' unit tests and browser tests (never imported by the page):
 * seats by player number, a finished or unfinished game, a two-sided match. It imports only
 * `record.ts` and `testRecords.ts`, so the browser tests can use it.
 */

const L: Role = "LIBERAL";
const F: Role = "FASCIST";
const HITLER: Role = "HITLER";

/** Each seat count's roles, Liberals first, then the Fascists, then Hitler. */
export const ROLES: Record<number, Role[]> = {
  5: [L, L, L, F, HITLER],
  6: [L, L, L, L, F, HITLER],
  7: [L, L, L, L, F, F, HITLER],
  8: [L, L, L, L, L, F, F, HITLER],
  9: [L, L, L, L, L, F, F, F, HITLER],
  10: [L, L, L, L, L, L, F, F, F, HITLER],
};

/**
 * Seats in turn order: seat `i` is player `players[i]`, named `P<number>`, or a CPU seat
 * (`null`), named `Bot <i + 1>`; roles `roles`, by default `ROLES` for the seat count; all alive.
 */
export function seatsOf(players: (number | null)[], roles: Role[] = ROLES[players.length]): Seat[] {
  return players.map((player, i) => ({
    player,
    name: player === null ? `Bot ${i + 1}` : `P${player}`,
    cpu: player === null,
    role: roles[i],
    alive: true,
  }));
}

const OUTCOME: Record<Side, Outcome> = { LIBERAL: "LIBERAL_POLICIES", FASCIST: "FASCIST_POLICIES" };

/**
 * A game of `seats` that ended at `endedAt`, 30 minutes long: won by `winner` on policies (5
 * Liberal and 1 Fascist, or 2 Liberal and 6 Fascist), or with `winner` null unfinished (2 and 1),
 * with a lone `end` event. `hasCpu` follows the seats; `overrides` replace fields whole.
 */
export function game(
  id: string,
  endedAt: number,
  seats: Seat[],
  winner: Side | null,
  overrides: Partial<GameRecord> = {}
): GameRecord {
  const startedAt = overrides.startedAt ?? endedAt - 30 * 60_000;
  const outcome: Outcome = winner === null ? "UNFINISHED" : OUTCOME[winner];
  const rounds = 8;
  return makeRecord({
    id,
    startedAt,
    endedAt,
    outcome,
    winner,
    complete: true,
    hasCpu: seats.some((seat) => seat.cpu),
    liberalPolicies: winner === "LIBERAL" ? 5 : 2,
    fascistPolicies: winner === "FASCIST" ? 6 : 1,
    rounds,
    seats,
    events: [{ type: "end", t: endedAt - startedAt, r: rounds, outcome }],
    ...overrides,
  });
}

/**
 * A finished game `side` won: `winners` seated on that side (as `LIBERAL` or `FASCIST`), then
 * `losers` on the other.
 */
export function match(id: string, endedAt: number, winners: number[], losers: number[], side: Side = "LIBERAL"): GameRecord {
  const winning: Role = side === "LIBERAL" ? L : F;
  const losing: Role = side === "LIBERAL" ? F : L;
  const seats = seatsOf([...winners, ...losers], [...winners.map(() => winning), ...losers.map(() => losing)]);
  return game(id, endedAt, seats, side);
}
