import { compareNames } from "./counting";
import PlayerName from "./PlayerName";
import { ScrollRegion } from "./ScrollRegion";
import "./SplitTable.css";

/** A column of a split table: a role or a side (`LIBERAL`, `FASCIST`, `HITLER`), or anything else. */
export interface SplitColumn {
  key: string;
  label: string;
}

/** A cell: its text ("60%", or "—" below the minimum), then its count beside it when given. */
export interface SplitCell {
  text: string;
  count?: number;
}

export interface SplitTableProps {
  /** The card's title; the table's own region is `${title} table`. */
  title: string;
  columns: SplitColumn[];
  /** Shown sorted by name. */
  rows: { player: number; cells: Record<string, SplitCell> }[];
  names: Map<number, string>;
}

/** Each side's or role's head colour. */
const HEAD_CLASS: Record<string, string> = {
  LIBERAL: "split-liberal",
  FASCIST: "split-fascist",
  HITLER: "split-hitler",
};

/**
 * A stat split by role or by side: players down, the columns across, scrolling sideways inside
 * its card. The first column (the names) stays put while the rest scroll. A cell shows its text,
 * then its count when it has one (a 0 too); a cell the row does not have shows "—".
 */
export function SplitTable({ title, columns, rows, names }: SplitTableProps): JSX.Element {
  const name = (player: number) => names.get(player) ?? `Player ${player}`;
  const sorted = [...rows].sort((a, b) => compareNames(name(a.player), name(b.player)) || a.player - b.player);
  return (
    <ScrollRegion label={`${title} table`}>
      <table className="split-table">
        <thead>
          <tr>
            <th scope="col">Player</th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={HEAD_CLASS[column.key]}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.player}>
              <th scope="row" title={name(row.player)}>
                <PlayerName player={row.player} name={name(row.player)} />
              </th>
              {columns.map((column) => {
                const cell = Object.prototype.hasOwnProperty.call(row.cells, column.key) ? row.cells[column.key] : undefined;
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
