import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { filterSearch } from "../counting";
import { PROVISIONAL_GAMES } from "../elo";
import { FilterBar } from "../FilterBar";
import { viewerTimeZone } from "../format";
import { formatRating } from "../numbers";
import { computePlayersList, withoutPlayerFilter } from "../player";
import PlayerName from "../PlayerName";
import "../RankedTable.css";
import "../tabs/PowerRanking.css";
import { navigate, useLocation, type PageProps } from "../routes";
import { StatCard } from "../StatCard";
import { useStats, type StatsContext } from "../useStats";
import { formatLastPlayed, formatRate } from "./playerText";
import {
  NAME_ORDER,
  noMatchLine,
  pressHead,
  searchPlayers,
  sortPlayers,
  type PlayersColumn,
  type PlayersSort,
} from "./playersOrder";
import "./PlayersPage.css";

/** The Players card's line. */
const DEFINITION = `Every player with a counted game, by name; press a heading to sort by it. Players with fewer than ${PROVISIONAL_GAMES} games are provisional, in italics.`;

/** One of the table's columns: its head's word, the class its head and cells share, and whether
 *  the head's arrow comes before the word (in a column that stands at the right, so the word lines
 *  up with the column's values). */
interface Head {
  column: PlayersColumn;
  label: string;
  className: string;
  arrowFirst: boolean;
}

/** The table's columns, in order. */
const HEADS: readonly Head[] = [
  { column: "name", label: "Player", className: "ranked-name", arrowFirst: false },
  { column: "games", label: "Games", className: "power-number", arrowFirst: true },
  { column: "winRate", label: "Win rate", className: "power-number", arrowFirst: true },
  { column: "rating", label: "Elo", className: "power-number", arrowFirst: true },
  { column: "lastPlayed", label: "Last played", className: "players-last", arrowFirst: true },
];

/**
 * A column's head: a button that sorts by the column (`pressHead`), with an arrow, both ways and
 * dimmed until it sorts the table, then the way it runs, and `aria-sort` on the sorted one.
 */
function SortHead(props: { head: Head; sort: PlayersSort; onSort: (column: PlayersColumn) => void }): JSX.Element {
  const { head, sort, onSort } = props;
  const direction = sort.column === head.column ? sort.direction : null;
  const Arrow = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown;
  const arrow = <Arrow className="players-sort-arrow" aria-hidden="true" />;
  return (
    <th scope="col" className={head.className} aria-sort={direction ?? undefined}>
      <button type="button" className={direction ? "players-sort is-sorted" : "players-sort"} onClick={() => onSort(head.column)}>
        {head.arrowFirst && arrow}
        {head.label}
        {!head.arrowFirst && arrow}
      </button>
    </th>
  );
}

/**
 * PLAYERS' card: a row per player with a counted game in `stats` whose name contains `search`
 * (`searchPlayers`; every row for none), with their counted games, win rate, Elo and when they last
 * played, seen at `now` in `timeZone` (the viewer's by default). It opens in `computePlayersList`'s
 * name order, and each column's head sorts by its column (`sortPlayers`), a second press turning
 * the order round; the sort is this list's state, so a reload opens in name order again. A
 * provisional row is in italics wherever it falls. With no row matching, the card says so in place
 * of the table. It has OVERVIEW's power ranking's look (`RankedTable.css` and `PowerRanking.css`: a
 * header row, rows 44px tall where the stacked query matches); on phones the last played line moves
 * under the name, so the table fits 320px without scrolling, and the Last played head goes with
 * its column.
 */
export function PlayersList(props: { stats: StatsContext; now: number; timeZone?: string; search?: string }): JSX.Element {
  const { stats, now, timeZone, search = "" } = props;
  const [sort, setSort] = useState<PlayersSort>(NAME_ORDER);
  // The viewer's zone, looked up once, for the sort and every row's last played.
  const zone = useMemo(() => timeZone ?? viewerTimeZone(), [timeZone]);
  const rows = useMemo(() => computePlayersList(stats), [stats]);
  const sorted = useMemo(() => sortPlayers(rows, sort, zone), [rows, sort, zone]);
  const matching = searchPlayers(sorted, search);
  const empty = rows.length === 0 ? true : matching.length === 0 ? noMatchLine(search) : false;
  const onSort = (column: PlayersColumn) => setSort(pressHead(sort, column));
  return (
    <StatCard title="Players" definition={DEFINITION} empty={empty}>
      <table className="ranked-table power-ranking players-table">
        <thead>
          <tr>
            {HEADS.map((head) => (
              <SortHead key={head.column} head={head} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
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
