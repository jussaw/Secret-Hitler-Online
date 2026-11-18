import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { columnFor, nextSort, sortRows, type SortColumn, type TableSort } from "./sorting";
import "./SortHead.css";

/**
 * The heads every sortable stats table shares (#109), PLAYERS' first: a button per column that
 * sorts by it (`sorting.ts`' rules), and the hook that keeps a table's sort in its own state.
 */

/** A column whose head sorts by it: its head's words and look as well as its sort. */
export interface HeadColumn<R, K extends string = string> extends SortColumn<R, K> {
  /** The head's words, exactly. */
  label: string;
  /** The th's class (the class its cells share). */
  className?: string;
  /** The values stand at the right: the arrow before the words, so the words line up with the
   *  values, and the content at the right of its 44px box. */
  end?: boolean;
  /** The head's accessible name, the `aria-label` of its button and its `th`, when the words are a
   *  sign ("Rank" for "#"). */
  name?: string;
}

/**
 * A column's head: a `th` holding a button that sorts by the column (`onSort` with its key), with
 * Lucide's arrow both ways, dimmed, until it sorts the table, then the way it runs, and `aria-sort`
 * on the sorted one. The words stay a bare text node beside the arrow: in an element of their own
 * they would be a flex child with text that cannot shrink. A column's `name` names the button and
 * the `th` both, so the column head is named Rank wherever its name comes from (Testing Library's
 * accessible names skip a button's `aria-label` inside its parent's). A head takes any table's
 * column, as it never reads a row.
 */
export function SortHead<K extends string>(props: {
  column: HeadColumn<never, K>;
  sort: TableSort<K>;
  onSort: (key: K) => void;
}): JSX.Element {
  const { column, sort, onSort } = props;
  const direction = sort.column === column.key ? sort.direction : null;
  const Arrow = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
  const arrow = <Arrow className="stats-sort-arrow" aria-hidden="true" />;
  const className = ["stats-sort", direction ? "is-sorted" : null, column.end ? "is-end" : null].filter(Boolean).join(" ");
  return (
    <th scope="col" className={column.className} aria-sort={direction ?? undefined} aria-label={column.name}>
      <button type="button" className={className} aria-label={column.name} onClick={() => onSort(column.key)}>
        {column.end && arrow}
        {column.label}
        {!column.end && arrow}
      </button>
    </th>
  );
}

/** A table's head row: a `SortHead` per column, in order. */
export function SortHeadRow<K extends string>(props: {
  columns: readonly HeadColumn<never, K>[];
  sort: TableSort<K>;
  onSort: (key: K) => void;
}): JSX.Element {
  const { columns, sort, onSort } = props;
  return (
    <thead>
      <tr>
        {columns.map((column) => (
          <SortHead key={column.key} column={column} sort={sort} onSort={onSort} />
        ))}
      </tr>
    </thead>
  );
}

/**
 * A table's sort, kept in its state from `opening` (never the address, nor stored), and `rows` in
 * that order (`sortRows`, so ties keep the order `rows` came in). `press` is a press on a column's
 * head (`nextSort`). New rows are sorted the same way, so a table keeps its column and direction
 * while a filter changes its rows. Throws for a key no column has (`columnFor`).
 */
export function useTableSort<R, K extends string>(
  rows: readonly R[],
  columns: readonly SortColumn<R, K>[],
  opening: TableSort<K>
): { rows: R[]; sort: TableSort<K>; press: (key: K) => void } {
  const [sort, setSort] = useState<TableSort<K>>(opening);
  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);
  const press = (key: K) => {
    const column = columnFor(columns, key);
    setSort((current) => nextSort(current, column));
  };
  return { rows: sorted, sort, press };
}

/** A ranked table's `#` column: rank 1 first, a row with no rank (null) unranked, below the rest
 *  either way. Its button says "#" and is named Rank. */
export function rankColumn<R>(rank: (row: R) => number | null): HeadColumn<R, "rank"> {
  return { key: "rank", label: "#", name: "Rank", className: "ranked-rank", end: true, first: "ascending", value: rank };
}

/** A table's Player column, by name A to Z (ignoring case), with the class its cells share
 *  (`ranked-name` unless given). */
export function playerColumn<R>(name: (row: R) => string, className = "ranked-name"): HeadColumn<R, "name"> {
  return { key: "name", label: "Player", className, first: "ascending", value: name };
}

/** A column of numbers under `label`, with the class its cells share: its values stand at the
 *  right (`end`, the arrow before the words) and it sorts most first, by `value`, the figure its
 *  cell shows (null for a missing one, shown "—"). */
export function numberColumn<R, K extends string>(
  key: K,
  label: string,
  value: (row: R) => number | null,
  className: string
): HeadColumn<R, K> {
  return { key, label, className, end: true, first: "descending", value };
}
