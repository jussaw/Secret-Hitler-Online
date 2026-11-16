import type { Row } from "./counting";
import { plural } from "./format";
import PlayerName from "./PlayerName";
import "./RankedTable.css";

export interface RankedTableProps<T> {
  /** In rank order, as `rankRows` gives them. */
  rows: Row<T>[];
  format: (value: T) => string;
  names: Map<number, string>;
  /** A row's count, by default "N games". */
  countLabel?: (count: number) => string;
  /** Shows the count on ranked rows too (unranked rows always show it). */
  showCount?: boolean;
}

/**
 * Players ranked by a stat, a row each: the rank ("2.", none when unranked), the name, the value
 * ("—" below the minimum) and the count. Four narrow columns, so it fits a 320px phone without
 * scrolling: a long name wraps in its own column.
 */
export function RankedTable<T>({
  rows,
  format,
  names,
  countLabel = (count) => plural(count, "game"),
  showCount = false,
}: RankedTableProps<T>): JSX.Element {
  return (
    <table className="ranked-table">
      <tbody>
        {rows.map((row) => {
          const ranked = row.rank !== null;
          return (
            <tr key={row.player} className={ranked ? undefined : "ranked-unranked"}>
              <td className="ranked-rank">{ranked ? `${row.rank}.` : ""}</td>
              <td className="ranked-name">
                <PlayerName player={row.player} name={names.get(row.player) ?? `Player ${row.player}`} />
              </td>
              <td className="ranked-value">{ranked ? format(row.value) : "—"}</td>
              <td className="ranked-count">{!ranked || showCount ? countLabel(row.count) : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default RankedTable;
