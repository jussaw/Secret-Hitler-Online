import { useMemo } from "react";
import { countLabel } from "./countLabel";
import { nameOf, type Row } from "./counting";
import PlayerName from "./PlayerName";
import { numberColumn, playerColumn, rankColumn, SortHeadRow, useTableSort, type HeadColumn } from "./SortHead";
import { RANK_ORDER } from "./sorting";
import "./RankedTable.css";

export interface RankedTableProps<T> {
  /** In rank order, as `rankRows` gives them. */
  rows: Row<T>[];
  format: (value: T) => string;
  names: Map<number, string>;
  /** The value column's head. */
  valueHead: string;
  /** A ranked row's sort figure, the number its shown value says (`numbers.ts`' `countFigure`,
   *  `rateFigure`, `wholePercent`); an unranked row's is null. */
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
  /** A ranked row's figure under the value; an unranked row has none, so it goes last either way. */
  const value = (row: Row<T>) => (row.rank === null ? null : sortValue(row.value));
  const columns: HeadColumn<Row<T>, RankedColumn>[] = [
    rankColumn<Row<T>>((row) => row.rank),
    playerColumn<Row<T>>((row) => nameOf(names, row.player)),
    // INVESTIGATIONS' value stands at the left (`valueEnd` false); it still sorts most first.
    { ...numberColumn<Row<T>, RankedColumn>("value", valueHead, value, "ranked-value"), end: valueEnd },
  ];
  if (countHead !== undefined) {
    columns.push(numberColumn<Row<T>, RankedColumn>("count", countHead, (row) => row.count, "ranked-count"));
  }
  return columns;
}

/**
 * Players ranked by a stat, a row each: the rank ("2.", none when unranked), the name, the value
 * ("—" below the minimum) and, with `countHead`, the count as a bare number. A head row names each
 * column and sorts by it (`SortHeadRow`, #109): the table opens in rank order, `#` marked, and
 * ranks never change; under the value an unranked row has no figure, so it goes last either way.
 * Narrow columns, so it fits a 320px phone without scrolling: a long name wraps in its own column.
 * Wherever the stacked query matches (phones, and tall and narrow windows) the count column, its
 * head too, gives way to a line under the name ("12 games", `span.ranked-count-under`,
 * `RankedTable.css`), as PLAYERS' last played does on phones, so sorting by the count is for wide
 * windows only.
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
