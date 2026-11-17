import { compareNames } from "../counting";
import { localDayKey } from "../format";
import type { PlayerListRow } from "../player";

/**
 * PLAYERS' sorts and search (#100): which rows its card shows and in what order, never what they
 * say. Pure: the page keeps the sort and the search in its state (not the address, which would get
 * a history entry per letter typed).
 */

/** A column of PLAYERS' table, each with a head that sorts by it. */
export type PlayersColumn = "name" | "games" | "winRate" | "rating" | "lastPlayed";

/** Which way a sort runs, as `aria-sort` says it. */
export type SortDirection = "ascending" | "descending";

export interface PlayersSort {
  column: PlayersColumn;
  direction: SortDirection;
}

/** The order PLAYERS opens in: names A to Z. */
export const NAME_ORDER: PlayersSort = Object.freeze({ column: "name", direction: "ascending" });

/** The sort after a press on `column`'s head: turned round when it is the sorted column, else names
 *  A to Z and the rest the most (or the latest) first. */
export function pressHead(sort: PlayersSort, column: PlayersColumn): PlayersSort {
  if (sort.column === column) return { column, direction: sort.direction === "ascending" ? "descending" : "ascending" };
  return { column, direction: column === "name" ? "ascending" : "descending" };
}

/** A row's value in a column, as the column shows it, so a tie the reader sees goes by name; null
 *  for a win rate below its minimum ("— (N)"). */
function shown(row: PlayerListRow, column: Exclude<PlayersColumn, "name">, timeZone: string): number | string | null {
  switch (column) {
    case "games":
      return row.games;
    case "winRate":
      return row.winRate.value === null ? null : Math.round(row.winRate.value * 100); // formatPercent's whole percent
    case "rating":
      return Math.round(row.rating);
    case "lastPlayed":
      return localDayKey(row.lastPlayed, timeZone); // "YYYY-MM-DD", in order as a string
  }
}

const byNameThenNumber = (a: PlayerListRow, b: PlayerListRow) => compareNames(a.name, b.name) || a.player - b.player;

/**
 * `rows` in `sort`'s order, a new array. Names compare as `compareNames` does (ignoring case),
 * with a tie to the lower number. Every other column compares what it shows (whole percents, the
 * rounded rating, the local day in `timeZone`), with ties by name, then number, whichever way it
 * runs, and a win rate below its minimum below every rate either way. Provisional players take
 * their place like anyone else.
 */
export function sortPlayers(rows: readonly PlayerListRow[], sort: PlayersSort, timeZone: string): PlayerListRow[] {
  const sign = sort.direction === "ascending" ? 1 : -1;
  const { column } = sort;
  if (column === "name") {
    return [...rows].sort((a, b) => sign * compareNames(a.name, b.name) || a.player - b.player);
  }
  const keyed = rows.map((row) => ({ row, key: shown(row, column, timeZone) }));
  keyed.sort((a, b) => {
    if (a.key === null || b.key === null) {
      return (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0) || byNameThenNumber(a.row, b.row);
    }
    const order = a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    return sign * order || byNameThenNumber(a.row, b.row);
  });
  return keyed.map(({ row }) => row);
}

/** What a search looks for: what was typed, without spaces at either end, in lower case. */
const searched = (search: string) => search.trim().toLowerCase();

/** The rows whose name as shown (`Player N` for none) contains `search`, ignoring case and spaces at
 *  either end of it; every row for an empty search. */
export function searchPlayers(rows: readonly PlayerListRow[], search: string): readonly PlayerListRow[] {
  const wanted = searched(search);
  if (wanted === "") return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(wanted));
}

/** The card's line when no row matches `search`: No players match “an”. */
export function noMatchLine(search: string): string {
  return `No players match “${search.trim()}”.`;
}
