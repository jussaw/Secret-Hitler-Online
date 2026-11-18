import { compareNames } from "./counting";

/**
 * The rules every sortable stats table shares (#109): which way a press sorts and how rows compare,
 * never what a cell says. Pure: each table keeps its sort in its own state (not the address, which
 * would get a history entry per press).
 */

/** Which way a sort runs, as `aria-sort` says it. */
export type SortDirection = "ascending" | "descending";

/** What a row is sorted by in a column: the figure its cell shows. Null is a missing value, shown
 *  "—"; a string compares as `compareNames` does (ignoring case). */
export type SortValue = number | string | null;

/** A column of a table whose head sorts by it. */
export interface SortColumn<R, K extends string = string> {
  key: K;
  /** The direction a first press on this column's head sorts in. */
  first: SortDirection;
  value: (row: R) => SortValue;
}

/** A table's sort: the column and the way it runs. */
export interface TableSort<K extends string = string> {
  readonly column: K;
  readonly direction: SortDirection;
}

/** The order a table of names opens in: A to Z. */
export const NAME_ORDER: TableSort<"name"> = Object.freeze({ column: "name", direction: "ascending" });

/** The order a ranked table opens in: rank 1 first. */
export const RANK_ORDER: TableSort<"rank"> = Object.freeze({ column: "rank", direction: "ascending" });

/** The sort after a press on `column`'s head: turned round when it is the sorted column, else that
 *  column in its first direction. */
export function nextSort<K extends string>(
  sort: TableSort<K>,
  column: { key: K; first: SortDirection }
): TableSort<K> {
  if (sort.column === column.key) {
    return { column: column.key, direction: sort.direction === "ascending" ? "descending" : "ascending" };
  }
  return { column: column.key, direction: column.first };
}

/** The entry of `columns` whose key is `key`, the one way a table finds a column by its key. Throws
 *  for a key no entry has. */
export function columnFor<C extends { key: string }>(columns: readonly C[], key: C["key"]): C {
  const column = columns.find((c) => c.key === key);
  if (column === undefined) throw new Error(`No column "${key}"`);
  return column;
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  return compareNames(String(a), String(b));
}

/**
 * `rows` in `sort`'s order, a new array. A column sorts by its `value`, numbers numerically and
 * strings as `compareNames` does. A missing value (null) goes below every value either way, and
 * equal values, the missing ones too, keep the order `rows` came in whichever way the sort runs, so
 * a table gives its rows in its own order. Throws for a column no entry of `columns` has
 * (`columnFor`).
 */
export function sortRows<R, K extends string>(
  rows: readonly R[],
  columns: readonly SortColumn<R, K>[],
  sort: TableSort<K>
): R[] {
  const column = columnFor(columns, sort.column);
  const sign = sort.direction === "ascending" ? 1 : -1;
  const keyed = rows.map((row, index) => ({ row, index, value: column.value(row) }));
  keyed.sort((a, b) => {
    if (a.value === null || b.value === null) {
      return (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0) || a.index - b.index;
    }
    return sign * compareValues(a.value, b.value) || a.index - b.index;
  });
  return keyed.map(({ row }) => row);
}
