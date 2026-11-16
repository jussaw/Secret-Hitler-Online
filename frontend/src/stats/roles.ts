import { humanSeats, MIN_GAMES, rate, seatWon, type Rate } from "./counting";
import type { GameRecord, Role } from "./record";
import { rounds } from "./rounds";

/**
 * ROLES & CARDS' role stats (Phase 18): each player's split of their counted games by role, how
 * lucky the deal was, their longest run of one role, and their win rates by role, by table size
 * and as the first president. Read from each record's seats and winner, and its first round. Pure.
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
  /** Games won in each role (hits) of their games in it (chances), each needing `MIN_GAMES`. */
  winAs: Record<Role, Rate>;
  /** Games won at each table size of their games at it, only sizes they played, `MIN_GAMES` each. */
  bySize: Map<number, Rate>;
  /**
   * Games won of the complete games whose first round with a chancellor had their seat as
   * president (a failed election too); `MIN_GAMES`. A record with `complete: false` starts late,
   * so its first recorded nomination is not the game's first, and never counts.
   */
  firstPresident: Rate;
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
  wonAs: Record<Role, number>;
  /** Each table size's games and wins. */
  sizes: Map<number, { games: number; wins: number }>;
  firstGames: number;
  firstWins: number;
}

/** A value for each role. */
const byRole = <T>(make: (role: Role) => T): Record<Role, T> => ({
  LIBERAL: make("LIBERAL"),
  FASCIST: make("FASCIST"),
  HITLER: make("HITLER"),
});

/** Each human player's role stats over `counted` (already in counted order). */
export function computeRoles(counted: GameRecord[]): RoleStats {
  const tallies = new Map<number, Tally>();
  for (const record of counted) {
    const seats = record.seats.length;
    const liberalShare = (LIBERAL_SEATS[seats] ?? 0) / seats;
    const first = record.complete ? rounds(record).find((round) => round.chancellor !== null) : undefined;
    for (const { seat, player } of humanSeats(record)) {
      const role = record.seats[seat].role;
      const won = seatWon(record, seat);
      let tally = tallies.get(player);
      if (!tally) {
        tally = {
          games: 0,
          inRole: byRole(() => 0),
          expected: 0,
          run: { role, length: 0 },
          best: { role, length: 0 },
          wonAs: byRole(() => 0),
          sizes: new Map(),
          firstGames: 0,
          firstWins: 0,
        };
        tallies.set(player, tally);
      }
      tally.games++;
      tally.inRole[role]++;
      tally.expected += liberalShare;
      tally.run = tally.run.role === role ? { role, length: tally.run.length + 1 } : { role, length: 1 };
      if (tally.run.length >= tally.best.length) tally.best = tally.run;
      const size = tally.sizes.get(seats) ?? { games: 0, wins: 0 };
      size.games++;
      if (won) {
        tally.wonAs[role]++;
        size.wins++;
      }
      tally.sizes.set(seats, size);
      if (first !== undefined && first.president === seat) {
        tally.firstGames++;
        if (won) tally.firstWins++;
      }
    }
  }

  const byPlayer = new Map<number, PlayerRoles>();
  for (const [player, tally] of tallies) {
    const bySize = new Map<number, Rate>();
    for (const [seats, { games, wins }] of tally.sizes) bySize.set(seats, rate(wins, games, MIN_GAMES));
    byPlayer.set(player, {
      games: tally.games,
      split: byRole((role) => rate(tally.inRole[role], tally.games, MIN_GAMES)),
      expectedLiberalGames: tally.expected,
      luck: tally.games < MIN_GAMES ? null : (tally.inRole.LIBERAL - tally.expected) / tally.games,
      longestRun: tally.best,
      winAs: byRole((role) => rate(tally.wonAs[role], tally.inRole[role], MIN_GAMES)),
      bySize,
      firstPresident: rate(tally.firstWins, tally.firstGames, MIN_GAMES),
    });
  }
  return { byPlayer };
}
