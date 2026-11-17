import { useMemo, useState } from "react";
import { filterSearch } from "../counting";
import { PROVISIONAL_GAMES } from "../elo";
import { FilterBar } from "../FilterBar";
import { formatRating } from "../numbers";
import { computePlayersList } from "../player";
import PlayerName from "../PlayerName";
import "../RankedTable.css";
import "../tabs/PowerRanking.css";
import { navigate, useLocation, type PageProps } from "../routes";
import { StatCard } from "../StatCard";
import { useStats, type StatsContext } from "../useStats";
import { formatLastPlayed, formatRate } from "./playerText";
import "./PlayersPage.css";

/** The Players card's line. */
const DEFINITION = `Every player with a counted game, by Elo. Players with fewer than ${PROVISIONAL_GAMES} games are provisional, in italics at the bottom.`;

/**
 * PLAYERS' card: a row per player with a counted game under the filter, in `computePlayersList`'s
 * order (OVERVIEW's power ranking), with their counted games, win rate, Elo and when they last
 * played, seen at `now` in `timeZone` (the viewer's by default). A provisional row is in italics.
 * It has OVERVIEW's power ranking's look (`RankedTable.css` and `PowerRanking.css`: a header row,
 * rows 44px tall where the stacked query matches); on phones the last played line moves under the
 * name, so the table fits 320px without scrolling.
 */
export function PlayersList(props: { stats: StatsContext; now: number; timeZone?: string }): JSX.Element {
  const { stats, now, timeZone } = props;
  const rows = useMemo(() => computePlayersList(stats), [stats]);
  return (
    <StatCard title="Players" definition={DEFINITION} empty={rows.length === 0}>
      <table className="ranked-table power-ranking players-table">
        <thead>
          <tr>
            <th scope="col" className="ranked-name">
              Player
            </th>
            <th scope="col" className="power-number">
              Games
            </th>
            <th scope="col" className="power-number">
              Win rate
            </th>
            <th scope="col" className="power-number">
              Elo
            </th>
            <th scope="col" className="players-last">
              Last played
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const last = formatLastPlayed(row.lastPlayed, now, timeZone);
            return (
              <tr key={row.player} className={row.provisional ? "ranked-unranked is-provisional" : undefined}>
                <td className="ranked-name">
                  <PlayerName player={row.player} name={row.name} />
                  <span className="players-last-under">played {last}</span>
                </td>
                <td className="power-number">{row.games}</td>
                <td className="power-number">{formatRate(row.winRate)}</td>
                <td className="ranked-value">{formatRating(row.rating)}</td>
                <td className="players-last">{last}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </StatCard>
  );
}

/**
 * PLAYERS (`/stats/players`): the stats filter, which lives in the address, above the list of
 * every player it counts games for. `now` is the time the page opened.
 */
export default function PlayersPage(_props: PageProps): JSX.Element {
  const stats = useStats();
  const { pathname } = useLocation();
  const [now] = useState(Date.now);
  if (!stats) return <></>; // the records are on their way (StatsApp shows them once they come)
  return (
    <div className="players-page">
      <FilterBar
        players={stats.data.players}
        filter={stats.filter}
        onChange={(next) => navigate(pathname + filterSearch(next))}
      />
      <PlayersList stats={stats} now={now} />
    </div>
  );
}
