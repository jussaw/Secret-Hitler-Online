import {
  compareNames,
  humanSeats,
  localDaysBetween,
  MIN_GAMES,
  nameOf,
  rankRows,
  rate,
  seatWon,
  type Rate,
  type Row,
} from "./counting";
import { ELO_START, PROVISIONAL_GAMES } from "./elo";
import { formatLocalDateTime, localDayKey, outcomeLabel } from "./format";
import { formatRating, formatSigned } from "./numbers";
import type { GameRecord } from "./record";
import type { StatsContext } from "./useStats";

/**
 * Every number OVERVIEW shows (the spec's "OVERVIEW"), from the counted games and their Elo: the
 * dashboard, the power ranking, the rating history, the headline numbers and the latest games.
 * `winStreaks` and `playerOfTheMonth` are RECORDS' too (Phase 21B imports them), so the two tabs
 * share one rule. Pure: `now` and the time zone are passed in.
 */

/** "Within 7 days": a player's last counted game started at most this long before `now`. */
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
/** How many games the latest games list. */
export const LATEST_GAMES = 10;
/** The hot hand looks at a player's last this many counted games… */
export const HOT_HAND_GAMES = 5;
/** …and needs at least this many wins among them. */
export const HOT_HAND_WINS = 3;

/** Who leads a dashboard stat, every tied player shown, and their value. */
export interface Leaders {
  players: number[];
  value: number;
}

/** A run of wins or losses in a row: its player, its length and its first and last game. */
export interface StreakRun {
  player: number;
  length: number;
  firstGameId: string;
  lastGameId: string;
}

/** A player's counted games, their current wins in a row (0 or more) and their longest runs. */
export interface PlayerStreaks {
  games: number;
  current: number;
  longestWin: StreakRun | null;
  longestLoss: StreakRun | null;
}

/** A power ranking row: `rank` null for a provisional player. */
export interface PowerRow {
  player: number;
  rank: number | null;
  rating: number;
  lastChange: number;
  games: number;
  provisional: boolean;
}

/**
 * A player's rating after a counted game: `game` is the game's index in the counted games,
 * `change` null for a game they did not play (the rating carried flat), and `provisional` while
 * they have fewer than `PROVISIONAL_GAMES` counted games after it.
 */
export interface RatingLinePoint {
  game: number;
  rating: number;
  change: number | null;
  provisional: boolean;
}

/** A player's ratings from their first counted game on. */
export interface RatingLine {
  player: number;
  points: RatingLinePoint[];
}

export interface OverviewStats {
  daysSinceLastGame: number | null;
  lastGame: GameRecord | null;
  winStreak: Leaders | null;
  hotHand: Leaders | null;
  playerOfMonth: Leaders | null;
  powerRanking: PowerRow[];
  ratingHistory: RatingLine[];
  headline: {
    games: Row<number>[];
    wins: Row<number>[];
    winRate: Row<Rate>[];
    currentStreak: Row<number>[];
    longestStreak: Row<number>[];
    liberalWins: number;
    fascistWins: number;
  };
  /** Newest first. */
  latestGames: GameRecord[];
}

/** One of a player's counted games: the game, its index in the counted games, their seat, and whether they won. */
interface PlayerResult {
  record: GameRecord;
  index: number;
  seat: number;
  won: boolean;
}

/**
 * Each player's results, in the counted games' order: the one pass over the counted games that
 * every stat here reads (`winStreaks` and `playerOfTheMonth` make it for themselves).
 */
function resultsByPlayer(counted: GameRecord[]): Map<number, PlayerResult[]> {
  const out = new Map<number, PlayerResult[]>();
  counted.forEach((record, index) => {
    for (const { seat, player } of humanSeats(record)) {
      let results = out.get(player);
      if (!results) {
        results = [];
        out.set(player, results);
      }
      results.push({ record, index, seat, won: seatWon(record, seat) });
    }
  });
  return out;
}

/** A player's streaks from their results in order: a longest run ties to the later one. */
function streaksOf(player: number, results: PlayerResult[]): PlayerStreaks {
  let longestWin: StreakRun | null = null;
  let longestLoss: StreakRun | null = null;
  let wins = 0;
  let losses = 0;
  let firstWin = "";
  let firstLoss = "";
  for (const { record, won } of results) {
    if (won) {
      if (wins === 0) firstWin = record.id;
      wins++;
      losses = 0;
      if (!longestWin || wins >= longestWin.length) {
        longestWin = { player, length: wins, firstGameId: firstWin, lastGameId: record.id };
      }
    } else {
      if (losses === 0) firstLoss = record.id;
      losses++;
      wins = 0;
      if (!longestLoss || losses >= longestLoss.length) {
        longestLoss = { player, length: losses, firstGameId: firstLoss, lastGameId: record.id };
      }
    }
  }
  return { games: results.length, current: wins, longestWin, longestLoss };
}

/** Every player's streaks from their results. */
function streaksFrom(results: Map<number, PlayerResult[]>): Map<number, PlayerStreaks> {
  const out = new Map<number, PlayerStreaks>();
  results.forEach((list, player) => out.set(player, streaksOf(player, list)));
  return out;
}

/**
 * Each player's streaks over the counted games, in order (oldest first): their counted games, the
 * wins in a row up to their last game, and their longest winning and losing runs, a tie going to
 * the later run. Only players with a counted game, never a CPU seat.
 */
export function winStreaks(counted: GameRecord[]): Map<number, PlayerStreaks> {
  return streaksFrom(resultsByPlayer(counted));
}

/**
 * How tied players are listed: more counted games (in `results`) first, then `name` by
 * `compareNames`, then number.
 */
function byGamesThenName(results: Map<number, PlayerResult[]>, name: (player: number) => string) {
  const games = (player: number) => results.get(player)?.length ?? 0;
  return (a: number, b: number) => games(b) - games(a) || compareNames(name(a), name(b)) || a - b;
}

/** The players with the highest `value`, every tied one, in `order`; null when there are none. */
function leadersOf(values: Map<number, number>, order: (a: number, b: number) => number): Leaders | null {
  if (values.size === 0) return null;
  let value = -Infinity;
  values.forEach((v) => {
    if (v > value) value = v;
  });
  const players = Array.from(values.keys())
    .filter((player) => values.get(player) === value)
    .sort(order);
  return { players, value };
}

/** A start's local month, `YYYY-MM`, in `timeZone`. */
function monthOf(ms: number, timeZone?: string): string {
  return localDayKey(ms, timeZone).slice(0, 7);
}

/** `playerOfTheMonth` from the players' results. */
function playerOfTheMonthFrom(results: Map<number, PlayerResult[]>, now: number, timeZone?: string): Leaders | null {
  const month = monthOf(now, timeZone);
  const wins = new Map<number, number>();
  results.forEach((list, player) => {
    const won = list.filter((r) => r.won && monthOf(r.record.startedAt, timeZone) === month).length;
    if (won > 0) wins.set(player, won);
  });
  const latestSeatName = (player: number) => {
    const list = results.get(player)!;
    const { record, seat } = list[list.length - 1];
    return record.seats[seat].name;
  };
  return leadersOf(wins, byGamesThenName(results, latestSeatName));
}

/**
 * The player of the month: the most wins among the counted games that started in `now`'s local
 * month in `timeZone` (the viewer's by default), including any that started after `now`, so a
 * completed month's holder is this for its latest start. Null when no person won a game that
 * month. Tied players are all shown: more counted games first, then the name on their latest
 * counted seat, then number.
 */
export function playerOfTheMonth(counted: GameRecord[], now: number, timeZone?: string): Leaders | null {
  return playerOfTheMonthFrom(resultsByPlayer(counted), now, timeZone);
}

/**
 * The lines a rating point's tooltip shows: the player's name, the game's start (as every date on
 * the stats pages) and result, then the change and the rating after it, or "Did not play" and the
 * rating carried through the game.
 */
export function ratingPointDetail(game: GameRecord, name: string, point: RatingLinePoint, timeZone?: string): string[] {
  return [
    name,
    `${formatLocalDateTime(game.startedAt, timeZone)} · ${outcomeLabel(game)}`,
    point.change === null
      ? `Did not play · ${formatRating(point.rating)}`
      : `${formatSigned(point.change)} → ${formatRating(point.rating)}`,
  ];
}

/** Every OVERVIEW number for the counted games in `stats`, seen at `now` in `timeZone`. */
export function computeOverview(stats: StatsContext, now: number, timeZone?: string): OverviewStats {
  const { counted, elo, names } = stats;
  const last = counted.length > 0 ? counted[counted.length - 1] : null;
  const results = resultsByPlayer(counted);
  const streaks = streaksFrom(results);
  const tied = byGamesThenName(results, (player) => nameOf(names, player));

  // The dashboard's leaders: players whose last counted game started within RECENT_MS of now.
  const current = new Map<number, number>();
  const hot = new Map<number, number>();
  results.forEach((list, player) => {
    if (now - list[list.length - 1].record.startedAt > RECENT_MS) return;
    const streak = streaks.get(player)!.current;
    if (streak > 0) current.set(player, streak);
    if (list.length >= HOT_HAND_GAMES) {
      const wins = list.slice(-HOT_HAND_GAMES).filter((r) => r.won).length;
      if (wins >= HOT_HAND_WINS) hot.set(player, wins);
    }
  });

  // The power ranking: settled players ranked on rounded ratings, then the provisional ones by
  // rounded rating, then more games, then name.
  const rated = Array.from(elo.ratings.values());
  const shown = (player: number) => Math.round(elo.ratings.get(player)!.rating);
  const settled = rankRows(
    rated.filter((r) => !r.provisional).map((r) => ({ player: r.player, value: shown(r.player), count: r.games })),
    (a, b) => b - a,
    names,
    0
  );
  const provisionalOrder = (a: number, b: number) =>
    shown(b) - shown(a) ||
    elo.ratings.get(b)!.games - elo.ratings.get(a)!.games ||
    compareNames(nameOf(names, a), nameOf(names, b)) ||
    a - b;
  const provisional = rated
    .filter((r) => r.provisional)
    .map((r) => r.player)
    .sort(provisionalOrder);
  const powerRanking: PowerRow[] = [
    ...settled.map((row) => ({ player: row.player, rank: row.rank })),
    ...provisional.map((player) => ({ player, rank: null })),
  ].map(({ player, rank }) => {
    const r = elo.ratings.get(player)!;
    return { player, rank, rating: r.rating, lastChange: r.lastChange, games: r.games, provisional: r.provisional };
  });

  // The rating history: each player from their first counted game, carried through the rest.
  const ratingHistory: RatingLine[] = Array.from(results.keys())
    .sort((a, b) => a - b)
    .map((player) => {
      const list = results.get(player)!;
      const played = new Set(list.map((r) => r.index));
      const points: RatingLinePoint[] = [];
      let before = ELO_START;
      let games = 0;
      for (let i = list[0].index; i < elo.history.length; i++) {
        const rating = elo.history[i].ratings.get(player) ?? before;
        const plays = played.has(i);
        if (plays) games++;
        points.push({ game: i, rating, change: plays ? rating - before : null, provisional: games < PROVISIONAL_GAMES });
        before = rating;
      }
      return { player, points };
    });

  // The headline numbers: a row per player, their counted games the count.
  const rows = <T>(value: (list: PlayerResult[], player: number) => T) =>
    Array.from(results.entries()).map(([player, list]) => ({ player, value: value(list, player), count: list.length }));
  /** Most first, every player ranked. */
  const most = (value: (list: PlayerResult[], player: number) => number) => rankRows(rows(value), (a, b) => b - a, names, 0);
  const winsOf = (list: PlayerResult[]) => list.filter((r) => r.won).length;
  const winRates = rows((list) => rate(winsOf(list), list.length, MIN_GAMES));

  return {
    daysSinceLastGame: last ? Math.max(0, localDaysBetween(last.endedAt, now, timeZone)) : null,
    lastGame: last,
    winStreak: leadersOf(current, tied),
    hotHand: leadersOf(hot, tied),
    playerOfMonth: playerOfTheMonthFrom(results, now, timeZone),
    powerRanking,
    ratingHistory,
    headline: {
      games: most((list) => list.length),
      wins: most(winsOf),
      winRate: rankRows(winRates, (a, b) => (b.value ?? -1) - (a.value ?? -1), names, MIN_GAMES),
      currentStreak: most((_, player) => streaks.get(player)!.current),
      longestStreak: most((_, player) => streaks.get(player)!.longestWin?.length ?? 0),
      liberalWins: counted.filter((g) => g.winner === "LIBERAL").length,
      fascistWins: counted.filter((g) => g.winner === "FASCIST").length,
    },
    latestGames: counted.slice(-LATEST_GAMES).reverse(),
  };
}
