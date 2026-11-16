import { compareNames, humanSeats, MIN_CHANCES, nameOf, rate, type Rate } from "./counting";
import type { GameRecord } from "./record";
import { formatDecisionTime, rounds } from "./rounds";

/**
 * How long each player takes to decide, from `rounds()`'s decision times, and how terms end: the
 * END TERM countdown's share, pauses and dropped connections. Also the one rule for the fastest
 * voter, which ACTIVITY shows and the Speed Demon trophy reads.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** The decisions a player's average time is shown for. */
export type Decision = "nominate" | "vote" | "discard" | "chancellor" | "power" | "endTerm";
export const DECISIONS: Decision[] = ["nominate", "vote", "discard", "chancellor", "power", "endTerm"];

/** The fastest voter (and Speed Demon) needs this many timed votes over this many counted games. */
export const MIN_TIMED_VOTES = 30,
  FASTEST_VOTER_MIN_GAMES = 8;

/** An average time: how many samples, and their average in ms (null when there are none). */
export interface Mean {
  count: number;
  ms: number | null;
}

export interface PlayerTiming {
  /** Counted games with a human seat of theirs. */
  games: number;
  /**
   * Their average time per decision. `chancellor` counts both of a chancellor's choices around a
   * refused veto; `endTerm` only the terms they ended themselves, not the countdown's.
   */
  decisions: Record<Decision, Mean>;
  /** Their nominate, discard, power and END TERM samples, pooled. */
  asPresident: Mean;
  /** Terms ended, either way, while they were president. */
  termsEnded: number;
  /** Of those, the terms the countdown ended. */
  countdownEnded: number;
  /** Times the countdown was paused in their terms. */
  pauses: number;
  /** Times their connection dropped. */
  drops: number;
}

export interface TimingStats {
  /** Every player with a human seat in a counted game, by number. */
  byPlayer: Map<number, PlayerTiming>;
  /**
   * The players with the highest `asPresident` average of those with at least `MIN_CHANCES`
   * samples, every one of a tie, by number; none when no one has enough.
   */
  slowestPresident: number[];
  /** Terms the countdown ended, of every term a human president's countdown ran in. */
  countdown: Rate;
  /** Pauses of the countdown in every counted game. */
  pauses: number;
  /** Dropped connections in every counted game. */
  drops: number;
}

/** A sum and a count, made a `Mean` at the end. */
interface Sum {
  count: number;
  total: number;
}

interface Tally {
  games: number;
  decisions: Record<Decision, Sum>;
  asPresident: Sum;
  termsEnded: number;
  countdownEnded: number;
  pauses: number;
  drops: number;
}

const sum = (): Sum => ({ count: 0, total: 0 });
const meanOf = ({ count, total }: Sum): Mean => ({ count, ms: count > 0 ? total / count : null });

/** One `make(kind)` per decision. */
function perDecision<T>(make: (kind: Decision) => T): Record<Decision, T> {
  const out = {} as Record<Decision, T>;
  for (const kind of DECISIONS) out[kind] = make(kind);
  return out;
}

function emptyTally(): Tally {
  return {
    games: 0,
    decisions: perDecision(sum),
    asPresident: sum(),
    termsEnded: 0,
    countdownEnded: 0,
    pauses: 0,
    drops: 0,
  };
}

/**
 * Every counted game's decision times, by the player whose seat decided: the president
 * nominates, discards, ends the term and (as the power's seat) uses a power; each voter votes;
 * the chancellor chooses, once more after a refused veto. A sample counts only when its seat
 * has a player and its time is known (`rounds()` leaves out CPU seats and spans across a
 * restart). A round with a CPU president adds nothing to the terms ended.
 */
export function computeTiming(counted: GameRecord[]): TimingStats {
  const tallies = new Map<number, Tally>();
  let pauses = 0;
  let drops = 0;
  for (const record of counted) {
    const playerOf = new Map<number, number>();
    for (const { seat, player } of humanSeats(record)) {
      playerOf.set(seat, player);
      if (!tallies.has(player)) tallies.set(player, emptyTally());
    }
    for (const player of new Set(playerOf.values())) tallies.get(player)!.games++;
    /** The tally of the player in `seat`, or none for a CPU seat (or no seat). */
    const tallyOf = (seat: number | null | undefined) => {
      const player = seat === null || seat === undefined ? undefined : playerOf.get(seat);
      return player === undefined ? undefined : tallies.get(player);
    };
    const add = (seat: number | null | undefined, decision: Decision, ms: number | null) => {
      const tally = tallyOf(seat);
      if (!tally || ms === null) return;
      tally.decisions[decision].count++;
      tally.decisions[decision].total += ms;
      if (decision !== "vote" && decision !== "chancellor") {
        tally.asPresident.count++;
        tally.asPresident.total += ms;
      }
    };

    for (const round of rounds(record)) {
      pauses += round.pauses;
      drops += round.disconnects.length;
      add(round.president, "nominate", round.ms.nominate);
      for (const vote of round.votes) add(vote.seat, "vote", vote.ms);
      add(round.president, "discard", round.ms.discard);
      add(round.chancellor, "chancellor", round.ms.chancellor);
      add(round.chancellor, "chancellor", round.ms.chancellorAfterVeto);
      add(round.power ? round.power.seat : round.president, "power", round.ms.power);
      if (round.endTerm?.by === "president") add(round.president, "endTerm", round.ms.endTerm);

      const president = tallyOf(round.president);
      if (president) {
        president.pauses += round.pauses;
        if (round.endTerm) {
          president.termsEnded++;
          if (round.endTerm.by === "countdown") president.countdownEnded++;
        }
      }
      for (const seat of round.disconnects) {
        const dropped = tallyOf(seat);
        if (dropped) dropped.drops++;
      }
    }
  }

  const byPlayer = new Map<number, PlayerTiming>();
  for (const player of Array.from(tallies.keys()).sort((a, b) => a - b)) {
    const tally = tallies.get(player)!;
    byPlayer.set(player, {
      games: tally.games,
      decisions: perDecision((kind) => meanOf(tally.decisions[kind])),
      asPresident: meanOf(tally.asPresident),
      termsEnded: tally.termsEnded,
      countdownEnded: tally.countdownEnded,
      pauses: tally.pauses,
      drops: tally.drops,
    });
  }

  let slowest = -Infinity;
  let slowestPresident: number[] = [];
  let countdownEnded = 0;
  let termsEnded = 0;
  for (const [player, timing] of byPlayer) {
    countdownEnded += timing.countdownEnded;
    termsEnded += timing.termsEnded;
    const { count, ms } = timing.asPresident;
    if (count < MIN_CHANCES || ms === null) continue;
    if (ms > slowest) {
      slowest = ms;
      slowestPresident = [player];
    } else if (ms === slowest) {
      slowestPresident.push(player);
    }
  }

  return { byPlayer, slowestPresident, countdown: rate(countdownEnded, termsEnded), pauses, drops };
}

/**
 * The one rule for the fastest voter and the Speed Demon trophy: of the players with at least
 * `MIN_TIMED_VOTES` timed votes and `FASTEST_VOTER_MIN_GAMES` counted games, the one with the
 * lowest average vote time; a tie goes to more timed votes, then the name. One holder, or null.
 */
export function fastestVoter(timing: TimingStats, names: Map<number, string>): number | null {
  let best: { player: number; ms: number; count: number } | null = null;
  for (const [player, theirs] of timing.byPlayer) {
    const { count, ms } = theirs.decisions.vote;
    if (count < MIN_TIMED_VOTES || theirs.games < FASTEST_VOTER_MIN_GAMES || ms === null) continue;
    const better =
      best === null ||
      ms < best.ms ||
      (ms === best.ms &&
        (count > best.count ||
          (count === best.count &&
            (compareNames(nameOf(names, player), nameOf(names, best.player)) || player - best.player) < 0)));
    if (better) best = { player, ms, count };
  }
  return best === null ? null : best.player;
}

/** An average time: one decimal under a minute ("4.2 s", at least "0.1 s"), else as one decision's. */
export function formatAverageTime(ms: number): string {
  const tenths = Math.max(1, Math.round(ms / 100));
  if (tenths >= 600) return formatDecisionTime(ms);
  return `${(tenths / 10).toFixed(1)} s`;
}
