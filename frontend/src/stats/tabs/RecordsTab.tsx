import { Fragment, useMemo, useState, type ReactNode } from "react";
import { countLabel, GAME_NOUNS } from "../activity";
import { compareNames, nameOf, rankRows } from "../counting";
import { formatDuration, sideWord, viewerTimeZone } from "../format";
import { formatPercent, formatRating, formatSigned } from "../numbers";
import PlayerName, { roleClass } from "../PlayerName";
import { RankedTable } from "../RankedTable";
import { computeRecords, streakHolders, type BestPeriod, type PlayerRecords, type RecordStats } from "../records";
import { routePath } from "../routes";
import { StatCard } from "../StatCard";
import StatsLink from "../StatsLink";
import type { StatsContext } from "../useStats";
import "./RecordsTab.css";

const WIN_NOUNS: [string, string] = ["win", "wins"];
const LOSS_NOUNS: [string, string] = ["loss", "losses"];

/** A current streak: "3 wins", or "2 losses" for a negative one. */
const streakText = (current: number) => (current < 0 ? countLabel(-current, LOSS_NOUNS) : countLabel(current, WIN_NOUNS));

/** A best week or month: "3 · Week of 2 Nov 2026". */
const periodText = (period: BestPeriod) => `${period.wins} · ${period.long}`;

/** One card in the tab's grid, named by its slug. */
function Cell({ slug, children }: { slug: string; children: ReactNode }): JSX.Element {
  return (
    <div className="records-cell" data-card={slug}>
      {children}
    </div>
  );
}

/** Players in a line, "Ann, Bo", each name plain text (`link` false) or in the default look. */
function Names(props: { players: number[]; names: Map<number, string>; link?: boolean }): JSX.Element {
  const { players, names, link } = props;
  return (
    <>
      {players.map((player, i) => (
        <Fragment key={player}>
          {i > 0 && ", "}
          <PlayerName player={player} name={nameOf(names, player)} link={link} />
        </Fragment>
      ))}
    </>
  );
}

/**
 * The longest win or losing streak: a line per first and last day, each naming every player
 * whose streak ties the record at its end (teammates share one), then the count and the days.
 */
function StreakLines(props: {
  records: RecordStats;
  which: "longestWin" | "longestLoss";
  nouns: [string, string];
  order: (a: number, b: number) => number;
  names: Map<number, string>;
}): JSX.Element | null {
  const { records, which, nouns, order, names } = props;
  const record = records[which];
  if (record === null) return null;
  const lines = new Map<string, number[]>();
  for (const player of streakHolders(records, which).sort(order)) {
    const run = records.byPlayer.get(player)![which]!;
    const days = `${run.from} to ${run.to}`;
    lines.set(days, [...(lines.get(days) ?? []), player]);
  }
  return (
    <>
      {Array.from(lines, ([days, players]) => (
        <p className="records-line" key={days}>
          <span className="records-names">
            <Names players={players} names={names} link={false} />
          </span>{" "}
          · <span className="records-count">{countLabel(record.length, nouns)}</span> ·{" "}
          <span className="records-when">{days}</span>
        </p>
      ))}
    </>
  );
}

/**
 * RECORDS (Phase 21B): streaks, the best weeks and months, the player of the month and its
 * history, the longest game nights and the rating records, counted in the viewer's time zone.
 * `now` (the time the tab opened, by default) and `timeZone` (the viewer's) are for its tests.
 * Phase 22A adds its trophy holders after the last card.
 */
export function RecordsTab(props: { stats: StatsContext; now?: number; timeZone?: string }): JSX.Element {
  const { stats } = props;
  const [mountedAt] = useState(Date.now);
  const now = props.now ?? mountedAt;
  const zone = props.timeZone ?? viewerTimeZone();
  const records = useMemo(() => computeRecords(stats.counted, stats.elo, now, zone), [stats.counted, stats.elo, now, zone]);
  const { names } = stats;
  const empty = stats.counted.length === 0;

  const name = (player: number) => nameOf(names, player);
  const games = (player: number) => records.byPlayer.get(player)?.games ?? 0;
  /** Players tied for a title: more counted games first, then by name. */
  const byGamesThenName = (a: number, b: number) => games(b) - games(a) || compareNames(name(a), name(b)) || a - b;
  const byName = (a: number, b: number) => compareNames(name(a), name(b)) || a - b;

  const players = Array.from(records.byPlayer.entries());
  const rowsOf = <T,>(value: (p: PlayerRecords) => T | null) =>
    players
      .filter(([, p]) => value(p) !== null)
      .map(([player, p]) => ({ player, value: value(p) as T, count: p.games }));
  const current = rankRows(rowsOf((p) => p.current), (a, b) => b - a, names, 1);
  const bestWeeks = rankRows(rowsOf((p) => p.bestWeek), (a, b) => b.wins - a.wins, names, 1);
  const bestMonths = rankRows(rowsOf((p) => p.bestMonth), (a, b) => b.wins - a.wins, names, 1);

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
          <RankedTable rows={current} format={streakText} names={names} />
        </StatCard>
      </Cell>

      <h2 className="records-heading">Wins</h2>
      <Cell slug="most-wins-week">
        <StatCard
          title="Most wins in a week"
          definition="Each player's best week, Monday to Sunday; a tie goes to the later week."
          empty={empty || (bestWeeks.length === 0 && "No wins in these games.")}
        >
          <RankedTable rows={bestWeeks} format={periodText} names={names} />
        </StatCard>
      </Cell>
      <Cell slug="most-wins-month">
        <StatCard
          title="Most wins in a month"
          definition="Each player's best month; a tie goes to the later month."
          empty={empty || (bestMonths.length === 0 && "No wins in these games.")}
        >
          <RankedTable rows={bestMonths} format={periodText} names={names} />
        </StatCard>
      </Cell>
      <Cell slug="player-of-the-month">
        <StatCard
          title="Player of the month"
          definition={`The most counted wins this month (${month.long}); ties all shown.`}
          empty={empty || (month.players.length === 0 && "No wins yet this month.")}
        >
          <p className="records-line">
            <span className="records-names">
              <Names players={[...month.players].sort(byGamesThenName)} names={names} link={false} />
            </span>{" "}
            · <span className="records-count">{countLabel(month.wins, WIN_NOUNS)}</span>
          </p>
        </StatCard>
      </Cell>
      <Cell slug="players-of-the-month">
        <StatCard
          title="Players of the month"
          definition="Each completed month's player of the month."
          empty={empty || (records.monthHistory.length === 0 && "No completed months yet.")}
        >
          <table className="records-history">
            <tbody>
              {records.monthHistory.map((holder) => (
                <tr key={holder.key}>
                  <td className="records-history-month">{holder.long}</td>
                  <td className="records-history-names">
                    <Names players={[...holder.players].sort(byGamesThenName)} names={names} />
                  </td>
                  <td className="records-history-wins">{countLabel(holder.wins, WIN_NOUNS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StatCard>
      </Cell>

      <h2 className="records-heading">Sessions</h2>
      <Cell slug="most-games-session">
        <StatCard
          title="Most games in one session"
          definition="The longest game nights; a tie goes to the later one."
          empty={empty}
        >
          <ol className="records-sessions">
            {records.topSessions.map((session) => (
              <li key={session.startedAt}>
                {countLabel(session.games, GAME_NOUNS)} · {session.day} · {formatDuration(session.endedAt - session.startedAt)}
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
              Highest peak:{" "}
              <span className="records-names">
                <Names players={[...highestPeak.players].sort(byGamesThenName)} names={names} link={false} />
              </span>{" "}
              · <span className="records-count">{formatRating(highestPeak.rating)}</span>
            </p>
          )}
          {biggestUpset && (
            <>
              <p className="records-line records-upset">
                Biggest upset: <span className={roleClass(biggestUpset.winner)}>{sideWord(biggestUpset.winner)}</span> won
                with a {formatPercent(biggestUpset.chance)} chance ·{" "}
                <span className="records-side">
                  <Names players={[...biggestUpset.winners].sort(byName)} names={names} link={false} />{" "}
                  <span className="records-change">{formatSigned(biggestUpset.change)}</span>
                </span>
                {biggestUpset.losers.length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="records-side">
                      <Names players={[...biggestUpset.losers].sort(byName)} names={names} link={false} />{" "}
                      <span className="records-change">{formatSigned(-biggestUpset.change)}</span>
                    </span>
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
    </div>
  );
}
