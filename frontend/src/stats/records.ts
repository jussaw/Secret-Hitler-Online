import {
  dayLabel,
  monthKey,
  monthLabel,
  sessionSummaries,
  weekKey,
  weekLabel,
  type Label,
  type SessionSummary,
} from "./activity";
import { humanSeats, seatWon } from "./counting";
import type { EloResult } from "./elo";
import { localDayKey, viewerTimeZone } from "./format";
import { playerOfTheMonth, winStreaks, type StreakRun } from "./overview";
import type { GameRecord, Side } from "./record";

/**
 * RECORDS' numbers (the spec's "RECORDS"): the longest streaks, each player's best week and
 * month, the player of the month and its history, the longest game nights, the highest peak
 * rating and the biggest upset. Each player's
 * streaks are OVERVIEW's `winStreaks`, and the player of the month (this month's and each
 * completed month's) its `playerOfTheMonth`, so the two tabs share one rule. Every period counts
 * a game by its start, in the viewer's time zone (or the one passed in, so tests pin one). Pure:
 * `now` is passed in.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** How many of the longest sessions the records list. */
export const TOP_SESSIONS = 5;

/** A streak with the long day labels of its first and its last game's start. */
export interface Streak extends StreakRun {
  from: string;
  to: string;
}

/** A player's best week or month: its labels and the wins in it. */
export interface BestPeriod extends Label {
  wins: number;
}

/** A player's records. Phase 22 reads `current`, `longestWin` and `longestLoss`. */
export interface PlayerRecords {
  games: number;
  /** The wins in a row that end their counted games, or minus the losses in a row that do. */
  current: number;
  longestWin: Streak | null;
  longestLoss: Streak | null;
  /** The week with the most wins (Monday to Sunday), the later of a tie; null without a win. */
  bestWeek: BestPeriod | null;
  /** The month with the most wins, the later of a tie; null without a win. */
  bestMonth: BestPeriod | null;
}

/** A month's player of the month: every tied player and their wins, `[]` and 0 when nobody won. */
export interface MonthHolder extends Label {
  players: number[];
  wins: number;
}

/**
 * The win least expected: the winners' chance before the game (`E` for a Liberal win, `1 − E`
 * for a Fascist one), and `change`, what each winner gained and each loser lost. `winners` and
 * `losers` are the game's human players, ascending.
 */
export interface Upset {
  gameId: string;
  endedAt: number;
  winner: Side;
  chance: number;
  change: number;
  winners: number[];
  losers: number[];
}

/** The highest peak rating, rounded, and every player whose rounded peak is that. */
export interface HighestPeak {
  players: number[];
  rating: number;
}

export interface RecordStats {
  /** Every human player of a counted game, by number. */
  byPlayer: Map<number, PlayerRecords>;
  /** The longest streaks across players, a tie going to the one that ended later. */
  longestWin: Streak | null;
  longestLoss: Streak | null;
  /** This local month's: `playerOfTheMonth(counted, now, timeZone)`. */
  playerOfTheMonth: MonthHolder;
  /** Each completed month with a holder, newest first. */
  monthHistory: MonthHolder[];
  /** The sessions with the most games, at most `TOP_SESSIONS`, a tie going to the later one. */
  topSessions: SessionSummary[];
  /** Null when no one is rated. */
  highestPeak: HighestPeak | null;
  /** The lowest winners' chance among games a person won, a tie going to the later game; null when none. */
  biggestUpset: Upset | null;
}

/** The period with the most wins, the later of a tie (keys sort as text), or null. */
function bestOf(wins: Map<string, number>, label: (key: string) => Label): BestPeriod | null {
  let best: [string, number] | null = null;
  for (const [key, count] of wins) {
    if (best === null || count > best[1] || (count === best[1] && key > best[0])) best = [key, count];
  }
  return best === null ? null : { ...label(best[0]), wins: best[1] };
}

/** The longer of two streaks, a tie going to the one whose last game is later (`order`). */
function longer(a: Streak | null, b: Streak | null, order: Map<string, number>): Streak | null {
  if (a === null) return b;
  if (b === null) return a;
  if (a.length !== b.length) return a.length > b.length ? a : b;
  return order.get(b.lastGameId)! > order.get(a.lastGameId)! ? b : a;
}

/** The highest rounded peak in `elo`, and the players at it, ascending. */
function highestPeakOf(elo: EloResult): HighestPeak | null {
  let rating = -Infinity;
  elo.ratings.forEach((r) => {
    rating = Math.max(rating, Math.round(r.peak));
  });
  if (rating === -Infinity) return null;
  const players = Array.from(elo.ratings.values())
    .filter((r) => Math.round(r.peak) === rating)
    .map((r) => r.player)
    .sort((a, b) => a - b);
  return { players, rating };
}

/**
 * The counted game a person won with the lowest chance, by its Elo, a tie going to the later game
 * in counted order. Games with no Elo, and games won by CPU seats alone, are left out.
 */
function biggestUpsetOf(counted: GameRecord[], elo: EloResult): Upset | null {
  let best: Upset | null = null;
  for (const record of counted) {
    const game = elo.games.get(record.id);
    if (!game || record.winner === null) continue;
    const winners: number[] = [];
    const losers: number[] = [];
    for (const { seat, player } of humanSeats(record)) (seatWon(record, seat) ? winners : losers).push(player);
    if (winners.length === 0) continue;
    const chance = record.winner === "LIBERAL" ? game.expectedLiberal : 1 - game.expectedLiberal;
    if (best !== null && chance > best.chance) continue;
    best = {
      gameId: record.id,
      endedAt: record.endedAt,
      winner: record.winner,
      chance,
      change: Math.abs(game.liberalChange),
      winners: winners.sort((a, b) => a - b),
      losers: losers.sort((a, b) => a - b),
    };
  }
  return best;
}

/** Every RECORDS number for the counted games (oldest first), seen at `now` in `timeZone`. */
export function computeRecords(
  counted: GameRecord[],
  elo: EloResult,
  now: number,
  timeZone: string = viewerTimeZone()
): RecordStats {
  const order = new Map<string, number>();
  const days = new Map<string, string>();
  counted.forEach((record, index) => {
    order.set(record.id, index);
    days.set(record.id, localDayKey(record.startedAt, timeZone));
  });
  const longDay = (gameId: string) => dayLabel(days.get(gameId)!).long;
  const dated = (run: StreakRun | null): Streak | null =>
    run === null ? null : { ...run, from: longDay(run.firstGameId), to: longDay(run.lastGameId) };

  // Each player's wins per week and month, and the losses in a row that end their games (read
  // from the last game back, until their last win).
  const weekWins = new Map<number, Map<string, number>>();
  const monthWins = new Map<number, Map<string, number>>();
  for (const record of counted) {
    const day = days.get(record.id)!;
    for (const { seat, player } of humanSeats(record)) {
      if (!seatWon(record, seat)) continue;
      for (const [wins, key] of [
        [weekWins, weekKey(day)],
        [monthWins, monthKey(day)],
      ] as const) {
        let periods = wins.get(player);
        if (!periods) {
          periods = new Map();
          wins.set(player, periods);
        }
        periods.set(key, (periods.get(key) ?? 0) + 1);
      }
    }
  }
  const lastLosses = new Map<number, number>();
  const settled = new Set<number>();
  for (let i = counted.length - 1; i >= 0; i--) {
    const record = counted[i];
    for (const { seat, player } of humanSeats(record)) {
      if (settled.has(player)) continue;
      if (seatWon(record, seat)) settled.add(player);
      else lastLosses.set(player, (lastLosses.get(player) ?? 0) + 1);
    }
  }

  const byPlayer = new Map<number, PlayerRecords>();
  let longestWin: Streak | null = null;
  let longestLoss: Streak | null = null;
  const streaks = winStreaks(counted);
  for (const player of Array.from(streaks.keys()).sort((a, b) => a - b)) {
    const { games, current, longestWin: win, longestLoss: loss } = streaks.get(player)!;
    const records: PlayerRecords = {
      games,
      current: current > 0 ? current : -(lastLosses.get(player) ?? 0),
      longestWin: dated(win),
      longestLoss: dated(loss),
      bestWeek: bestOf(weekWins.get(player) ?? new Map(), weekLabel),
      bestMonth: bestOf(monthWins.get(player) ?? new Map(), monthLabel),
    };
    byPlayer.set(player, records);
    longestWin = longer(longestWin, records.longestWin, order);
    longestLoss = longer(longestLoss, records.longestLoss, order);
  }

  // The player of the month: this month's at `now`, and each completed month's at its latest
  // counted start, so both follow OVERVIEW's rule.
  const holder = (month: string, at: number): MonthHolder | null => {
    const leaders = playerOfTheMonth(counted, at, timeZone);
    return leaders === null ? null : { ...monthLabel(month), players: leaders.players, wins: leaders.value };
  };
  const thisMonth = monthKey(localDayKey(now, timeZone));
  const latestStart = new Map<string, number>();
  for (const record of counted) {
    const month = monthKey(days.get(record.id)!);
    if (month < thisMonth) latestStart.set(month, Math.max(latestStart.get(month) ?? -Infinity, record.startedAt));
  }
  const monthHistory = Array.from(latestStart.keys())
    .sort()
    .reverse()
    .map((month) => holder(month, latestStart.get(month)!))
    .filter((month): month is MonthHolder => month !== null);

  // The longest sessions: most games first, then the later session.
  const topSessions = sessionSummaries(counted, timeZone)
    .map((session, index) => ({ session, index }))
    .sort((a, b) => b.session.games - a.session.games || b.index - a.index)
    .slice(0, TOP_SESSIONS)
    .map(({ session }) => session);

  return {
    byPlayer,
    longestWin,
    longestLoss,
    playerOfTheMonth: holder(thisMonth, now) ?? { ...monthLabel(thisMonth), players: [], wins: 0 },
    monthHistory,
    topSessions,
    highestPeak: highestPeakOf(elo),
    biggestUpset: biggestUpsetOf(counted, elo),
  };
}
