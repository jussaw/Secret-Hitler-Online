import { humanSeats, MIN_CHANCES, rate, type Rate } from "./counting";
import { sideOf, type GameRecord, type Side } from "./record";

/**
 * What `votes.ts` and `powers.ts` keep while they read the counted games: hits of chances on their
 * way to a `Rate`, each person's tally found from their seat in a game, and a seat's side.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** Hits of chances, on their way to a `Rate`. */
export interface Count {
  hits: number;
  chances: number;
}

/** No hits of no chances. */
export function newCount(): Count {
  return { hits: 0, chances: 0 };
}

/** One more chance, a hit when `hit`. */
export function addChance(count: Count, hit: boolean): void {
  count.chances++;
  if (hit) count.hits++;
}

/** The count as a `Rate`, its value null below `min` chances. */
export function countRate(count: Count, min: number = MIN_CHANCES): Rate {
  return rate(count.hits, count.chances, min);
}

/**
 * The game's seats that a person played, each with the player's number and their tally in
 * `tallies`, which `make` starts the first time; every tally found counts one more game.
 */
export function seatTallies<T extends { games: number }>(
  record: GameRecord,
  tallies: Map<number, T>,
  make: () => T
): Map<number, { player: number; tally: T }> {
  const out = new Map<number, { player: number; tally: T }>();
  for (const { seat, player } of humanSeats(record)) {
    let tally = tallies.get(player);
    if (!tally) {
      tally = make();
      tallies.set(player, tally);
    }
    tally.games++;
    out.set(seat, { player, tally });
  }
  return out;
}

/** The side the seat plays for (Hitler a Fascist), or null for a seat the record lacks. */
export function sideAt(record: GameRecord, seat: number): Side | null {
  const found = record.seats[seat];
  return found ? sideOf(found.role) : null;
}
