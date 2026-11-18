import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { filterSearch } from "../counting";
import { PROVISIONAL_GAMES } from "../elo";
import { FilterBar } from "../FilterBar";
import { viewerTimeZone } from "../format";
import { formatRating } from "../numbers";
import { computePlayersList, withoutPlayerFilter, type PlayerListRow } from "../player";
import PlayerName from "../PlayerName";
import "../RankedTable.css";
import "../tabs/PowerRanking.css";
import { navigate, useLocation, type PageProps } from "../routes";
import { SortHeadRow, useTableSort, type HeadColumn } from "../SortHead";
import { StatCard } from "../StatCard";
import { useStats, type StatsContext } from "../useStats";
import { formatLastPlayed, formatRate } from "./playerText";
import { NAME_ORDER, noMatchLine, playersColumns, searchPlayers, type PlayersColumn } from "./playersOrder";
import "./PlayersPage.css";

/** The Players card's line. */
const DEFINITION = `Every player with a counted game, by name; press a heading to sort by it. Players with fewer than ${PROVISIONAL_GAMES} games are provisional, in italics.`;

/** Each column's head, by column (the compiler checks every column has one): its word, the class
 *  its head and cells share, and whether its values stand at the right (`end`: the arrow before
 *  the word, so the word lines up with them). */
const HEADS: Readonly<Record<PlayersColumn, Pick<HeadColumn<PlayerListRow, PlayersColumn>, "label" | "className" | "end">>> = {
  name: { label: "Player", className: "ranked-name", end: false },
  games: { label: "Games", className: "power-number", end: true },
  winRate: { label: "Win rate", className: "power-number", end: true },
  rating: { label: "Elo", className: "power-number", end: true },
  lastPlayed: { label: "Last played", className: "players-last", end: true },
};

/** The table's columns, in `playersColumns`' order, each with its sort in `timeZone` and its head. */
function playersHeads(timeZone: string): HeadColumn<PlayerListRow, PlayersColumn>[] {
  return playersColumns(timeZone).map((column) => ({ ...column, ...HEADS[column.key] }));
}

/**
 * PLAYERS' card: a row per player with a counted game in `stats` whose name contains `search`
 * (`searchPlayers`; every row for none), with their counted games, win rate, Elo and when they last
 * played, seen at `now` in `timeZone` (the viewer's by default). It opens in `computePlayersList`'s
 * name order, and each column's head (`SortHeadRow`) sorts by its column (`useTableSort` over
 * `playersColumns`, ties in that name order), a second press turning the order round; the sort is
 * this list's state, so a reload opens in name order again. A provisional row is in italics
 * wherever it falls. With no row matching, the card says so in place of the table. It has
 * OVERVIEW's power ranking's look (`RankedTable.css` and `PowerRanking.css`: a header row, rows
 * 44px tall where the stacked query matches); on phones the last played line moves under the name,
 * so the table fits 320px without scrolling, and the Last played head goes with its column.
 */
export function PlayersList(props: { stats: StatsContext; now: number; timeZone?: string; search?: string }): JSX.Element {
  const { stats, now, timeZone, search = "" } = props;
  // The viewer's zone, looked up once, for the sort and every row's last played.
  const zone = useMemo(() => timeZone ?? viewerTimeZone(), [timeZone]);
  const heads = useMemo(() => playersHeads(zone), [zone]);
  const listed = useMemo(() => computePlayersList(stats), [stats]); // in name order
  const { rows: sorted, sort, press } = useTableSort(listed, heads, NAME_ORDER);
  const matching = searchPlayers(sorted, search);
  const empty = listed.length === 0 ? true : matching.length === 0 ? noMatchLine(search) : false;
  return (
    <StatCard title="Players" definition={DEFINITION} empty={empty}>
      <table className="ranked-table power-ranking players-table">
        <SortHeadRow columns={heads} sort={sort} onSort={press} />
        <tbody>
          {matching.map((row) => {
            const last = formatLastPlayed(row.lastPlayed, now, zone);
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

/** PLAYERS' search box, left of the switch in the filter bar: a search field with Lucide's Search in it. */
function PlayersSearch(props: { value: string; onChange: (value: string) => void }): JSX.Element {
  return (
    <div className="players-search">
      <Search className="players-search-icon" aria-hidden="true" />
      <input
        type="search"
        aria-label="Search players"
        placeholder="Search players"
        autoComplete="off"
        spellCheck={false}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * PLAYERS (`/players`): the search box and the CPU switch, which stands alone as on a player's
 * page, above the list of every player with a counted game. The list ignores a player filter in
 * the address (the user found one unnecessary here), and the switch writes only `cpu`, so its next
 * change drops it. The search is this page's state, never the address (which would take a history
 * entry per letter); the page stays mounted while the switch moves the address, so the search and
 * the list's sort both stay. `now` is the time the page opened.
 */
export default function PlayersPage(_props: PageProps): JSX.Element {
  const stats = useStats();
  const { pathname } = useLocation();
  const [now] = useState(Date.now);
  const [search, setSearch] = useState("");
  const everyone = useMemo(() => (stats ? withoutPlayerFilter(stats) : null), [stats]);
  if (!everyone) return <></>; // the records are on their way (StatsApp shows them once they come)
  return (
    <div className="players-page">
      <FilterBar
        players={everyone.data.players}
        filter={everyone.filter}
        onChange={(next) => navigate(pathname + filterSearch(next))}
        showPlayers={false}
        beforeSwitch={<PlayersSearch value={search} onChange={setSearch} />}
      />
      <PlayersList stats={everyone} now={now} search={search} />
    </div>
  );
}
