import { localDayKey, viewerTimeZone } from "../format";
import { OUTCOMES, type GameRecord, type Outcome } from "../record";

/**
 * GAMES' own filter, kept in the address (`/stats/games?players=1,3&from=…`), so a filtered list
 * can be shared, reloaded and gone back through. It is not the stats' filter (Phase 17A's): a game
 * matches if any chosen player sat in it.
 *
 * The keys, in the order they are written, each left out at its default: `players` (player
 * numbers, ascending, comma-separated), `from` and `to` (`YYYY-MM-DD`, the viewer's local day of
 * the game's start, both inclusive), `size` (5 to 10 seats), `ending` (`ENDING_PARAM`), `cpu`
 * (`without` or `with`), `per` (50 or 100 games a page; 20 by default) and `page` (2 and up). Any
 * other value of a key reads as its default, so a hand-edited or stale address never breaks the
 * page.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** Whether games with CPU players are shown: all, none of them, or only them; "any" first, the default. */
export const CPU_CHOICES = ["any", "without", "with"] as const;
export type CpuChoice = (typeof CPU_CHOICES)[number];
/** The seat counts a game can have. */
export const SEAT_COUNTS = [5, 6, 7, 8, 9, 10] as const;
/** The page sizes GAMES offers, the default first. */
export const PER_PAGE = [20, 50, 100] as const;
export type PerPage = (typeof PER_PAGE)[number];

export interface GamesFilter {
  /** Player numbers, ascending; a game matches if any of them sat in it. Empty: every game. */
  players: number[];
  /** The first local day shown (`YYYY-MM-DD`), or null for no limit. */
  from: string | null;
  /** The last local day shown (`YYYY-MM-DD`), or null for no limit. */
  to: string | null;
  /** The seat count, 5 to 10, or null for any. */
  size: number | null;
  ending: Outcome | null;
  cpu: CpuChoice;
  per: PerPage;
  /** The page shown, from 1. */
  page: number;
}

/** No filter: every game, 20 a page, the first page. */
export const NO_GAMES_FILTER: GamesFilter = {
  players: [],
  from: null,
  to: null,
  size: null,
  ending: null,
  cpu: "any",
  per: 20,
  page: 1,
};

/** Each ending's spelling in the address. */
export const ENDING_PARAM: Record<Outcome, string> = {
  LIBERAL_POLICIES: "liberal-policies",
  HITLER_EXECUTED: "hitler-executed",
  FASCIST_POLICIES: "fascist-policies",
  HITLER_ELECTED: "hitler-elected",
  UNFINISHED: "unfinished",
};

/** A whole number from 1, as an address writes it: no sign, no leading zero. */
const COUNTING_NUMBER = /^[1-9][0-9]*$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `text` as a whole number from 1, or null. */
function countingNumber(text: string | null): number | null {
  if (text === null || !COUNTING_NUMBER.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

/** `text` when it is a real calendar day written `YYYY-MM-DD`, or null. */
function calendarDay(text: string | null): string | null {
  const match = text === null ? null : DAY.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? text : null;
}

/** The ending an address spells `param` (`ENDING_PARAM`), or null for any other value. */
export function endingFromParam(param: string | null): Outcome | null {
  return OUTCOMES.find((outcome) => ENDING_PARAM[outcome] === param) ?? null;
}

/** GAMES' filter from an address's search (`?players=1,3&page=2`, or `""`). */
export function parseGamesFilter(search: string): GamesFilter {
  const params = new URLSearchParams(search);
  const players = new Set<number>();
  for (const part of (params.get("players") ?? "").split(",")) {
    const n = countingNumber(part);
    if (n !== null) players.add(n);
  }
  const size = SEAT_COUNTS.find((n) => String(n) === params.get("size")) ?? null;
  const cpu = CPU_CHOICES.find((choice) => choice === params.get("cpu")) ?? NO_GAMES_FILTER.cpu;
  const per = PER_PAGE.find((n) => String(n) === params.get("per")) ?? NO_GAMES_FILTER.per;
  return {
    players: Array.from(players).sort((a, b) => a - b),
    from: calendarDay(params.get("from")),
    to: calendarDay(params.get("to")),
    size,
    ending: endingFromParam(params.get("ending")),
    cpu,
    per,
    page: countingNumber(params.get("page")) ?? 1,
  };
}

/** The address's search for `filter`: `""` for no filter, else `?…` in the keys' order, defaults left out. */
export function gamesFilterSearch(filter: GamesFilter): string {
  const parts: string[] = [];
  if (filter.players.length > 0) parts.push(`players=${filter.players.join(",")}`);
  if (filter.from !== null) parts.push(`from=${filter.from}`);
  if (filter.to !== null) parts.push(`to=${filter.to}`);
  if (filter.size !== null) parts.push(`size=${filter.size}`);
  if (filter.ending !== null) parts.push(`ending=${ENDING_PARAM[filter.ending]}`);
  if (filter.cpu !== "any") parts.push(`cpu=${filter.cpu}`);
  if (filter.per !== NO_GAMES_FILTER.per) parts.push(`per=${filter.per}`);
  if (filter.page > 1) parts.push(`page=${filter.page}`);
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

/** Whether the filter leaves any game out: players, dates, size, ending or CPU set (not the page or its size). */
export function isFiltered(filter: GamesFilter): boolean {
  return gamesFilterSearch({ ...filter, per: NO_GAMES_FILTER.per, page: 1 }) !== "";
}

/** Newest first: by `endedAt`, then `id`, both descending. */
function newestFirst(a: GameRecord, b: GameRecord): number {
  if (a.endedAt !== b.endedAt) return b.endedAt - a.endedAt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * The games `filter` keeps, newest first (a new array). From and To compare the local day of each
 * game's start in `timeZone`, the viewer's by default; the page and its size are ignored.
 */
export function filterGames(games: GameRecord[], filter: GamesFilter, timeZone: string = viewerTimeZone()): GameRecord[] {
  const players = new Set(filter.players);
  return games
    .filter((game) => {
      if (players.size > 0 && !game.seats.some((seat) => seat.player !== null && players.has(seat.player))) {
        return false;
      }
      if (filter.from !== null || filter.to !== null) {
        const day = localDayKey(game.startedAt, timeZone);
        if (filter.from !== null && day < filter.from) return false;
        if (filter.to !== null && day > filter.to) return false;
      }
      if (filter.size !== null && game.seats.length !== filter.size) return false;
      if (filter.ending !== null && game.outcome !== filter.ending) return false;
      if (filter.cpu === "without" && game.hasCpu) return false;
      if (filter.cpu === "with" && !game.hasCpu) return false;
      return true;
    })
    .sort(newestFirst);
}
