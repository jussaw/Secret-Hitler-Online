import { useMemo } from "react";
import { nameOf } from "../counting";
import { formatRating, formatSigned, wholeRating, wholeSigned } from "../numbers";
import type { PowerRow } from "../overview";
import PlayerName from "../PlayerName";
import "../RankedTable.css";
import { ScrollRegion } from "../ScrollRegion";
import { numberColumn, playerColumn, rankColumn, SortHeadRow, useTableSort, type HeadColumn } from "../SortHead";
import { RANK_ORDER } from "../sorting";
import "./PowerRanking.css";

/** The power ranking's columns. */
type PowerColumn = "rank" | "name" | "rating" | "change" | "games";

/** The table's columns, in order: `#` (a provisional row has none, so it goes last either way),
 *  Player, and the rounded Elo, the rounded last change and the games, each most first, by the
 *  figure its cell shows. */
function powerColumns(names: Map<number, string>): HeadColumn<PowerRow, PowerColumn>[] {
  return [
    rankColumn<PowerRow>((row) => row.rank),
    playerColumn<PowerRow>((row) => nameOf(names, row.player)),
    numberColumn<PowerRow, PowerColumn>("rating", "Elo", (row) => wholeRating(row.rating), "power-number"),
    numberColumn<PowerRow, PowerColumn>("change", "Last", (row) => wholeSigned(row.lastChange), "power-number"),
    numberColumn<PowerRow, PowerColumn>("games", "Games", (row) => row.games, "power-number"),
  ];
}

/**
 * OVERVIEW's power ranking: a row per rated player, opening in `rows`' order (`computeOverview`'s),
 * with the rank, the name, the rounded Elo, the change in their last counted game and their counted
 * games. A provisional player's row is in italics (`.is-provisional`) with no rank. Each head sorts
 * by its column (`SortHeadRow`, #109), `#` marked at the start and the way back to that order:
 * ranks never change, and under `#` provisional rows stay at the bottom either way, while under any
 * other column they take their place. It has `RankedTable`'s look (its classes and
 * `RankedTable.css`, head row included), and scrolls sideways inside its card if it ever has to.
 */
export function PowerRanking({ rows, names }: { rows: PowerRow[]; names: Map<number, string> }): JSX.Element {
  const columns = useMemo(() => powerColumns(names), [names]);
  const { rows: sorted, sort, press } = useTableSort(rows, columns, RANK_ORDER);
  return (
    <ScrollRegion label="Power ranking table">
      <table className="ranked-table power-ranking">
        <SortHeadRow columns={columns} sort={sort} onSort={press} />
        <tbody>
          {sorted.map((row) => (
            <tr key={row.player} className={row.provisional ? "ranked-unranked is-provisional" : undefined}>
              <td className="ranked-rank">{row.rank === null ? "" : `${row.rank}.`}</td>
              <td className="ranked-name">
                <PlayerName player={row.player} name={nameOf(names, row.player)} />
              </td>
              <td className="ranked-value">{formatRating(row.rating)}</td>
              <td className="power-number">{formatSigned(row.lastChange)}</td>
              <td className="power-number">{row.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export default PowerRanking;
