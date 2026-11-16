import { humanSeats, MIN_CHANCES, rate, type Rate } from "./counting";
import type { GameRecord, Role } from "./record";
import { rounds } from "./rounds";

/**
 * ROLES & CARDS' card stats (Phase 18): the hands each player drew as president and what they
 * discarded from them, what they did with the two cards handed to them as chancellor, the vetoes
 * they asked for, and blame. Read from `rounds(record)` alone, never the raw events. CPU seats
 * credit no one, though the group's hands count theirs. A chaos policy, and an accepted veto,
 * belong to no chancellor. Pure.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** Hands by the Liberals among the three: index 0 FFF, 1 FFL, 2 FLL, 3 LLL. */
export type HandCounts = [number, number, number, number];

/** Each `HandCounts` index's hand, Fascists first. */
export const HAND_LABELS = ["FFF", "FFL", "FLL", "LLL"] as const;

/** The chancellor's two by the Liberals among them: index 0 FF, 1 FL, 2 LL. */
export type PairCounts = [number, number, number];

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
  /**
   * As chancellor handed one Liberal and one Fascist, by their role that game: the Liberal enacted
   * (hits) of the times they enacted one (chances); an accepted veto is left out; `MIN_CHANCES`.
   */
  oneOfEach: Record<Role, Rate>;
  /** Policies they enacted as chancellor, by their role that game. */
  enacted: Record<Role, { L: number; F: number }>;
  /** Vetoes they asked for as chancellor, by the two cards they held. */
  vetoes: PairCounts;
  /** Rounds whose blame is their seat: they chose a Fascist over a Liberal. */
  fascistChoices: number;
  /**
   * As a Liberal: FFF hands drawn as president, and two Fascists handed to them as chancellor,
   * whatever followed (an accepted veto too).
   */
  forced: { president: number; chancellor: number };
}

export interface CardStats {
  /** Every human player in the counted games, with zeros where they never held office. */
  byPlayer: Map<number, PlayerCards>;
  /** Every hand drawn in the counted games, CPU presidents' too. */
  hands: HandCounts;
}

/** A rate's tallies on the way. */
interface Count {
  hits: number;
  chances: number;
}

/** A player's tallies on the way. */
interface Tally {
  hands: HandCounts;
  accuracy: Count;
  deepCover: Count;
  oneOfEach: Record<Role, Count>;
  enacted: Record<Role, { L: number; F: number }>;
  vetoes: PairCounts;
  fascistChoices: number;
  forced: { president: number; chancellor: number };
}

/** A value for each role. */
const byRole = <T>(make: (role: Role) => T): Record<Role, T> => ({
  LIBERAL: make("LIBERAL"),
  FASCIST: make("FASCIST"),
  HITLER: make("HITLER"),
});

/** The Liberals among some cards. */
const liberalsIn = (cards: readonly string[]) => cards.filter((card) => card === "L").length;

/** Each human player's card stats over `counted`, and the group's hands. */
export function computeCards(counted: GameRecord[]): CardStats {
  const tallies = new Map<number, Tally>();
  const hands: HandCounts = [0, 0, 0, 0];
  for (const record of counted) {
    const playerAt = new Map<number, Tally>();
    for (const { seat, player } of humanSeats(record)) {
      let tally = tallies.get(player);
      if (!tally) {
        tally = {
          hands: [0, 0, 0, 0],
          accuracy: { hits: 0, chances: 0 },
          deepCover: { hits: 0, chances: 0 },
          oneOfEach: byRole(() => ({ hits: 0, chances: 0 })),
          enacted: byRole(() => ({ L: 0, F: 0 })),
          vetoes: [0, 0, 0],
          fascistChoices: 0,
          forced: { president: 0, chancellor: 0 },
        };
        tallies.set(player, tally);
      }
      playerAt.set(seat, tally);
    }
    const roleOf = (seat: number): Role | undefined => record.seats[seat]?.role;
    for (const round of rounds(record)) {
      if (round.blame !== null) {
        const blamed = playerAt.get(round.blame);
        if (blamed) blamed.fascistChoices++;
      }
      const chancellor = round.chancellor === null ? undefined : playerAt.get(round.chancellor);
      const chancellorRole = round.chancellor === null ? undefined : roleOf(round.chancellor);
      if (chancellor && chancellorRole && round.enacted?.by === "chancellor") {
        chancellor.enacted[chancellorRole][round.enacted.policy]++;
      }
      const pair = round.chancellorHand;
      if (chancellor && chancellorRole && pair !== null && pair.length === 2) {
        const liberals = liberalsIn(pair);
        if (round.veto !== null) chancellor.vetoes[liberals]++;
        if (liberals === 0 && chancellorRole === "LIBERAL") chancellor.forced.chancellor++;
        if (liberals === 1 && round.enacted?.by === "chancellor") {
          const mixed = chancellor.oneOfEach[chancellorRole];
          mixed.chances++;
          if (round.enacted.policy === "L") mixed.hits++;
        }
      }

      const { hand, discard } = round;
      // A round counts only with both: a record restored mid-term can start after the draw.
      if (hand === null || discard === null || hand.length !== 3) continue;
      const liberals = liberalsIn(hand);
      hands[liberals]++;
      const president = playerAt.get(round.president);
      if (!president) continue;
      president.hands[liberals]++;
      const liberal = roleOf(round.president) === "LIBERAL";
      if (liberals === 0 && liberal) president.forced.president++;
      if (liberals === 1 || liberals === 2) {
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
      oneOfEach: byRole((role) => rate(tally.oneOfEach[role].hits, tally.oneOfEach[role].chances, MIN_CHANCES)),
      enacted: tally.enacted,
      vetoes: tally.vetoes,
      fascistChoices: tally.fascistChoices,
      forced: tally.forced,
    });
  }
  return { byPlayer, hands };
}
