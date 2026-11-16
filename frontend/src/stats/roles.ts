import { humanSeats, MIN_GAMES, rate, type Rate } from "./counting";
import { ROLES, type GameRecord, type Role } from "./record";

/**
 * ROLES & CARDS' role stats (Phase 18): each player's split of their counted games by role, how
 * lucky the deal was, their longest run of one role. Read from each record's seats alone. Pure.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** Liberal seats at each table size. */
export const LIBERAL_SEATS: Readonly<Record<number, number>> = { 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6 };

/** The table sizes the game allows, smallest first. */
export const TABLE_SIZES = [5, 6, 7, 8, 9, 10] as const;

/** One player's role stats over the counted games. */
export interface PlayerRoles {
  /** Counted games played. */
  games: number;
  /** Games in each role (hits) of their games (chances), each needing `MIN_GAMES`. */
  split: Record<Role, Rate>;
  /** The Liberal games their tables' seats would give: Σ over their games of Liberal seats ÷ seats. */
  expectedLiberalGames: number;
  /** Their Liberal share minus `expectedLiberalGames ÷ games`; null below `MIN_GAMES`. */
  luck: number | null;
  /**
   * Most games in a row in one role, over their own games in counted order (a game they missed
   * breaks nothing); a tie goes to the later run.
   */
  longestRun: { role: Role; length: number };
}

/** Every human player in the counted games, by player number. */
export interface RoleStats {
  byPlayer: Map<number, PlayerRoles>;
}

/** A player's tallies on the way. */
interface Tally {
  games: number;
  inRole: Record<Role, number>;
  expected: number;
  run: { role: Role; length: number };
  best: { role: Role; length: number };
}

const byRole = <T>(make: () => T): Record<Role, T> => ({ LIBERAL: make(), FASCIST: make(), HITLER: make() });

/** Each human player's role stats over `counted` (already in counted order). */
export function computeRoles(counted: GameRecord[]): RoleStats {
  const tallies = new Map<number, Tally>();
  for (const record of counted) {
    const seats = record.seats.length;
    const liberalShare = (LIBERAL_SEATS[seats] ?? 0) / seats;
    for (const { seat, player } of humanSeats(record)) {
      const role = record.seats[seat].role;
      let tally = tallies.get(player);
      if (!tally) {
        tally = { games: 0, inRole: byRole(() => 0), expected: 0, run: { role, length: 0 }, best: { role, length: 0 } };
        tallies.set(player, tally);
      }
      tally.games++;
      tally.inRole[role]++;
      tally.expected += liberalShare;
      tally.run = tally.run.role === role ? { role, length: tally.run.length + 1 } : { role, length: 1 };
      if (tally.run.length >= tally.best.length) tally.best = tally.run;
    }
  }

  const byPlayer = new Map<number, PlayerRoles>();
  for (const [player, tally] of tallies) {
    const split = byRole(() => rate(0, 0, MIN_GAMES));
    for (const role of ROLES) split[role] = rate(tally.inRole[role], tally.games, MIN_GAMES);
    byPlayer.set(player, {
      games: tally.games,
      split,
      expectedLiberalGames: tally.expected,
      luck: tally.games < MIN_GAMES ? null : (tally.inRole.LIBERAL - tally.expected) / tally.games,
      longestRun: tally.best,
    });
  }
  return { byPlayer };
}
