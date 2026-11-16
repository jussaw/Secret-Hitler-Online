import { localDayKey } from "./format";
import { sideOf, type GameRecord } from "./record";

/**
 * The counting rules every stat follows (the spec's "Counting rules"): which games count under the
 * filter in the address, rates with their minimum sample, ranks with ties, the human seats,
 * sessions and local days. Pure functions: whatever depends on the time is passed `now` or a
 * time zone.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** The players whose games count (null: every player), and whether games with CPU seats count. */
export interface StatsFilter {
  players: Set<number> | null;
  cpu: boolean;
}

/** Every player on and CPU games off: an address with no filter. */
export const DEFAULT_FILTER: StatsFilter = Object.freeze({ players: null, cpu: false });

/** A rate needs this many counted games, or chances for a rate over chances. */
export const MIN_GAMES = 5;
export const MIN_CHANCES = 5;
/** A game starting this long or longer after the one before it ended starts a new session. */
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

const PLAYER_NUMBER = /^[1-9]\d*$/;

/**
 * The filter in an address's search (`?players=1,3,4&cpu=1`). No `players` is every player, and
 * `?players=` none; a token that is not a positive whole number is dropped, while a number no
 * player has is kept (it matches no seat). Only `cpu=1` turns CPU games on.
 */
export function parseFilter(search: string): StatsFilter {
  const params = new URLSearchParams(search);
  const list = params.get("players");
  let players: Set<number> | null = null;
  if (list !== null) {
    players = new Set();
    for (const token of list.split(",")) {
      const trimmed = token.trim();
      if (!PLAYER_NUMBER.test(trimmed)) continue;
      const number = Number(trimmed);
      if (Number.isSafeInteger(number)) players.add(number);
    }
  }
  return { players, cpu: params.get("cpu") === "1" };
}

/**
 * The address's search for a filter: `""` for every player with CPU games off, else
 * `?players=<ascending, plain commas>` when not every player is on, then `cpu=1` when CPU games are.
 */
export function filterSearch(filter: StatsFilter): string {
  const parts: string[] = [];
  if (filter.players !== null) {
    parts.push(`players=${Array.from(filter.players).sort((a, b) => a - b).join(",")}`);
  }
  if (filter.cpu) parts.push("cpu=1");
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/**
 * The filter with `player` switched: off when on, on when off. `all` is every player's number:
 * when every one of them is on again, the filter goes back to every player (`players: null`).
 */
export function togglePlayer(filter: StatsFilter, player: number, all: number[]): StatsFilter {
  const on = new Set(filter.players ?? all);
  if (on.has(player)) on.delete(player);
  else on.add(player);
  const everyone = all.every((number) => on.has(number));
  return { players: everyone ? null : on, cpu: filter.cpu };
}

/** A game's seats that a person played (no CPU seat), by index. */
export function humanSeats(record: GameRecord): { seat: number; player: number }[] {
  const out: { seat: number; player: number }[] = [];
  record.seats.forEach((seat, i) => {
    if (!seat.cpu && seat.player !== null) out.push({ seat: i, player: seat.player });
  });
  return out;
}

/** Whether a game has a CPU seat. */
function hasCpuSeat(record: GameRecord): boolean {
  return record.hasCpu || record.seats.some((seat) => seat.cpu);
}

/** Two ids in code-unit order, so the order is the same in every locale. */
function compareIds(a: GameRecord, b: GameRecord): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Oldest first, the order every stat counts games in: by `endedAt`, then `id` by code units. */
export function compareByEnd(a: GameRecord, b: GameRecord): number {
  return a.endedAt - b.endedAt || compareIds(a, b);
}

/**
 * The games every stat counts, oldest first (by `endedAt`, then `id`): finished, with no CPU seat
 * unless the filter's `cpu` is on, and every human seat a player the filter has on. A sorted copy.
 */
export function countedGames(games: GameRecord[], filter: StatsFilter): GameRecord[] {
  return games
    .filter((record) => {
      if (record.outcome === "UNFINISHED" || record.winner === null) return false;
      if (!filter.cpu && hasCpuSeat(record)) return false;
      const on = filter.players;
      return on === null || humanSeats(record).every(({ player }) => on.has(player));
    })
    .sort(compareByEnd);
}

/** Whether the seat's side won the game (never, for an unfinished game). */
export function seatWon(record: GameRecord, seat: number): boolean {
  return record.winner !== null && sideOf(record.seats[seat].role) === record.winner;
}

/** A rate: its hits, its chances, and their share, null below the minimum sample. */
export interface Rate {
  hits: number;
  chances: number;
  value: number | null;
}

/** `hits` of `chances`, with `value` null when there are fewer than `min` chances (or none). */
export function rate(hits: number, chances: number, min: number = MIN_CHANCES): Rate {
  return { hits, chances, value: chances < min || chances === 0 ? null : hits / chances };
}

/** Two names in alphabetical order, ignoring case: negative when `a` comes first. */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

/** A ranked table's row: `rank` null when the player's `count` is below the minimum. */
export interface Row<T> {
  player: number;
  rank: number | null;
  value: T;
  count: number;
}

/**
 * Rows in rank order. `compare(a, b)` is negative when `a` ranks above `b`. Rows with at least
 * `min` in `count` are ranked: ties share a rank (competition ranks: 1, 2, 2, 4) and are shown
 * with more games (or chances) first, then by name. Rows below the minimum follow, unranked, by
 * count, then name.
 */
export function rankRows<T>(
  rows: { player: number; value: T; count: number }[],
  compare: (a: T, b: T) => number,
  names: Map<number, string>,
  min: number = MIN_GAMES
): Row<T>[] {
  const name = (player: number) => names.get(player) ?? `Player ${player}`;
  const byCountThenName = (a: { player: number; count: number }, b: { player: number; count: number }) =>
    b.count - a.count || compareNames(name(a.player), name(b.player)) || a.player - b.player;

  const ranked = rows.filter((row) => row.count >= min).sort((a, b) => compare(a.value, b.value) || byCountThenName(a, b));
  const unranked = rows.filter((row) => row.count < min).sort(byCountThenName);

  const out: Row<T>[] = [];
  ranked.forEach((row, i) => {
    const previous = out[i - 1];
    const tied = i > 0 && compare(ranked[i - 1].value, row.value) === 0;
    out.push({ player: row.player, rank: tied ? previous.rank : i + 1, value: row.value, count: row.count });
  });
  for (const row of unranked) out.push({ player: row.player, rank: null, value: row.value, count: row.count });
  return out;
}

/**
 * Games in sessions, each oldest first (by `startedAt`, then `id`): a game starting
 * `SESSION_GAP_MS` or more after the latest end so far in a session starts the next one, so
 * overlapping lobbies and a night past midnight stay one session.
 */
export function sessions(games: GameRecord[]): GameRecord[][] {
  const sorted = [...games].sort((a, b) => a.startedAt - b.startedAt || compareIds(a, b));
  const out: GameRecord[][] = [];
  let latestEnd = -Infinity;
  for (const record of sorted) {
    if (out.length === 0 || record.startedAt - latestEnd >= SESSION_GAP_MS) {
      out.push([record]);
      latestEnd = record.endedAt;
    } else {
      out[out.length - 1].push(record);
      latestEnd = Math.max(latestEnd, record.endedAt);
    }
  }
  return out;
}

/** `YYYY-MM-DD` as a UTC midnight. */
function dayStart(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Whole local days from `from` to `to` in `timeZone` (the viewer's by default): the days their
 * dates are apart, so 23:59 to 00:01 is one day and a span across a clock change counts whole days.
 */
export function localDaysBetween(from: number, to: number, timeZone?: string): number {
  return Math.round((dayStart(localDayKey(to, timeZone)) - dayStart(localDayKey(from, timeZone))) / 86_400_000);
}
