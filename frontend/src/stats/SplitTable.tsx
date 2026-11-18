import { useMemo } from "react";
import { compareNames, nameOf } from "./counting";
import PlayerName from "./PlayerName";
import { ScrollRegion } from "./ScrollRegion";
import { playerColumn, SortHeadRow, useTableSort, type HeadColumn } from "./SortHead";
import { NAME_ORDER } from "./sorting";
import "./SplitTable.css";

/** A column of a split table: a role or a side (`LIBERAL`, `FASCIST`, `HITLER`), or anything else.
 *  Never keyed `name`, the Player column's key. */
export interface SplitColumn {
  key: string;
  label: string;
}

/** A cell: its text ("60%", "2 of 5", "4.2 s", or "—" below the minimum), then its count beside it
 *  when given. */
export interface SplitCell {
  text: string;
  /** The figure the text shows (the one it leads with: "2 of 5" is 2, "2 L · 3 F" is 2), which its
   *  column sorts by; null exactly when the text is "—". */
  value: number | null;
  /** Beside the text, a 0 too; never sorted by. */
  count?: number;
}

export interface SplitTableProps {
  /** The card's title; the table's own region is `${title} table`. */
  title: string;
  columns: SplitColumn[];
  /** In any order: the table opens sorted by name. */
  rows: { player: number; cells: Record<string, SplitCell> }[];
  names: Map<number, string>;
}

/** A row of a split table: a player and their cells by column key. */
type SplitRow = SplitTableProps["rows"][number];

/** Each side's or role's head colour. */
const HEAD_CLASS: Record<string, string> = {
  LIBERAL: "split-liberal",
  FASCIST: "split-fascist",
  HITLER: "split-hitler",
};

/** A row's cell under `key`, if it has one (a cell it lacks shows "—"). */
function cellOf(row: SplitRow, key: string): SplitCell | undefined {
  return Object.prototype.hasOwnProperty.call(row.cells, key) ? row.cells[key] : undefined;
}

/** The table's sortable columns: Player, by name A to Z, then each of `columns`, most first by its
 *  cells' values, a cell the row lacks missing. Throws for a column keyed `name`. */
function splitColumns(columns: SplitColumn[], names: Map<number, string>): HeadColumn<SplitRow>[] {
  const heads: HeadColumn<SplitRow>[] = [playerColumn<SplitRow>((row) => nameOf(names, row.player), "split-name")];
  for (const { key, label } of columns) {
    if (key === "name") throw new Error('A split column cannot be keyed "name"');
    heads.push({
      key,
      label,
      className: HEAD_CLASS[key],
      end: true,
      first: "descending",
      value: (row) => cellOf(row, key)?.value ?? null,
    });
  }
  return heads;
}

/**
 * A stat split by role or by side: players down, the columns across, scrolling sideways inside
 * its card. The first column (the names) stays put while the rest scroll. A cell shows its text,
 * then its count when it has one (a 0 too); a cell the row does not have shows "—". Each head
 * sorts by its column (`SortHeadRow`, #109): the table opens in name order, Player marked, and a
 * side's or role's column sorts by its cells' values, most first, a "—" below every value either
 * way; ties keep name order.
 */
export function SplitTable({ title, columns, rows, names }: SplitTableProps): JSX.Element {
  const heads = useMemo(() => splitColumns(columns, names), [columns, names]);
  const byName = useMemo(
    () =>
      [...rows].sort(
        (a, b) => compareNames(nameOf(names, a.player), nameOf(names, b.player)) || a.player - b.player
      ),
    [rows, names]
  );
  const { rows: sorted, sort, press } = useTableSort(byName, heads, NAME_ORDER);
  const name = (player: number) => nameOf(names, player);
  return (
    <ScrollRegion label={`${title} table`}>
      <table className="split-table">
        <SortHeadRow columns={heads} sort={sort} onSort={press} />
        <tbody>
          {sorted.map((row) => (
            <tr key={row.player}>
              <th scope="row" title={name(row.player)}>
                <PlayerName player={row.player} name={name(row.player)} />
              </th>
              {columns.map((column) => {
                const cell = cellOf(row, column.key);
                return (
                  <td key={column.key}>
                    <span className="split-text">{cell ? cell.text : "—"}</span>
                    {cell && cell.count !== undefined && <span className="split-count">{cell.count}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export default SplitTable;
