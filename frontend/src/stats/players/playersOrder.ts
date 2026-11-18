import { compareNames } from "../counting";
import { localDayKey, viewerTimeZone } from "../format";
import { rateFigure, wholeRating } from "../numbers";
import type { PlayerListRow } from "../player";
import { NAME_ORDER, nextSort, sortRows, type SortColumn, type SortDirection, type TableSort } from "../sorting";

export { NAME_ORDER, type SortDirection };

/**
 * PLAYERS' sorts and search (#100): which rows its card shows and in what order, never what they
 * say. Pure: the page keeps the sort and the search in its state (not the address, which would get
 * a history entry per letter typed). Its sorts follow every sortable stats table's rules
 * (`sorting.ts`).
 */

/** A column of PLAYERS' table, each with a head that sorts by it. */
export type PlayersColumn = "name" | "games" | "winRate" | "rating" | "lastPlayed";

/** PLAYERS' sort. It opens at `NAME_ORDER`, names A to Z. */
export type PlayersSort = TableSort<PlayersColumn>;

/** The direction a first press on each head sorts in: names A to Z, the rest the most (or the
 *  latest) first. */
const FIRST: Readonly<Record<PlayersColumn, SortDirection>> = {
  name: "ascending",
  games: "descending",
  winRate: "descending",
  rating: "descending",
  lastPlayed: "descending",
};

/**
 * PLAYERS' columns, in order, each sorted by its value as the column shows it, so a tie the reader
 * sees keeps the rows' order: the name, the games, the whole percent (`rateFigure`, what
 * `formatPercent` shows; null for a win rate below its minimum, "— (N)", which goes below every rate
 * either way), the rounded rating (`wholeRating`), and the local day of the last game in `timeZone`
 * ("YYYY-MM-DD", in order as a string).
 */
export function playersColumns(timeZone: string): SortColumn<PlayerListRow, PlayersColumn>[] {
  return [
    { key: "name", first: FIRST.name, value: (row) => row.name },
    { key: "games", first: FIRST.games, value: (row) => row.games },
    { key: "winRate", first: FIRST.winRate, value: (row) => rateFigure(row.winRate) },
    { key: "rating", first: FIRST.rating, value: (row) => wholeRating(row.rating) },
    { key: "lastPlayed", first: FIRST.lastPlayed, value: (row) => localDayKey(row.lastPlayed, timeZone) },
  ];
}

/** The sort after a press on `column`'s head (`nextSort`): turned round when it is the sorted
 *  column, else names A to Z and the rest the most (or the latest) first. */
export function pressHead(sort: PlayersSort, column: PlayersColumn): PlayersSort {
  return nextSort(sort, { key: column, first: FIRST[column] });
}

/**
 * `rows` in `sort`'s order, a new array: `sortRows` over `playersColumns(timeZone)` (the viewer's
 * zone by default), with the rows put in name order first (`compareNames`, ignoring case, then the
 * lower number). So names tie to the lower number, and every other column ties by name, then
 * number, whichever way it runs, with a win rate below its minimum below every rate either way.
 * Provisional players take their place like anyone else.
 */
export function sortPlayers(
  rows: readonly PlayerListRow[],
  sort: PlayersSort,
  timeZone: string = viewerTimeZone()
): PlayerListRow[] {
  const inNameOrder = [...rows].sort((a, b) => compareNames(a.name, b.name) || a.player - b.player);
  return sortRows(inNameOrder, playersColumns(timeZone), sort);
}

/**
 * The rows whose name as shown (`Player N` for none) contains `search`, ignoring case and spaces at
 * either end of it (a phone's keyboard adds one after a word picked from its suggestions); every
 * row for an empty search.
 */
export function searchPlayers(rows: readonly PlayerListRow[], search: string): readonly PlayerListRow[] {
  const wanted = search.trim().toLowerCase();
  if (wanted === "") return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(wanted));
}

/** The card's line when no row matches `search`: No players match “an”. */
export function noMatchLine(search: string): string {
  return `No players match “${search.trim()}”.`;
}
