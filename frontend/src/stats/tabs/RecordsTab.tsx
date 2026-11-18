import { Fragment, useMemo, useState, type ReactNode } from "react";
import { countLabel, GAME_NOUNS } from "../activity";
import { compareNames, nameOf, rankRows, type Row } from "../counting";
import { formatDuration, sideWord, viewerTimeZone } from "../format";
import { formatPercent, formatRating, formatSigned } from "../numbers";
import PlayerName, { roleClass } from "../PlayerName";
import { RankedTable } from "../RankedTable";
import "../RankedTable.css";
import { playerColumn, rankColumn, SortHeadRow, useTableSort, type HeadColumn } from "../SortHead";
import { RANK_ORDER } from "../sorting";
import {
  computeRecords,
  streakHolders,
  type BestPeriod,
  type PlayerRecords,
  type RecordStats,
  type StreakKind,
} from "../records";
import { TrophyBadge } from "../players/TrophyBadge";
import { routePath } from "../routes";
import { StatCard } from "../StatCard";
import StatsLink from "../StatsLink";
import { computeTrophies, trophyHolders } from "../trophies";
import type { StatsContext } from "../useStats";
import "./sectionGrid.css";
import "./RecordsTab.css";

const WIN_NOUNS: [string, string] = ["win", "wins"];
const LOSS_NOUNS: [string, string] = ["loss", "losses"];

/**
 * The separator between a record's parts: " · ", held to the part before it by a no-break space,
 * so a line that wraps ends with the dot instead of starting with it.
 */
const DOT = " · ";

/** A current streak: "3 wins", or "2 losses" for a negative one. */
const streakText = (current: number) => (current < 0 ? countLabel(-current, LOSS_NOUNS) : countLabel(current, WIN_NOUNS));
/** A current streak's sort figure: the signed run, losses negative. */
const streakFigure = (current: number) => current;

/** One card in the tab's grid, named by its slug. */
function Cell({ slug, children }: { slug: string; children: ReactNode }): JSX.Element {
  return (
    <div className="records-cell" data-card={slug}>
      {children}
    </div>
  );
}

/** A part of a record's line that never breaks inside: a count, a date, a length. */
function Whole({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return <span className={className ? `records-whole ${className}` : "records-whole"}>{children}</span>;
}

/** Players in a line, "Ann, Bo", each name plain text: a record's line is a headline. */
function Names({ players, names }: { players: number[]; names: Map<number, string> }): JSX.Element {
  return (
    <span className="records-names">
      {players.map((player, i) => (
        <Fragment key={player}>
          {i > 0 && ", "}
          <PlayerName player={player} name={nameOf(names, player)} link={false} />
        </Fragment>
      ))}
    </span>
  );
}

/**
 * The longest win or losing streak: a line per first and last day, each naming every player
 * whose streak ties the record at its end (teammates share one), then the count and the days.
 */
function StreakLines(props: {
  records: RecordStats;
  which: StreakKind;
  nouns: [string, string];
  order: (a: number, b: number) => number;
  names: Map<number, string>;
}): JSX.Element | null {
  const { records, which, nouns, order, names } = props;
  const record = records[which];
  if (record === null) return null;
  const lines = new Map<string, { from: string; to: string; players: number[] }>();
  for (const player of streakHolders(records, which).sort(order)) {
    const { from, to } = records.byPlayer.get(player)![which]!;
    const key = `${from} to ${to}`;
    const line = lines.get(key) ?? { from, to, players: [] };
    line.players.push(player);
    lines.set(key, line);
  }
  return (
    <>
      {Array.from(lines, ([key, { from, to, players }]) => (
        <p className="records-line" key={key}>
          <Names players={players} names={names} />
          {DOT}
          <Whole className="records-count">{countLabel(record.length, nouns)}</Whole>
          {DOT}
          <span className="records-when">
            <Whole>{from}</Whole> to <Whole>{to}</Whole>
          </span>
        </p>
      ))}
    </>
  );
}

/** A best-period table's columns. */
type PeriodColumn = "rank" | "name" | "wins";

/** The table's columns, in order: `#`, Player (the period under the name does not sort) and Wins,
 *  most first. */
function periodColumns(names: Map<number, string>): HeadColumn<Row<BestPeriod>, PeriodColumn>[] {
  return [
    rankColumn<Row<BestPeriod>>((row) => row.rank),
    playerColumn<Row<BestPeriod>>((row) => nameOf(names, row.player)),
    { key: "wins", label: "Wins", className: "ranked-value", end: true, first: "descending", value: (row) => row.value.wins },
  ];
}

/**
 * Each player's best week or month, ranked by its wins, in RankedTable's look and classes: the
 * rank, the name over the period, and the wins, so a long name keeps the width the period would
 * take beside it. A head row names each column and sorts by it (`SortHeadRow`, #109): it opens in
 * rank order, `#` marked, ranks never change, and each period stays under its name.
 */
function PeriodTable({ rows, names }: { rows: Row<BestPeriod>[]; names: Map<number, string> }): JSX.Element {
  const columns = useMemo(() => periodColumns(names), [names]);
  const { rows: sorted, sort, press } = useTableSort(rows, columns, RANK_ORDER);
  return (
    <table className="ranked-table">
      <SortHeadRow columns={columns} sort={sort} onSort={press} />
      <tbody>
        {sorted.map((row) => (
          <tr key={row.player}>
            <td className="ranked-rank">{`${row.rank}.`}</td>
            <td className="ranked-name">
              <PlayerName player={row.player} name={nameOf(names, row.player)} />
              <span className="records-sub">{row.value.long}</span>
            </td>
            <td className="ranked-value">{countLabel(row.value.wins, WIN_NOUNS)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * RECORDS (Phase 21B): streaks, the best weeks and months, the player of the month and its
 * history, the longest game nights and the rating records, counted in the viewer's time zone.
 * `now` (the time the tab opened, by default) and `timeZone` (the viewer's) are for its tests.
 * Last come the trophy holders (Phase 22A): each trophy and who holds it under this filter.
 */
export function RecordsTab(props: { stats: StatsContext; now?: number; timeZone?: string }): JSX.Element {
  const { stats } = props;
  const [mountedAt] = useState(Date.now);
  const now = props.now ?? mountedAt;
  const zone = props.timeZone ?? viewerTimeZone();
  const records = useMemo(() => computeRecords(stats.counted, stats.elo, now, zone), [stats.counted, stats.elo, now, zone]);
  const trophies = useMemo(() => trophyHolders(computeTrophies(stats, now, zone), stats.names), [stats, now, zone]);
  const { names } = stats;
  const empty = stats.counted.length === 0;

  const name = (player: number) => nameOf(names, player);
  const games = (player: number) => records.byPlayer.get(player)?.games ?? 0;
  /** Players tied for a title: more counted games first, then by name. */
  const byGamesThenName = (a: number, b: number) => games(b) - games(a) || compareNames(name(a), name(b)) || a - b;
  const byName = (a: number, b: number) => compareNames(name(a), name(b)) || a - b;
  /** A copy of `players` in the order tied holders of a title are listed. */
  const inTitleOrder = (players: number[]) => [...players].sort(byGamesThenName);

  const players = Array.from(records.byPlayer.entries());
  const rowsOf = <T,>(value: (p: PlayerRecords) => T | null) =>
    players.flatMap(([player, p]) => {
      const v = value(p);
      return v === null ? [] : [{ player, value: v, count: p.games }];
    });
  const current = rankRows(rowsOf((p) => p.current), (a, b) => b - a, names, 1);
  const byWins = (a: BestPeriod, b: BestPeriod) => b.wins - a.wins;
  const bestWeeks = rankRows(rowsOf((p) => p.bestWeek), byWins, names, 1);
  const bestMonths = rankRows(rowsOf((p) => p.bestMonth), byWins, names, 1);

  const month = records.playerOfTheMonth;
  const { highestPeak, biggestUpset } = records;
  return (
    <div className="records-tab">
      <h2 className="records-heading">Streaks</h2>
      <Cell slug="longest-win-streak">
        <StatCard
          title="Longest win streak"
          definition="The most counted wins in a row; a tie goes to the later streak."
          empty={empty || (records.longestWin === null && "No wins in these games.")}
        >
          <StreakLines records={records} which="longestWin" nouns={WIN_NOUNS} order={byGamesThenName} names={names} />
        </StatCard>
      </Cell>
      <Cell slug="longest-losing-streak">
        <StatCard
          title="Longest losing streak"
          definition="The most counted losses in a row; a tie goes to the later streak."
          empty={empty || (records.longestLoss === null && "No losses in these games.")}
        >
          <StreakLines records={records} which="longestLoss" nouns={LOSS_NOUNS} order={byGamesThenName} names={names} />
        </StatCard>
      </Cell>
      <Cell slug="current-streaks">
        <StatCard title="Current streaks" definition="Each player's run as of their last counted game." empty={empty}>
          <RankedTable rows={current} format={streakText} names={names} valueHead="Streak" sortValue={streakFigure} />
        </StatCard>
      </Cell>

      <h2 className="records-heading">Wins</h2>
      <Cell slug="most-wins-week">
        <StatCard
          title="Most wins in a week"
          definition="Each player's best week, Monday to Sunday; a tie goes to the later week."
          empty={empty || (bestWeeks.length === 0 && "No wins in these games.")}
        >
          <PeriodTable rows={bestWeeks} names={names} />
        </StatCard>
      </Cell>
      <Cell slug="most-wins-month">
        <StatCard
          title="Most wins in a month"
          definition="Each player's best month; a tie goes to the later month."
          empty={empty || (bestMonths.length === 0 && "No wins in these games.")}
        >
          <PeriodTable rows={bestMonths} names={names} />
        </StatCard>
      </Cell>
      <Cell slug="player-of-the-month">
        <StatCard
          title="Player of the month"
          definition={`The most counted wins this month (${month.long}); ties all shown.`}
          empty={empty || (month.players.length === 0 && "No wins yet this month.")}
        >
          <p className="records-line">
            <Names players={inTitleOrder(month.players)} names={names} />
            {DOT}
            <Whole className="records-count">{countLabel(month.wins, WIN_NOUNS)}</Whole>
          </p>
        </StatCard>
      </Cell>
      <Cell slug="players-of-the-month">
        <StatCard
          title="Players of the month"
          definition="Each completed month's player of the month."
          empty={empty || (records.monthHistory.length === 0 && "No completed months yet.")}
        >
          <table className="ranked-table">
            <tbody>
              {records.monthHistory.map((holder) => (
                <tr key={holder.key}>
                  <td className="ranked-name">
                    <span className="records-sub">{holder.long}</span>
                    <ul className="records-holders">
                      {inTitleOrder(holder.players).map((player) => (
                        <li key={player}>
                          <PlayerName player={player} name={name(player)} />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="ranked-value">{countLabel(holder.wins, WIN_NOUNS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StatCard>
      </Cell>

      <h2 className="records-heading">Sessions</h2>
      <Cell slug="most-games-session">
        <StatCard title="Most games in one session" definition="The longest game nights; a tie goes to the later one." empty={empty}>
          <ol className="records-sessions">
            {records.topSessions.map((session) => (
              <li key={session.startedAt}>
                <Whole>{countLabel(session.games, GAME_NOUNS)}</Whole>
                {DOT}
                <Whole>{session.day}</Whole>
                {DOT}
                <Whole>{formatDuration(session.endedAt - session.startedAt)}</Whole>
              </li>
            ))}
          </ol>
        </StatCard>
      </Cell>

      <h2 className="records-heading">Ratings</h2>
      <Cell slug="rating-records">
        <StatCard
          title="Rating records"
          definition="The highest Elo reached, and the win least expected, under this filter."
          empty={empty || (highestPeak === null && biggestUpset === null && "No ratings in these games.")}
        >
          {highestPeak && (
            <p className="records-line records-peak">
              Highest peak: <Names players={inTitleOrder(highestPeak.players)} names={names} />
              {DOT}
              <Whole className="records-count">{formatRating(highestPeak.rating)}</Whole>
            </p>
          )}
          {biggestUpset && (
            <>
              <p className="records-line records-upset">
                Biggest upset: <span className={roleClass(biggestUpset.winner)}>{sideWord(biggestUpset.winner)}</span> won
                with a <Whole>{formatPercent(biggestUpset.chance)} chance</Whole>
                {DOT}
                <Names players={[...biggestUpset.winners].sort(byName)} names={names} />
                {" "}
                <Whole className="records-change">{formatSigned(biggestUpset.change)}</Whole>
                {biggestUpset.losers.length > 0 && (
                  <>
                    {DOT}
                    <Names players={[...biggestUpset.losers].sort(byName)} names={names} />
                    {" "}
                    <Whole className="records-change">{formatSigned(-biggestUpset.change)}</Whole>
                  </>
                )}
              </p>
              <StatsLink href={routePath({ page: "game", id: biggestUpset.gameId })} className="records-game-link">
                See the game
              </StatsLink>
            </>
          )}
        </StatCard>
      </Cell>

      <h2 className="records-heading">Trophies</h2>
      <Cell slug="trophy-holders">
        <StatCard title="Trophy holders" definition="Worked out from the counted games. Most need 8 of them." empty={empty}>
          <table className="ranked-table trophy-holders">
            <tbody>
              {trophies.map(({ trophy, players: holders }) => (
                <tr key={trophy.id}>
                  <th scope="row" className="trophy-holders-trophy">
                    <TrophyBadge trophy={trophy} />
                    <span className="records-sub trophy-rule">{trophy.rule}</span>
                  </th>
                  <td className="trophy-holders-names">
                    {holders.length === 0 ? (
                      <span className="trophy-holders-none">No one yet.</span>
                    ) : (
                      holders.map((player, i) => (
                        <Fragment key={player}>
                          {i > 0 && " "}
                          <span className="trophy-holder">
                            <PlayerName player={player} name={name(player)} />
                            {i < holders.length - 1 && ","}
                          </span>
                        </Fragment>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </StatCard>
      </Cell>
    </div>
  );
}
