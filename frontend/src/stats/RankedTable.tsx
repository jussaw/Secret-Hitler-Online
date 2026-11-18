import { useMemo } from "react";
import { countLabel } from "./countLabel";
import { nameOf, type Rate, type Row } from "./counting";
import { wholePercent } from "./numbers";
import PlayerName from "./PlayerName";
import { playerColumn, rankColumn, SortHeadRow, useTableSort, type HeadColumn } from "./SortHead";
import { RANK_ORDER } from "./sorting";
import "./RankedTable.css";

/** A count's sort figure (a `sortValue`): the count itself, as its cell shows it. */
export function countFigure(count: number): number {
  return count;
}

/** A rate's sort figure (a `sortValue`): the whole percent its cell shows (`formatPercent`), null
 *  for a rate with no value, shown "—". */
export function rateFigure(rate: Rate): number | null {
  return rate.value === null ? null : wholePercent(rate.value);
}

export interface RankedTableProps<T> {
  /** In rank order, as `rankRows` gives them. */
  rows: Row<T>[];
  format: (value: T) => string;
  names: Map<number, string>;
  /** The value column's head. */
  valueHead: string;
  /** A ranked row's sort figure, the number its shown value says; an unranked row's is null. */
  sortValue: (value: T) => number | null;
  /** The count column's head; no count column without it. */
  countHead?: string;
  /** The value stands at the right (the default); INVESTIGATIONS' left-aligned text passes false. */
  valueEnd?: boolean;
}

/** A count head's nouns for the line under the name (`countLabel`): the head lowercased for any
 *  count but 1, and that less its final "s" for 1 ("Games": "1 game", "12 games"). Every count head
 *  is a plural in -s. */
export function countNouns(countHead: string): [string, string] {
  const many = countHead.toLowerCase();
  return [many.replace(/s$/, ""), many];
}

/** A ranked table's columns. */
type RankedColumn = "rank" | "name" | "value" | "count";

/** The table's columns, in order: `#`, Player, the value and, with `countHead`, the count. */
function rankedColumns<T>(
  names: Map<number, string>,
  valueHead: string,
  sortValue: (value: T) => number | null,
  countHead: string | undefined,
  valueEnd: boolean
): HeadColumn<Row<T>, RankedColumn>[] {
  const columns: HeadColumn<Row<T>, RankedColumn>[] = [
    rankColumn<Row<T>>((row) => row.rank),
    playerColumn<Row<T>>((row) => nameOf(names, row.player)),
    {
      key: "value",
      label: valueHead,
      className: "ranked-value",
      end: valueEnd,
      first: "descending",
      value: (row) => (row.rank === null ? null : sortValue(row.value)),
    },
  ];
  if (countHead !== undefined) {
    columns.push({ key: "count", label: countHead, className: "ranked-count", end: true, first: "descending", value: (row) => row.count });
  }
  return columns;
}

/**
 * Players ranked by a stat, a row each: the rank ("2.", none when unranked), the name, the value
 * ("—" below the minimum) and, with `countHead`, the count as a bare number. A head row names each
 * column and sorts by it (`SortHeadRow`, #109): the table opens in rank order, `#` marked, and
 * ranks never change; under the value an unranked row has no figure, so it goes last either way.
 * Narrow columns, so it fits a 320px phone without scrolling: a long name wraps in its own column.
 * On phones the count column, its head too, gives way to a line under the name ("12 games",
 * `span.ranked-count-under`, `RankedTable.css`), as PLAYERS' last played does, so sorting by the
 * count is a desktop thing.
 */
export function RankedTable<T>({
  rows,
  format,
  names,
  valueHead,
  sortValue,
  countHead,
  valueEnd = true,
}: RankedTableProps<T>): JSX.Element {
  const columns = useMemo(
    () => rankedColumns(names, valueHead, sortValue, countHead, valueEnd),
    [names, valueHead, sortValue, countHead, valueEnd]
  );
  const { rows: sorted, sort, press } = useTableSort(rows, columns, RANK_ORDER);
  const nouns = useMemo(() => (countHead === undefined ? null : countNouns(countHead)), [countHead]);
  return (
    <table className={nouns === null ? "ranked-table" : "ranked-table has-count"}>
      <SortHeadRow columns={columns} sort={sort} onSort={press} />
      <tbody>
        {sorted.map((row) => {
          const ranked = row.rank !== null;
          return (
            <tr key={row.player} className={ranked ? undefined : "ranked-unranked"}>
              <td className="ranked-rank">{ranked ? `${row.rank}.` : ""}</td>
              <td className="ranked-name">
                <PlayerName player={row.player} name={nameOf(names, row.player)} />
                {nouns !== null && <span className="ranked-count-under">{countLabel(row.count, nouns)}</span>}
              </td>
              <td className="ranked-value">{ranked ? format(row.value) : "—"}</td>
              {countHead !== undefined && <td className="ranked-count">{row.count}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default RankedTable;
