import { nameOf } from "../counting";
import { formatRating, formatSigned } from "../numbers";
import type { PowerRow } from "../overview";
import PlayerName from "../PlayerName";
import "../RankedTable.css";
import { ScrollRegion } from "../ScrollRegion";
import "./PowerRanking.css";

/**
 * OVERVIEW's power ranking: a row per rated player, in `rows`' order (`computeOverview`'s), with
 * the rank, the name, the rounded Elo, the change in their last counted game and their counted
 * games. A provisional player's row is in italics (`.is-provisional`) with no rank. It has
 * `RankedTable`'s look (its classes and `RankedTable.css`), with a header row, and scrolls
 * sideways inside its card if it ever has to.
 */
export function PowerRanking({ rows, names }: { rows: PowerRow[]; names: Map<number, string> }): JSX.Element {
  return (
    <ScrollRegion label="Power ranking table">
      <table className="ranked-table power-ranking">
        <thead>
          <tr>
            <th scope="col" className="ranked-rank">
              #
            </th>
            <th scope="col" className="ranked-name">
              Player
            </th>
            <th scope="col" className="power-number">
              Elo
            </th>
            <th scope="col" className="power-number">
              Last
            </th>
            <th scope="col" className="power-number">
              Games
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
