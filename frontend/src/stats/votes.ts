import type { Rate } from "./counting";
import type { GameRecord, Role, Side } from "./record";
import { rounds, type Round } from "./rounds";
import { addChance, countRate, newCount, seatTallies, sideAt, type Count } from "./tallies";

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

function newTally(): Tally {
  return {
    games: 0,
    nominatedChancellor: 0,
    presidentPassed: newCount(),
    chancellorPassed: newCount(),
    teammatePick: { LIBERAL: newCount(), FASCIST: newCount() },
    failedAsPresident: 0,
    chaos: 0,
    ja: newCount(),
    jaByRole: { LIBERAL: newCount(), FASCIST: newCount(), HITLER: newCount() },
    liberalAccuracy: newCount(),
    fascistLoyalty: newCount(),
    votedHitlerIn: 0,
    hitlerElectionVotes: 0,
    swing: 0,
    loneDissent: 0,
  };
}

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
    // Each person's seat in this game, with their tally; a CPU seat has none.
    const seats = seatTallies(g, tallies, newTally);
    const tallyAt = (seat: number) => seats.get(seat)?.tally;
    const side = (seat: number) => sideAt(g, seat);
    const rs = rounds(g);
    const hitlerIn = hitlerElection(g, rs);

    for (const round of rs) {
      const president = tallyAt(round.president);
      if (round.enacted?.by === "chaos" && president) president.chaos++;
      if (round.chancellor === null) continue;

      // A nomination: its government is the president and the chancellor.
      const chancellor = tallyAt(round.chancellor);
      if (chancellor) chancellor.nominatedChancellor++;
      const presidentSide = side(round.president);
      if (president && presidentSide !== null) {
        addChance(president.teammatePick[presidentSide], side(round.chancellor) === presidentSide);
      }

      const { election } = round;
      if (election === null) continue;
      if (president) {
        addChance(president.presidentPassed, election.passed);
        if (!election.passed) president.failedAsPresident++;
      }
      if (chancellor) addChance(chancellor.chancellorPassed, election.passed);

      // The votes, judged by the government they elected or turned down.
      const government = [round.president, round.chancellor];
      const fascistIn = government.some((seat) => side(seat) === "FASCIST");
      const n = election.ja + election.nein;
      const need = Math.floor(n / 2) + 1;
      for (const vote of round.votes) {
        const voter = tallyAt(vote.seat);
        const role = g.seats[vote.seat]?.role;
        if (!voter || role === undefined) continue;
        addChance(voter.ja, vote.ja);
        addChance(voter.jaByRole[role], vote.ja);
        if (role === "LIBERAL") {
          addChance(voter.liberalAccuracy, vote.ja !== fascistIn);
          if (round === hitlerIn) {
            voter.hitlerElectionVotes++;
            if (vote.ja) voter.votedHitlerIn++;
          }
        } else if (government.some((seat) => seat !== vote.seat && side(seat) === "FASCIST")) {
          addChance(voter.fascistLoyalty, vote.ja);
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
      presidentPassed: countRate(t.presidentPassed),
      chancellorPassed: countRate(t.chancellorPassed),
      teammatePick: { LIBERAL: countRate(t.teammatePick.LIBERAL), FASCIST: countRate(t.teammatePick.FASCIST) },
      failedAsPresident: t.failedAsPresident,
      chaos: t.chaos,
      votes: t.ja.chances,
      ja: countRate(t.ja),
      jaByRole: { LIBERAL: countRate(t.jaByRole.LIBERAL), FASCIST: countRate(t.jaByRole.FASCIST), HITLER: countRate(t.jaByRole.HITLER) },
      liberalAccuracy: countRate(t.liberalAccuracy),
      fascistLoyalty: countRate(t.fascistLoyalty),
      votedHitlerIn: t.votedHitlerIn,
      hitlerElectionVotes: t.hitlerElectionVotes,
      swing: t.swing,
      loneDissent: t.loneDissent,
    });
  }
  return { byPlayer };
}
