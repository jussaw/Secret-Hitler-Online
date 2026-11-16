import { humanSeats, localDaysBetween, sessions as sessionsOf } from "./counting";
import { localDayKey, viewerTimeZone } from "./format";
import type { GameRecord } from "./record";

export { countLabel, GAME_NOUNS } from "./countLabel";

/**
 * ACTIVITY's numbers: when the group plays, in the viewer's time zone (or the one passed in, so
 * tests pin one). Every period counts a game by its start, on the wall clock of that zone: only
 * `localDayKey` and `localHour` read the zone, and weeks, months and weekdays are arithmetic on
 * the day key (`YYYY-MM-DD`), so a clock change moves no game to another day or week. Weeks start
 * on Monday. Pure: `now` is passed in. Labels are fixed English, whatever the browser's locale.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** Games over time and attendance are counted per week or per month. */
export type Grain = "week" | "month";

/** The weekly charts show at most this many weeks, the latest last. */
export const WEEKS_SHOWN = 52;

/** A period's or day's key, its short label (under a bar) and its long one (a tooltip, a line). */
export interface Label {
  key: string;
  label: string;
  long: string;
}

/** A week or a month: its games, every game up to its end, and each player's games in it. */
export interface Period extends Label {
  games: number;
  cumulative: number;
  /** Players with a game in the period, by number. */
  byPlayer: Map<number, number>;
}

/** A player's counted games, their share of every counted game, and when their last one ended. */
export interface PlayerActivity {
  games: number;
  share: number;
  lastEndedAt: number;
}

/** The heatmap's first view: the 365 days ending on the latest game's start day. */
export const LAST_12_MONTHS = "last-12-months";

/** A day, week or month with its games. */
export interface Counted extends Label {
  games: number;
}

/** A session: its games, its earliest start and latest end, and the long label of its first day. */
export interface SessionSummary {
  games: number;
  startedAt: number;
  endedAt: number;
  day: string;
}

/** The days between one session's end and the next one's start, and those two days' long labels. */
export interface Gap {
  days: number;
  from: string;
  to: string;
}

/** A day of a heatmap: its games and its shade, 0 for none, else quarters of the busiest day. */
export interface HeatmapDay extends Label {
  games: number;
  shade: 0 | 1 | 2 | 3 | 4;
}

/** One view of the calendar: the last 12 months, or a year. */
export interface Heatmap {
  id: string;
  label: string;
  days: HeatmapDay[];
  /** The most games on one day of the view, 0 when it has none. */
  busiest: number;
  /** The long label of that day (the later of a tie), or null. */
  busiestDay: string | null;
  games: number;
  /** Days with a game. */
  activeDays: number;
}

export interface ActivityStats {
  /** Every human player of a counted game, by number. `share` is games over all counted games. */
  byPlayer: Map<number, PlayerActivity>;
  periods: Record<Grain, Period[]>;
  /** `LAST_12_MONTHS` first, then each year with a game, newest first. */
  heatmaps: Heatmap[];
  /** Games started on each day of the week, Monday first. */
  byWeekday: number[];
  /** Games started in each hour of the day, 0 to 23. */
  byHour: number[];
  /** The average is games per session; `most` is the session with the most games (the later of a tie). */
  sessions: { count: number; average: number | null; most: SessionSummary | null };
  /** The day, week and month with the most games started (the later of a tie). */
  busiest: { day: Counted | null; week: Counted | null; month: Counted | null };
  /** The most whole local days between a session's end and the next one's start (the later of a tie). */
  longestGap: Gap | null;
  /** Whole local days from the last counted game's end to `now`, never below 0. */
  daysSinceLast: number | null;
}

/** The months' names as the stats write them, January first. */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const hourFormatters = new Map<string, Intl.DateTimeFormat>();

/** The hour `ms` falls in on `timeZone`'s wall clock, 0 to 23. */
export function localHour(ms: number, timeZone: string): number {
  let format = hourFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "numeric" });
    hourFormatters.set(timeZone, format);
  }
  const hour = format.formatToParts(ms).find((part) => part.type === "hour");
  return Number(hour?.value ?? 0) % 24;
}

/** A day key's year, month (1 to 12) and day. */
function dayParts(dayKey: string): [number, number, number] {
  const [year, month, day] = dayKey.split("-").map(Number);
  return [year, month, day];
}

/** A day key's midnight as a UTC date, for arithmetic that no time zone moves. */
function utcDate(dayKey: string): Date {
  const [year, month, day] = dayParts(dayKey);
  return new Date(Date.UTC(year, month - 1, day));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The day key of a UTC date. */
function keyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The day of the week of a day key: 0 is Monday, 6 Sunday. */
export function weekdayOf(dayKey: string): number {
  return (utcDate(dayKey).getUTCDay() + 6) % 7;
}

/** The day key `days` after `dayKey` (before it, when negative). */
export function addDays(dayKey: string, days: number): string {
  const [year, month, day] = dayParts(dayKey);
  return keyOf(new Date(Date.UTC(year, month - 1, day + days)));
}

/** A day's week, as the day key of its Monday. */
export function weekKey(dayKey: string): string {
  return addDays(dayKey, -weekdayOf(dayKey));
}

/** A day's month: `"2026-11"`. */
export function monthKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** The month key after `key`. */
function nextMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
}

/** A day: `14 Nov`, and `Sat 14 Nov 2026`. */
export function dayLabel(key: string): Label {
  const [year, month, day] = dayParts(key);
  return { key, label: `${day} ${MONTHS[month - 1]}`, long: `${WEEKDAYS[weekdayOf(key)]} ${day} ${MONTHS[month - 1]} ${year}` };
}

/** A week, by its Monday's key: `9 Nov`, and `Week of 9 Nov 2026`. */
export function weekLabel(key: string): Label {
  const [year, month, day] = dayParts(key);
  return { key, label: `${day} ${MONTHS[month - 1]}`, long: `Week of ${day} ${MONTHS[month - 1]} ${year}` };
}

/** A month: `Nov 2026`, and `November 2026`. */
export function monthLabel(key: string): Label {
  const [year, month] = key.split("-").map(Number);
  return { key, label: `${MONTHS[month - 1]} ${year}`, long: `${MONTH_NAMES[month - 1]} ${year}` };
}

/** A day of the week, 0 for Monday: `Mon`, and `Monday`. */
export function weekdayLabel(weekday: number): Label {
  return { key: String(weekday), label: WEEKDAYS[weekday], long: WEEKDAY_NAMES[weekday] };
}

/** An hour of the day, 0 to 23: `21`, and `21:00 to 22:00`. */
export function hourLabel(hour: number): Label {
  return { key: String(hour), label: pad(hour), long: `${pad(hour)}:00 to ${pad((hour + 1) % 24)}:00` };
}

/** A counted game as ACTIVITY reads it: its record, its start's day key and hour, its players. */
interface Dated {
  record: GameRecord;
  day: string;
  hour: number;
  players: number[];
}

/** Each game's start read once, in the zone. */
function dated(counted: GameRecord[], timeZone: string): Dated[] {
  return counted.map((record) => ({
    record,
    day: localDayKey(record.startedAt, timeZone),
    hour: localHour(record.startedAt, timeZone),
    players: Array.from(new Set(humanSeats(record).map((seat) => seat.player))),
  }));
}

/** A map with its entries in ascending key order. */
function byNumber<T>(map: Map<number, T>): Map<number, T> {
  return new Map(Array.from(map.entries()).sort((a, b) => a[0] - b[0]));
}

/**
 * Consecutive periods from `first` to `last` (keys that sort as text), each with its games and
 * every game up to its end; `earlier` games came before `first`.
 */
function periodsBetween(
  games: Dated[],
  first: string,
  last: string,
  keyOfDay: (day: string) => string,
  next: (key: string) => string,
  label: (key: string) => Label
): Period[] {
  const counts = new Map<string, { games: number; byPlayer: Map<number, number> }>();
  let earlier = 0;
  for (const game of games) {
    const key = keyOfDay(game.day);
    if (key < first) {
      earlier++;
      continue;
    }
    let count = counts.get(key);
    if (!count) {
      count = { games: 0, byPlayer: new Map() };
      counts.set(key, count);
    }
    count.games++;
    for (const player of game.players) count.byPlayer.set(player, (count.byPlayer.get(player) ?? 0) + 1);
  }
  const out: Period[] = [];
  let cumulative = earlier;
  for (let key = first; key <= last; key = next(key)) {
    const count = counts.get(key);
    const games = count?.games ?? 0;
    cumulative += games;
    out.push({ ...label(key), games, cumulative, byPlayer: count ? byNumber(count.byPlayer) : new Map() });
  }
  return out;
}

/** The earliest and the latest of `keys`, or null when there are none. */
function range(keys: string[]): [string, string] | null {
  if (keys.length === 0) return null;
  let first = keys[0];
  let last = keys[0];
  for (const key of keys) {
    if (key < first) first = key;
    if (key > last) last = key;
  }
  return [first, last];
}

/**
 * The counted games' sessions (`counting.ts`'s `sessions`), in play order: each one's games, its
 * earliest start, its latest end, and the long label of its first start's day in `timeZone`.
 */
export function sessionSummaries(counted: GameRecord[], timeZone: string): SessionSummary[] {
  return sessionsOf(counted).map((games) => {
    const startedAt = games.reduce((least, g) => Math.min(least, g.startedAt), Infinity);
    return {
      games: games.length,
      startedAt,
      endedAt: games.reduce((most, g) => Math.max(most, g.endedAt), -Infinity),
      day: dayLabel(localDayKey(startedAt, timeZone)).long,
    };
  });
}

/** The item with the highest `value`, the later of a tie, or null when there are none. */
function latestHighest<T>(items: T[], value: (item: T) => number): T | null {
  let best: T | null = null;
  for (const item of items) if (best === null || value(item) >= value(best)) best = item;
  return best;
}

/** A view of the calendar from `first` to `last`, its days shaded against its own busiest day. */
function heatmap(id: string, label: string, first: string, last: string, perDay: Map<string, number>): Heatmap {
  const counts: { key: string; games: number }[] = [];
  for (let key = first; key <= last; key = addDays(key, 1)) counts.push({ key, games: perDay.get(key) ?? 0 });
  const busiestDay = latestHighest(
    counts.filter((day) => day.games > 0),
    (day) => day.games
  );
  const busiest = busiestDay?.games ?? 0;
  const days: HeatmapDay[] = counts.map(({ key, games }) => ({
    ...dayLabel(key),
    games,
    shade: (games === 0 ? 0 : Math.min(4, Math.ceil((games * 4) / busiest))) as HeatmapDay["shade"],
  }));
  return {
    id,
    label,
    days,
    busiest,
    busiestDay: busiestDay ? dayLabel(busiestDay.key).long : null,
    games: counts.reduce((sum, day) => sum + day.games, 0),
    activeDays: counts.filter((day) => day.games > 0).length,
  };
}

/** The busiest of the games' keys under `keyOfDay`, labelled, or null when there are none. */
function busiestOf(games: Dated[], keyOfDay: (day: string) => string, label: (key: string) => Label): Counted | null {
  const counts = new Map<string, number>();
  for (const game of games) {
    const key = keyOfDay(game.day);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = Array.from(counts.keys()).sort();
  const best = latestHighest(keys, (key) => counts.get(key)!);
  return best === null ? null : { ...label(best), games: counts.get(best)! };
}

/**
 * ACTIVITY's numbers for the counted games, in `timeZone` (the viewer's by default): each player's
 * games and share; games per week (the last `WEEKS_SHOWN`) and per month (every month from the
 * first game's) up to the latest game's; the calendar's views; games by day of the week and hour
 * of the day; sessions; the busiest day, week and month; the longest gap between sessions; and the
 * days since the last game ended, at `now`. Every bucket is the game's start's.
 */
export function computeActivity(counted: GameRecord[], now: number, timeZone: string = viewerTimeZone()): ActivityStats {
  const games = dated(counted, timeZone);

  const players = new Map<number, PlayerActivity>();
  for (const { record, players: seated } of games) {
    for (const player of seated) {
      const found = players.get(player);
      if (found) {
        found.games++;
        found.lastEndedAt = Math.max(found.lastEndedAt, record.endedAt);
      } else {
        players.set(player, { games: 1, share: 0, lastEndedAt: record.endedAt });
      }
    }
  }
  for (const activity of players.values()) activity.share = activity.games / counted.length;

  const byWeekday = Array<number>(7).fill(0);
  const byHour = Array<number>(24).fill(0);
  for (const game of games) {
    byWeekday[weekdayOf(game.day)]++;
    byHour[game.hour]++;
  }

  const days = range(games.map((game) => game.day));
  const periods: Record<Grain, Period[]> = { week: [], month: [] };
  if (days) {
    const [firstDay, lastDay] = days;
    const lastWeek = weekKey(lastDay);
    const earliestShown = addDays(lastWeek, -7 * (WEEKS_SHOWN - 1));
    const firstWeek = weekKey(firstDay) > earliestShown ? weekKey(firstDay) : earliestShown;
    periods.week = periodsBetween(games, firstWeek, lastWeek, weekKey, (key) => addDays(key, 7), weekLabel);
    periods.month = periodsBetween(games, monthKey(firstDay), monthKey(lastDay), monthKey, nextMonth, monthLabel);
  }

  const perDay = new Map<string, number>();
  for (const game of games) perDay.set(game.day, (perDay.get(game.day) ?? 0) + 1);
  const heatmaps: Heatmap[] = [];
  if (days) {
    const [firstDay, lastDay] = days;
    heatmaps.push(heatmap(LAST_12_MONTHS, "Last 12 months", addDays(lastDay, -364), lastDay, perDay));
    for (let year = Number(lastDay.slice(0, 4)); year >= Number(firstDay.slice(0, 4)); year--) {
      const id = String(year);
      if (games.some((game) => game.day.startsWith(`${id}-`))) {
        heatmaps.push(heatmap(id, id, `${id}-01-01`, `${id}-12-31`, perDay));
      }
    }
  }

  const summaries = sessionSummaries(counted, timeZone);
  let longestGap: Gap | null = null;
  for (let i = 1; i < summaries.length; i++) {
    const before = summaries[i - 1].endedAt;
    const after = summaries[i].startedAt;
    const gapDays = localDaysBetween(before, after, timeZone);
    if (longestGap === null || gapDays >= longestGap.days) {
      longestGap = {
        days: gapDays,
        from: dayLabel(localDayKey(before, timeZone)).long,
        to: dayLabel(localDayKey(after, timeZone)).long,
      };
    }
  }

  const lastEnd = counted.length > 0 ? counted.reduce((most, record) => Math.max(most, record.endedAt), -Infinity) : null;

  return {
    byPlayer: byNumber(players),
    periods,
    heatmaps,
    byWeekday,
    byHour,
    sessions: {
      count: summaries.length,
      average: summaries.length > 0 ? counted.length / summaries.length : null,
      most: latestHighest(summaries, (session) => session.games),
    },
    busiest: {
      day: busiestOf(games, (day) => day, dayLabel),
      week: busiestOf(games, weekKey, weekLabel),
      month: busiestOf(games, monthKey, monthLabel),
    },
    longestGap,
    daysSinceLast: lastEnd === null ? null : Math.max(0, localDaysBetween(lastEnd, now, timeZone)),
  };
}
