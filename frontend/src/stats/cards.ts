import { humanSeats, MIN_CHANCES, rate, type Rate } from "./counting";
import type { GameRecord } from "./record";
import { rounds } from "./rounds";

/**
 * ROLES & CARDS' card stats (Phase 18): the hands each player drew as president and what they
 * discarded from them. Read from `rounds(record)` alone, never the raw events. CPU seats credit no
 * one, though the group's hands count theirs. Pure.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** Hands by the Liberals among the three: index 0 FFF, 1 FFL, 2 FLL, 3 LLL. */
export type HandCounts = [number, number, number, number];

/** Each `HandCounts` index's hand, Fascists first. */
export const HAND_LABELS = ["FFF", "FFL", "FLL", "LLL"] as const;

/** One player's card stats over the counted games. */
export interface PlayerCards {
  /** Hands drawn as president. */
  hands: HandCounts;
  /** As a Liberal president holding both kinds: discards of a Fascist (hits) of such hands; `MIN_CHANCES`. */
  liberalAccuracy: Rate;
  /**
   * The same for Fascist and Hitler presidents; its complement is the share of times they
   * discarded a Liberal.
   */
  deepCover: Rate;
}

export interface CardStats {
  /** Every human player in the counted games, with zeros where they never held office. */
  byPlayer: Map<number, PlayerCards>;
  /** Every hand drawn in the counted games, CPU presidents' too. */
  hands: HandCounts;
}

/** A player's tallies on the way. */
interface Tally {
  hands: HandCounts;
  accuracy: { hits: number; chances: number };
  deepCover: { hits: number; chances: number };
}

/** Each human player's card stats over `counted`, and the group's hands. */
export function computeCards(counted: GameRecord[]): CardStats {
  const tallies = new Map<number, Tally>();
  const hands: HandCounts = [0, 0, 0, 0];
  for (const record of counted) {
    const playerAt = new Map<number, Tally>();
    for (const { seat, player } of humanSeats(record)) {
      let tally = tallies.get(player);
      if (!tally) {
        tally = { hands: [0, 0, 0, 0], accuracy: { hits: 0, chances: 0 }, deepCover: { hits: 0, chances: 0 } };
        tallies.set(player, tally);
      }
      playerAt.set(seat, tally);
    }
    for (const round of rounds(record)) {
      const { hand, discard } = round;
      // A round counts only with both: a record restored mid-term can start after the draw.
      if (hand === null || discard === null || hand.length !== 3) continue;
      const liberals = hand.filter((card) => card === "L").length;
      hands[liberals]++;
      const president = playerAt.get(round.president);
      if (!president) continue;
      president.hands[liberals]++;
      if (liberals === 1 || liberals === 2) {
        const liberal = record.seats[round.president].role === "LIBERAL";
        const mixed = liberal ? president.accuracy : president.deepCover;
        mixed.chances++;
        if (discard.card === "F") mixed.hits++;
      }
    }
  }

  const byPlayer = new Map<number, PlayerCards>();
  for (const [player, tally] of tallies) {
    byPlayer.set(player, {
      hands: tally.hands,
      liberalAccuracy: rate(tally.accuracy.hits, tally.accuracy.chances, MIN_CHANCES),
      deepCover: rate(tally.deepCover.hits, tally.deepCover.chances, MIN_CHANCES),
    });
  }
  return { byPlayer, hands };
}
