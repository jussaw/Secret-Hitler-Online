import { humanSeats, MIN_CHANCES, rate, type Rate } from "./counting";
import { sideOf, type GameRecord, type Side } from "./record";
import { rounds } from "./rounds";

/**
 * VOTES & POWERS' elections and votes (the spec's "VOTES & POWERS"): each player's nominations,
 * elections and votes over the counted games, read from `rounds(record)` and the seats, never the
 * raw events. Keyed by player number: a CPU seat gets no entry, though its votes count in an
 * election's totals and its role decides who is a teammate.
 *
 * Chaos is every round whose policy the tracker enacted (a third failed election, or an accepted
 * veto with the tracker at two), counted for that round's president; an accepted veto is not a
 * failed election.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

export interface PlayerVotes {
  /** Counted games they held a seat in. */
  games: number;
  /** Nominations naming them chancellor. */
  nominatedChancellor: number;
  /** As president: passed / nominations voted on. */
  presidentPassed: Rate;
  /** As chancellor: passed / nominations voted on. */
  chancellorPassed: Rate;
  /** As president, by their side: nominations of a teammate / nominations. */
  teammatePick: Record<Side, Rate>;
  /** As president: nominations voted down. */
  failedAsPresident: number;
  /** As president: terms that ended in a chaos enact (a failed election or an accepted veto). */
  chaos: number;
}

export interface VoteStats {
  byPlayer: Map<number, PlayerVotes>;
}

/** Hits of chances, on their way to a `Rate`. */
interface Count {
  hits: number;
  chances: number;
}

interface Tally {
  games: number;
  nominatedChancellor: number;
  presidentPassed: Count;
  chancellorPassed: Count;
  teammatePick: Record<Side, Count>;
  failedAsPresident: number;
  chaos: number;
}

const count = (): Count => ({ hits: 0, chances: 0 });

function newTally(): Tally {
  return {
    games: 0,
    nominatedChancellor: 0,
    presidentPassed: count(),
    chancellorPassed: count(),
    teammatePick: { LIBERAL: count(), FASCIST: count() },
    failedAsPresident: 0,
    chaos: 0,
  };
}

/** One more chance, a hit when `hit`. */
function add(c: Count, hit: boolean): void {
  c.chances++;
  if (hit) c.hits++;
}

const toRate = (c: Count): Rate => rate(c.hits, c.chances, MIN_CHANCES);

/** Each player's elections and votes over `counted`, keyed by player number. */
export function computeVotes(counted: GameRecord[]): VoteStats {
  const tallies = new Map<number, Tally>();
  for (const g of counted) {
    // The seat-to-player map for this game: people only.
    const playerAt = new Map<number, Tally>();
    for (const { seat, player } of humanSeats(g)) {
      let tally = tallies.get(player);
      if (!tally) {
        tally = newTally();
        tallies.set(player, tally);
      }
      tally.games++;
      playerAt.set(seat, tally);
    }
    const side = (seat: number): Side | null => (g.seats[seat] ? sideOf(g.seats[seat].role) : null);

    for (const round of rounds(g)) {
      const president = playerAt.get(round.president);
      if (round.enacted?.by === "chaos" && president) president.chaos++;
      if (round.chancellor === null) continue;

      // A nomination: its government is the president and the chancellor.
      const chancellor = playerAt.get(round.chancellor);
      if (chancellor) chancellor.nominatedChancellor++;
      const presidentSide = side(round.president);
      if (president && presidentSide !== null) {
        add(president.teammatePick[presidentSide], side(round.chancellor) === presidentSide);
      }

      const { election } = round;
      if (election === null) continue;
      if (president) {
        add(president.presidentPassed, election.passed);
        if (!election.passed) president.failedAsPresident++;
      }
      if (chancellor) add(chancellor.chancellorPassed, election.passed);
    }
  }

  const byPlayer = new Map<number, PlayerVotes>();
  for (const [player, t] of tallies) {
    byPlayer.set(player, {
      games: t.games,
      nominatedChancellor: t.nominatedChancellor,
      presidentPassed: toRate(t.presidentPassed),
      chancellorPassed: toRate(t.chancellorPassed),
      teammatePick: { LIBERAL: toRate(t.teammatePick.LIBERAL), FASCIST: toRate(t.teammatePick.FASCIST) },
      failedAsPresident: t.failedAsPresident,
      chaos: t.chaos,
    });
  }
  return { byPlayer };
}
