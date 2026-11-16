import { humanSeats, MIN_CHANCES, rate, type Rate } from "./counting";
import { sideOf, type GameRecord, type Role, type Side } from "./record";
import { rounds, type Round } from "./rounds";

/**
 * VOTES & POWERS' elections and votes (the spec's "VOTES & POWERS"): each player's nominations,
 * elections and votes over the counted games, read from `rounds(record)` and the seats, never the
 * raw events. Keyed by player number: a CPU seat gets no entry, though its votes count in an
 * election's totals and its role decides who is a teammate.
 *
 * A government passes on more Ja than half the votes cast, so a tie fails: with `need =
 * floor(votes / 2) + 1`, a swing vote is a Ja in an election that passed with exactly `need` Ja, or
 * a Nein in one that failed with exactly `need - 1`. A lone dissent is the one vote of its kind in
 * an election of three or more votes. Chaos is every round whose policy the tracker enacted (a
 * third failed election, or an accepted veto with the tracker at two), counted for that round's
 * president; an accepted veto is not a failed election.
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
  /** Votes cast in elections that closed. */
  votes: number;
  /** Ja / votes. */
  ja: Rate;
  /** The same, by their role in that game. */
  jaByRole: Record<Role, Rate>;
  /** As LIBERAL: right votes / votes (Ja with no Fascist-side seat in the government, Nein with one). */
  liberalAccuracy: Rate;
  /** Fascist side: Ja / votes on governments holding a teammate other than themselves. */
  fascistLoyalty: Rate;
  /** As LIBERAL: Ja on the election that voted Hitler in (made him chancellor and ended the game). */
  votedHitlerIn: number;
  /** As LIBERAL: votes on that election. */
  hitlerElectionVotes: number;
  /** Votes that alone would have flipped the result. */
  swing: number;
  /** The one vote against all the others, in an election of three or more votes. */
  loneDissent: number;
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
  ja: Count;
  jaByRole: Record<Role, Count>;
  liberalAccuracy: Count;
  fascistLoyalty: Count;
  votedHitlerIn: number;
  hitlerElectionVotes: number;
  swing: number;
  loneDissent: number;
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
    ja: count(),
    jaByRole: { LIBERAL: count(), FASCIST: count(), HITLER: count() },
    liberalAccuracy: count(),
    fascistLoyalty: count(),
    votedHitlerIn: 0,
    hitlerElectionVotes: 0,
    swing: 0,
    loneDissent: 0,
  };
}

/** One more chance, a hit when `hit`. */
function add(c: Count, hit: boolean): void {
  c.chances++;
  if (hit) c.hits++;
}

const toRate = (c: Count): Rate => rate(c.hits, c.chances, MIN_CHANCES);

/**
 * The round whose election voted Hitler in: in a game Hitler's election won, the last round that
 * elected a Hitler chancellor (an earlier one, before three Fascist policies, let the game go on).
 */
function hitlerElection(g: GameRecord, rs: Round[]): Round | null {
  if (g.outcome !== "HITLER_ELECTED") return null;
  for (let i = rs.length - 1; i >= 0; i--) {
    const { chancellor, election } = rs[i];
    if (election?.passed && chancellor !== null && g.seats[chancellor]?.role === "HITLER") return rs[i];
  }
  return null;
}

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
    const rs = rounds(g);
    const hitlerIn = hitlerElection(g, rs);

    for (const round of rs) {
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

      // The votes, judged by the government they elected or turned down.
      const government = [round.president, round.chancellor];
      const fascistIn = government.some((seat) => side(seat) === "FASCIST");
      const n = election.ja + election.nein;
      const need = Math.floor(n / 2) + 1;
      for (const vote of round.votes) {
        const voter = playerAt.get(vote.seat);
        const role = g.seats[vote.seat]?.role;
        if (!voter || role === undefined) continue;
        add(voter.ja, vote.ja);
        add(voter.jaByRole[role], vote.ja);
        if (role === "LIBERAL") {
          add(voter.liberalAccuracy, vote.ja !== fascistIn);
          if (round === hitlerIn) {
            voter.hitlerElectionVotes++;
            if (vote.ja) voter.votedHitlerIn++;
          }
        } else if (government.some((seat) => seat !== vote.seat && side(seat) === "FASCIST")) {
          add(voter.fascistLoyalty, vote.ja);
        }
        // A swing vote: had it gone the other way, the result would have too.
        const swung = vote.ja ? election.passed && election.ja === need : !election.passed && election.ja === need - 1;
        if (swung) voter.swing++;
        if (n >= 3 && (vote.ja ? election.ja : election.nein) === 1) voter.loneDissent++;
      }
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
      votes: t.ja.chances,
      ja: toRate(t.ja),
      jaByRole: { LIBERAL: toRate(t.jaByRole.LIBERAL), FASCIST: toRate(t.jaByRole.FASCIST), HITLER: toRate(t.jaByRole.HITLER) },
      liberalAccuracy: toRate(t.liberalAccuracy),
      fascistLoyalty: toRate(t.fascistLoyalty),
      votedHitlerIn: t.votedHitlerIn,
      hitlerElectionVotes: t.hitlerElectionVotes,
      swing: t.swing,
      loneDissent: t.loneDissent,
    });
  }
  return { byPlayer };
}
