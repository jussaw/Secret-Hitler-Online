import { Fragment, useMemo, useState, type ReactNode } from "react";
import { computeActivity, countLabel, GAME_NOUNS, hourLabel, LAST_12_MONTHS, weekdayLabel, type Grain } from "../activity";
import { BarChart } from "../charts/BarChart";
import { CalendarHeatmap } from "../charts/CalendarHeatmap";
import { SERIES_COLORS } from "../charts/LineChart";
import { StackedBarChart } from "../charts/StackedBarChart";
import { compareNames, MIN_CHANCES, nameOf, rankRows, rate, type Rate } from "../counting";
import { viewerTimeZone } from "../format";
import { formatPercent } from "../numbers";
import PlayerName from "../PlayerName";
import { RankedTable } from "../RankedTable";
import { SplitTable, type SplitCell } from "../SplitTable";
import { StatCard } from "../StatCard";
import { computeTiming, DECISIONS, fastestVoter, formatAverageTime, type Decision } from "../timing";
import type { StatsContext } from "../useStats";
import "./ActivityTab.css";

const GRAINS: { id: Grain; label: string }[] = [
  { id: "week", label: "PER WEEK" },
  { id: "month", label: "PER MONTH" },
];
const DECISION_LABELS: Record<Decision, string> = {
  nominate: "Nominate",
  vote: "Vote",
  discard: "Discard",
  chancellor: "Chancellor",
  power: "Power",
  endTerm: "End term",
};

/** A row of choice buttons, the chosen one pressed and in the office orange. */
function Choices<T extends string>({
  label,
  choices,
  chosen,
  onChoose,
}: {
  label: string;
  choices: { id: T; label: string }[];
  chosen: T;
  onChoose: (id: T) => void;
}): JSX.Element {
  return (
    <div className="activity-choices" role="group" aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          className={choice.id === chosen ? "activity-choice" : "activity-choice stats-grey"}
          aria-pressed={choice.id === chosen}
          onClick={() => onChoose(choice.id)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

/** One card in the tab's grid, `wide` across every column. */
function Cell({ slug, wide = false, children }: { slug: string; wide?: boolean; children: ReactNode }): JSX.Element {
  return (
    <div className={wide ? "activity-cell activity-wide" : "activity-cell"} data-card={slug}>
      {children}
    </div>
  );
}

/** A section of the tab: its heading across the grid, then its cards. */
function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="activity-section">
      <h2 className="activity-heading">{title}</h2>
      {children}
    </div>
  );
}

/** Names in a sentence: "Ann", "Ann and Bo", "Ann, Bo and Cy". */
function listOf(names: ReactNode[]): ReactNode {
  return names.map((name, i) => (
    <Fragment key={i}>
      {i > 0 && (i === names.length - 1 ? " and " : ", ")}
      {name}
    </Fragment>
  ));
}

/**
 * ACTIVITY (Phase 21A): when the group plays, in the viewer's time zone (`timeZone`, for tests),
 * and how long each decision takes. `now`, for tests, is the time "days since the last game"
 * counts to: the tab's first draw otherwise.
 */
export function ActivityTab({ stats, now, timeZone }: { stats: StatsContext; now?: number; timeZone?: string }): JSX.Element {
  const [mountedAt] = useState(Date.now);
  const nowMs = now ?? mountedAt;
  const viewerZone = timeZone ?? viewerTimeZone();
  const { counted, data, names } = stats;
  const activity = useMemo(() => computeActivity(counted, nowMs, viewerZone), [counted, nowMs, viewerZone]);
  const timing = useMemo(() => computeTiming(counted), [counted]);
  const [grain, setGrain] = useState<Grain>("week");
  const [chosenView, setView] = useState(LAST_12_MONTHS);

  const empty = counted.length === 0;
  const name = (player: number) => nameOf(names, player);
  const periods = activity.periods[grain];
  const view = activity.heatmaps.find((h) => h.id === chosenView) ?? activity.heatmaps[0];

  // Attendance: each player's part of each period, in the players' order, coloured by that order.
  const colors: Record<string, string> = {};
  const legend: Record<string, string> = {};
  data.players.forEach((player, i) => {
    colors[String(player.number)] = SERIES_COLORS[i % SERIES_COLORS.length];
    legend[String(player.number)] = player.name;
  });
  const attendance = periods.map((period) => ({
    label: period.label,
    parts: data.players
      .filter((player) => (period.byPlayer.get(player.number) ?? 0) > 0)
      .map((player) => ({ key: String(player.number), value: period.byPlayer.get(player.number)! })),
  }));

  const participation = rankRows(
    Array.from(activity.byPlayer, ([player, a]) => ({ player, value: a.share, count: a.games })),
    (a, b) => b - a,
    names,
    1
  );

  const timed = Array.from(timing.byPlayer).filter(([, t]) => DECISIONS.some((kind) => t.decisions[kind].count > 0));
  const decisionRows = timed.map(([player, t]) => {
    const cells: Record<string, SplitCell> = {};
    for (const kind of DECISIONS) {
      const { count, ms } = t.decisions[kind];
      cells[kind] = { text: count >= MIN_CHANCES && ms !== null ? formatAverageTime(ms) : "—", count };
    }
    return { player, cells };
  });

  const fastest = fastestVoter(timing, names);
  const fastestVotes = fastest === null ? null : timing.byPlayer.get(fastest)!.decisions.vote;
  const slowest = [...timing.slowestPresident].sort((a, b) => compareNames(name(a), name(b)) || a - b);
  const slowestMs = slowest.length > 0 ? timing.byPlayer.get(slowest[0])!.asPresident.ms : null;

  const presidents = rankRows(
    Array.from(timing.byPlayer)
      .filter(([, t]) => t.termsEnded > 0)
      .map(([player, t]) => ({ player, value: rate(t.countdownEnded, t.termsEnded), count: t.termsEnded })),
    (a: Rate, b: Rate) => (b.value ?? 0) - (a.value ?? 0),
    names,
    MIN_CHANCES
  );
  const { countdown } = timing;
  const termCount = (n: number) => countLabel(n, ["term", "terms"]);

  const drops = rankRows(
    Array.from(timing.byPlayer)
      .filter(([, t]) => t.drops > 0)
      .map(([player, t]) => ({ player, value: t.drops, count: t.games })),
    (a, b) => b - a,
    names,
    1
  );

  const { busiest, sessions, longestGap } = activity;
  return (
    <div className="activity-tab">
      <Section title="Games">
        <Cell slug="games-over-time" wide>
          <StatCard title="Games over time" definition="Counted games started each week (the last 52) or each month." empty={empty}>
            <Choices label="Period" choices={GRAINS} chosen={grain} onChoose={setGrain} />
            <BarChart
              bars={periods.map((p) => ({ label: p.label, long: p.long, value: p.games }))}
              label={`Games per ${grain}`}
              unit={GAME_NOUNS}
            />
          </StatCard>
        </Cell>
        <Cell slug="cumulative-games" wide>
          <StatCard title="Cumulative games" definition="All counted games so far, at the end of each week or month." empty={empty}>
            <BarChart
              bars={periods.map((p) => ({ label: p.label, long: p.long, value: p.cumulative }))}
              label={`Cumulative games per ${grain}`}
              unit={GAME_NOUNS}
            />
          </StatCard>
        </Cell>
        <Cell slug="attendance" wide>
          <StatCard title="Attendance" definition={`Each player's counted games each ${grain}.`} empty={empty}>
            <StackedBarChart bars={attendance} colors={colors} legend={legend} label={`Attendance per ${grain}`} />
          </StatCard>
        </Cell>
        <Cell slug="participation">
          <StatCard title="Participation" definition="A player's share of all counted games." empty={empty}>
            <RankedTable rows={participation} format={formatPercent} names={names} showCount />
          </StatCard>
        </Cell>
      </Section>

      <Section title="When">
        <Cell slug="calendar" wide>
          <StatCard title="Calendar" definition="Counted games started each day, darker on busier days." empty={empty}>
            {view && (
              <>
                <Choices
                  label="Calendar view"
                  choices={activity.heatmaps.map((h) => ({ id: h.id, label: h.label.toUpperCase() }))}
                  chosen={view.id}
                  onChoose={setView}
                />
                <CalendarHeatmap heatmap={view} label="Games per day" />
              </>
            )}
          </StatCard>
        </Cell>
        <Cell slug="day-of-week">
          <StatCard title="Day of the week" definition="When counted games started, Monday first." empty={empty}>
            <BarChart
              bars={activity.byWeekday.map((value, day) => ({ ...weekdayLabel(day), value }))}
              label="Games by day of the week"
              unit={GAME_NOUNS}
            />
          </StatCard>
        </Cell>
        <Cell slug="hour-of-day" wide>
          <StatCard title="Hour of the day" definition="The hour each counted game started." empty={empty}>
            <BarChart
              bars={activity.byHour.map((value, hour) => ({ ...hourLabel(hour), value }))}
              label="Games by hour of the day"
              unit={GAME_NOUNS}
            />
          </StatCard>
        </Cell>
        <Cell slug="busiest-times">
          <StatCard title="Busiest times" definition="The day, week and month with the most counted games started." empty={empty}>
            {busiest.day && <p className="activity-line">Busiest day: {busiest.day.long} · {countLabel(busiest.day.games, GAME_NOUNS)}</p>}
            {busiest.week && <p className="activity-line">Busiest week: {busiest.week.long} · {countLabel(busiest.week.games, GAME_NOUNS)}</p>}
            {busiest.month && (
              <p className="activity-line">Busiest month: {busiest.month.long} · {countLabel(busiest.month.games, GAME_NOUNS)}</p>
            )}
          </StatCard>
        </Cell>
      </Section>

      <Section title="Sessions and gaps">
        <Cell slug="sessions">
          <StatCard title="Sessions" definition="A run of games, each starting less than 3 hours after the last ended." empty={empty}>
            <p className="activity-line">
              {countLabel(sessions.count, ["session", "sessions"])} · {(sessions.average ?? 0).toFixed(1)} games per session
            </p>
            {sessions.most && (
              <p className="activity-line">
                Most in one: {countLabel(sessions.most.games, GAME_NOUNS)}, {sessions.most.day}
              </p>
            )}
          </StatCard>
        </Cell>
        <Cell slug="gaps">
          <StatCard title="Gaps" definition="The longest time between two sessions, and since the last game ended." empty={empty}>
            {longestGap ? (
              <p className="activity-line">
                Longest gap between sessions: {countLabel(longestGap.days, ["day", "days"])}, {longestGap.from} to {longestGap.to}
              </p>
            ) : (
              <p className="activity-line">Only one session so far.</p>
            )}
            <p className="activity-line">Days since the last game: {activity.daysSinceLast ?? 0}</p>
          </StatCard>
        </Cell>
      </Section>

      <Section title="Timing">
        <Cell slug="decision-times" wide>
          <StatCard
            title="Decision times"
            definition="Each player's average time to decide, beside how many timed decisions it averages (5 or more to show)."
            empty={empty || (decisionRows.length === 0 && "No timed decisions in these games.")}
          >
            <SplitTable
              title="Decision times"
              columns={DECISIONS.map((kind) => ({ key: kind, label: DECISION_LABELS[kind] }))}
              rows={decisionRows}
              names={names}
            />
          </StatCard>
        </Cell>
        <Cell slug="fastest-voter">
          <StatCard
            title="Fastest voter"
            definition="The lowest average time to vote, of players with 30 or more timed votes and 8 or more counted games."
            empty={empty || (fastest === null && "No one has 30 timed votes over 8 games yet.")}
          >
            {fastest !== null && fastestVotes && fastestVotes.ms !== null && (
              <p className="activity-line">
                <PlayerName player={fastest} name={name(fastest)} link={false} /> · {formatAverageTime(fastestVotes.ms)} a vote, over{" "}
                {countLabel(fastestVotes.count, ["timed vote", "timed votes"])}
              </p>
            )}
          </StatCard>
        </Cell>
        <Cell slug="slowest-president">
          <StatCard
            title="Slowest president"
            definition="The highest average time over a president's choices: nominating, discarding, powers and ending the term, over at least 5."
            empty={empty || (slowest.length === 0 && "No president has 5 timed choices yet.")}
          >
            {slowestMs !== null && (
              <p className="activity-line">
                {listOf(slowest.map((player) => <PlayerName key={player} player={player} name={name(player)} link={false} />))} ·{" "}
                {formatAverageTime(slowestMs)} a choice
              </p>
            )}
          </StatCard>
        </Cell>
        <Cell slug="countdown">
          <StatCard
            title="The END TERM countdown"
            definition="How often the countdown, not the president, ended a term."
            empty={empty || (countdown.chances === 0 && "No terms ended in these games.")}
          >
            <p className="activity-line">
              Ended by the countdown: {countdown.value === null ? "—" : formatPercent(countdown.value)} ({countdown.hits} of{" "}
              {termCount(countdown.chances)})
            </p>
            <p className="activity-line">Pauses: {timing.pauses}</p>
            <RankedTable
              rows={presidents}
              format={(r: Rate) => formatPercent(r.value ?? 0)}
              names={names}
              countLabel={termCount}
              showCount
            />
          </StatCard>
        </Cell>
        <Cell slug="dropped-connections">
          <StatCard
            title="Dropped connections"
            definition="Times a player's connection dropped during counted games."
            empty={empty || (drops.length === 0 && "No dropped connections in these games.")}
          >
            <RankedTable rows={drops} format={(n: number) => countLabel(n, ["time", "times"])} names={names} showCount />
          </StatCard>
        </Cell>
      </Section>
    </div>
  );
}
