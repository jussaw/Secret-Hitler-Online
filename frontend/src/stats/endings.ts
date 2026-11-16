import { compareByEnd, MIN_GAMES, rate, type Rate } from "./counting";
import { ELO_PRIOR } from "./elo";
import type { GameRecord, Outcome } from "./record";

/**
 * ENDINGS (the spec's "ENDINGS"): how counted games are won by the number of players, the Liberal
 * win rate beside the smoothed rate the Elo handicap uses, and how long games last. Length is
 * `endedAt − startedAt` over complete games only: a record restored from a backup with no timeline
 * (`complete: false`) starts at the restore, so its length is wrong, though it counts everywhere
 * else. Pure: it reads only its argument, and gives the same result for the games in any order.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** The four ways a game is won, the Liberals' first, in the order the charts stack them. */
export const FINISHED_OUTCOMES = ["LIBERAL_POLICIES", "HITLER_EXECUTED", "FASCIST_POLICIES", "HITLER_ELECTED"] as const;
export type FinishedOutcome = (typeof FINISHED_OUTCOMES)[number];

/** Each way of winning in the chart's legend and tooltip. */
export const OUTCOME_LABELS: Record<FinishedOutcome, string> = {
  LIBERAL_POLICIES: "Liberal policies",
  HITLER_EXECUTED: "Hitler executed",
  FASCIST_POLICIES: "Fascist policies",
  HITLER_ELECTED: "Hitler elected",
};

/** Each way of winning's colour, from the game's (`variables.css`): two blues, two reds. */
export const OUTCOME_COLORS: Record<FinishedOutcome, string> = {
  LIBERAL_POLICIES: "#5a9ba6",
  HITLER_EXECUTED: "#386f8b",
  FASCIST_POLICIES: "#e8604a",
  HITLER_ELECTED: "#b4431a",
};

/** Games recorded from their start, and their average length and rounds (null with none). */
export interface LengthStats {
  games: number;
  averageMs: number | null;
  averageRounds: number | null;
}

/** The counted games with one number of seats. */
export interface SizeEndings {
  seats: number;
  games: number;
  outcomes: Record<FinishedOutcome, number>;
  liberalWins: number;
  /** The Liberal win rate, from 5 games. */
  liberalRate: Rate;
  /** The Liberal win rate the next game of this size's Elo handicap uses, at any count. */
  smoothedLiberalRate: number;
  length: LengthStats;
}

export interface EndingStats {
  /** Every size with a counted game, ascending. */
  bySize: SizeEndings[];
  /** Every size's games together. */
  length: LengthStats;
  /** The shortest game recorded from its start (ties: fewer rounds, then the earlier game). */
  fastestWin: GameRecord | null;
  /** The longest game recorded from its start (ties: more rounds, then the earlier game). */
  longestGame: GameRecord | null;
}

/**
 * The Liberal win rate pulled towards a half by `ELO_PRIOR` imaginary games each way: the `p` the
 * Elo handicap of the next game of that size uses, and a half with no games.
 */
export function smoothedLiberalRate(liberalWins: number, games: number): number {
  return (liberalWins + ELO_PRIOR) / (games + 2 * ELO_PRIOR);
}

/** One bar per size, `<seats> players`, its parts the four outcomes in `FINISHED_OUTCOMES` order. */
export function outcomeBars(stats: EndingStats): { label: string; parts: { key: string; value: number }[] }[] {
  return stats.bySize.map((size) => ({
    label: `${size.seats} players`,
    parts: FINISHED_OUTCOMES.map((key) => ({ key, value: size.outcomes[key] })),
  }));
}

function isFinished(outcome: Outcome): outcome is FinishedOutcome {
  return (FINISHED_OUTCOMES as readonly string[]).includes(outcome);
}

/** A game's length, from its start to its end. */
function lengthMs(record: GameRecord): number {
  return record.endedAt - record.startedAt;
}

/** The average length and rounds of the complete games among `games`. */
function lengthOf(games: GameRecord[]): LengthStats {
  const complete = games.filter((record) => record.complete);
  if (complete.length === 0) return { games: 0, averageMs: null, averageRounds: null };
  const ms = complete.reduce((sum, record) => sum + lengthMs(record), 0);
  const rounds = complete.reduce((sum, record) => sum + record.rounds, 0);
  return { games: complete.length, averageMs: ms / complete.length, averageRounds: rounds / complete.length };
}

/** The first of `items` by `compare` (negative: the first argument comes first), or null. */
function first<T>(items: T[], compare: (x: T, y: T) => number): T | null {
  let found: T | null = null;
  for (const item of items) if (found === null || compare(item, found) < 0) found = item;
  return found;
}

/** How the counted games ended and how long they lasted. */
export function computeEndings(counted: GameRecord[]): EndingStats {
  const finished = counted.filter((record) => isFinished(record.outcome));
  const sizes = new Map<number, GameRecord[]>();
  for (const record of finished) {
    const list = sizes.get(record.seats.length);
    if (list) list.push(record);
    else sizes.set(record.seats.length, [record]);
  }

  const bySize: SizeEndings[] = Array.from(sizes.keys())
    .sort((a, b) => a - b)
    .map((seats) => {
      const games = sizes.get(seats)!;
      const outcomes = { LIBERAL_POLICIES: 0, HITLER_EXECUTED: 0, FASCIST_POLICIES: 0, HITLER_ELECTED: 0 };
      let liberalWins = 0;
      for (const record of games) {
        outcomes[record.outcome as FinishedOutcome]++;
        if (record.winner === "LIBERAL") liberalWins++;
      }
      return {
        seats,
        games: games.length,
        outcomes,
        liberalWins,
        liberalRate: rate(liberalWins, games.length, MIN_GAMES),
        smoothedLiberalRate: smoothedLiberalRate(liberalWins, games.length),
        length: lengthOf(games),
      };
    });

  const complete = finished.filter((record) => record.complete);
  const fastestWin = first(complete, (x, y) => lengthMs(x) - lengthMs(y) || x.rounds - y.rounds || compareByEnd(x, y));
  const longestGame = first(complete, (x, y) => lengthMs(y) - lengthMs(x) || y.rounds - x.rounds || compareByEnd(x, y));

  return { bySize, length: lengthOf(finished), fastestWin, longestGame };
}
