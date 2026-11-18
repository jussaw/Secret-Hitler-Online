import { Fragment, useMemo, useState } from "react";
import { LineChart, SERIES_COLORS, type LineSeries } from "../charts/LineChart";
import { MIN_GAMES, nameOf, type Rate } from "../counting";
import { PROVISIONAL_GAMES } from "../elo";
import { formatLocalDateTime, outcomeLabel, plural, sideWord } from "../format";
import { formatDays, formatPercent, wholePercent } from "../numbers";
import {
  computeOverview,
  HOT_HAND_GAMES,
  HOT_HAND_WINS,
  RECENT_DAYS,
  ratingPointDetail,
  type Leaders,
} from "../overview";
import PlayerName, { roleClass } from "../PlayerName";
import { RankedTable } from "../RankedTable";
import type { GameRecord } from "../record";
import { routePath } from "../routes";
import { StatCard } from "../StatCard";
import StatsLink from "../StatsLink";
import type { StatsContext } from "../useStats";
import { PowerRanking } from "./PowerRanking";
import "./OverviewTab.css";

/** A game's result: `outcomeLabel`, its first word (the winners') in their side's colour. */
function GameResult({ record }: { record: GameRecord }): JSX.Element {
  const label = outcomeLabel(record);
  if (record.winner === null) return <>{label}</>;
  const winners = sideWord(record.winner);
  return (
    <>
      <span className={roleClass(record.winner)}>{winners}</span>
      {label.slice(winners.length)}
    </>
  );
}

/** A dashboard value naming its leaders, every tied one, then `note`: "Ann, Bo · 4 wins". */
function LeadersValue(props: { leaders: Leaders; names: Map<number, string>; note: string }): JSX.Element {
  const { leaders, names, note } = props;
  return (
    <p className="overview-value">
      <span className="overview-names">
        {leaders.players.map((player, i) => (
          <Fragment key={player}>
            {i > 0 && ", "}
            <PlayerName player={player} name={nameOf(names, player)} link={false} />
          </Fragment>
        ))}
      </span>
      <span className="overview-note"> · {note}</span>
    </p>
  );
}

const showNumber = (value: number) => String(value);
const showRate = (rate: Rate) => (rate.value === null ? "—" : formatPercent(rate.value));
/** What a count sorts by: itself. */
const byNumber = (value: number) => value;
/** What a rate sorts by: the whole percent it shows. */
const byRate = (rate: Rate) => (rate.value === null ? null : wholePercent(rate.value));

/** The cards' lines that name a rule's numbers, from the rules' own constants. */
const WITHIN = `the last ${RECENT_DAYS} days`;
const COPY = {
  winStreak: `The longest current run of wins, among players seen in ${WITHIN}.`,
  noWinStreak: `No current win streaks in ${WITHIN}.`,
  hotHand: `Won at least ${HOT_HAND_WINS} of their last ${HOT_HAND_GAMES} games, and played in ${WITHIN}.`,
  noHotHand: `No one has won ${HOT_HAND_WINS} of their last ${HOT_HAND_GAMES} in ${WITHIN}.`,
  powerRanking: `Elo ratings. Players with fewer than ${PROVISIONAL_GAMES} games are provisional, in italics at the bottom.`,
  winRate: `Share of their games each player won, from ${MIN_GAMES} games.`,
};

/**
 * OVERVIEW (`/stats`): the dashboard, the power ranking and the rating history, the headline
 * numbers and the latest games, over the counted games. `now` (the time the tab opened, by
 * default) and `timeZone` (the viewer's, by default) are for its tests.
 */
export function OverviewTab(props: { stats: StatsContext; now?: number; timeZone?: string }): JSX.Element {
  const { stats, now, timeZone } = props;
  const [opened] = useState(Date.now);
  const at = now ?? opened;
  const overview = useMemo(() => computeOverview(stats, at, timeZone), [stats, at, timeZone]);
  const { names, counted } = stats;
  const none = counted.length === 0;

  // A colour per player by their place among every player, so a filter never changes it.
  const colors = useMemo(() => {
    const out: Record<string, string> = {};
    [...stats.data.players]
      .sort((a, b) => a.number - b.number)
      .forEach((player, i) => {
        out[String(player.number)] = SERIES_COLORS[i % SERIES_COLORS.length];
      });
    return out;
  }, [stats.data.players]);
  const series: LineSeries[] = overview.ratingHistory.map((line) => ({
    key: String(line.player),
    label: nameOf(names, line.player),
    points: line.points.map((p) => ({ x: p.game, y: p.rating, dashed: p.provisional })),
  }));
  const detail = (s: LineSeries, index: number) => {
    const line = overview.ratingHistory.find((l) => String(l.player) === s.key)!;
    const point = line.points[index];
    return ratingPointDetail(counted[point.game], s.label, point, timeZone);
  };

  const { daysSinceLastGame, lastGame, winStreak, hotHand, playerOfMonth, headline } = overview;
  return (
    <div className="overview-tab">
      <section className="overview-grid overview-dashboard" aria-label="At a glance">
        <StatCard
          title="Since last game"
          definition="Whole days since the last counted game ended."
          empty={daysSinceLastGame === null}
        >
          {daysSinceLastGame !== null && <p className="overview-value">{formatDays(daysSinceLastGame)}</p>}
        </StatCard>
        <StatCard title="Last game" definition="The most recent counted game." empty={lastGame === null}>
          {lastGame && (
            <StatsLink href={routePath({ page: "game", id: lastGame.id })} className="overview-game-link overview-last-game">
              <span className="overview-game-result">
                <GameResult record={lastGame} />
              </span>{" "}
              <span className="overview-game-when">{formatLocalDateTime(lastGame.startedAt, timeZone)}</span>
            </StatsLink>
          )}
        </StatCard>
        <StatCard title="Win streak" definition={COPY.winStreak} empty={none || (winStreak === null && COPY.noWinStreak)}>
          {winStreak && <LeadersValue leaders={winStreak} names={names} note={plural(winStreak.value, "win")} />}
        </StatCard>
        <StatCard title="Hot hand" definition={COPY.hotHand} empty={none || (hotHand === null && COPY.noHotHand)}>
          {hotHand && <LeadersValue leaders={hotHand} names={names} note={`${hotHand.value} of ${HOT_HAND_GAMES}`} />}
        </StatCard>
        <StatCard
          title="Player of the month"
          definition="Most wins this month."
          empty={none || (playerOfMonth === null && "No wins yet this month.")}
        >
          {playerOfMonth && <LeadersValue leaders={playerOfMonth} names={names} note={plural(playerOfMonth.value, "win")} />}
        </StatCard>
      </section>

      <h2 className="overview-heading">Ratings</h2>
      <div className="overview-grid overview-ratings">
        <StatCard
          title="Power ranking"
          definition={COPY.powerRanking}
          empty={overview.powerRanking.length === 0}
        >
          <PowerRanking rows={overview.powerRanking} names={names} />
        </StatCard>
        <StatCard
          title="Rating history"
          definition="Each player's rating after every counted game, dashed while provisional."
          empty={series.length === 0}
        >
          <LineChart series={series} label="Rating history" colors={colors} detail={detail} />
        </StatCard>
      </div>

      <h2 className="overview-heading">Headline</h2>
      <div className="overview-grid overview-headline">
        <StatCard title="Games played" definition="Counted games each player played." empty={headline.games.length === 0}>
          <RankedTable rows={headline.games} format={showNumber} names={names} valueHead="Games" sortValue={byNumber} />
        </StatCard>
        <StatCard title="Wins" definition="Counted games each player won." empty={headline.wins.length === 0}>
          <RankedTable rows={headline.wins} format={showNumber} names={names} valueHead="Wins" sortValue={byNumber} />
        </StatCard>
        <StatCard
          title="Win rate"
          definition={COPY.winRate}
          empty={headline.winRate.length === 0}
        >
          <RankedTable
            rows={headline.winRate}
            format={showRate}
            names={names}
            valueHead="Win rate"
            sortValue={byRate}
            countHead="Games"
          />
        </StatCard>
        <StatCard
          title="Current streak"
          definition="Wins in a row up to each player's latest game."
          empty={headline.currentStreak.length === 0}
        >
          <RankedTable rows={headline.currentStreak} format={showNumber} names={names} valueHead="Streak" sortValue={byNumber} />
        </StatCard>
        <StatCard
          title="Longest streak"
          definition="The most wins in a row each player has had."
          empty={headline.longestStreak.length === 0}
        >
          <RankedTable rows={headline.longestStreak} format={showNumber} names={names} valueHead="Streak" sortValue={byNumber} />
        </StatCard>
        <StatCard title="Liberal / Fascist wins" definition="Counted games won by each side." empty={none}>
          <p className="overview-value">
            <span className="stats-liberal">{headline.liberalWins}</span> /{" "}
            <span className="stats-fascist">{headline.fascistWins}</span>
          </p>
        </StatCard>
      </div>

      <h2 className="overview-heading">Games</h2>
      <StatCard
        title="Latest games"
        definition="The ten most recent counted games."
        empty={overview.latestGames.length === 0}
      >
        <ul className="overview-games">
          {overview.latestGames.map((record) => (
            <li key={record.id}>
              <StatsLink href={routePath({ page: "game", id: record.id })} className="overview-game-link">
                <span className="overview-game-when">{formatLocalDateTime(record.startedAt, timeZone)}</span>{" "}
                <span className="overview-game-result">
                  <GameResult record={record} />
                </span>
              </StatsLink>
            </li>
          ))}
        </ul>
      </StatCard>
    </div>
  );
}
