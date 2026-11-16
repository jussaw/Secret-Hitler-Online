import { Fragment, useMemo, type ReactNode } from "react";
import { StackedBarChart } from "../charts/StackedBarChart";
import {
  computeEndings,
  FINISHES_SHOWN,
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  outcomeBars,
  type GameCount,
  type LengthStats,
} from "../endings";
import { formatDuration, formatLocalDateTime, outcomeLabel, plural } from "../format";
import { formatPercent } from "../numbers";
import PlayerName from "../PlayerName";
import type { GameRecord } from "../record";
import { routePath } from "../routes";
import { ScrollRegion } from "../ScrollRegion";
import { StatCard } from "../StatCard";
import StatsLink from "../StatsLink";
import type { StatsContext } from "../useStats";
import "./EndingsTab.css";

const NOT_FROM_START = "No game recorded from its start yet.";

/** A link to a game's page, a 44px target at every size. */
function GameLink({ record, children }: { record: GameRecord; children: ReactNode }): JSX.Element {
  return (
    <StatsLink href={routePath({ page: "game", id: record.id })} className="endings-game-link">
      {children}
    </StatsLink>
  );
}

/** The fastest win or the longest game: its length and rounds, its result, its seats and its link. */
function OneGame({ record }: { record: GameRecord }): JSX.Element {
  return (
    <>
      <p className="endings-headline">{`${formatDuration(record.endedAt - record.startedAt)} · ${plural(record.rounds, "round")}`}</p>
      <p className="endings-result">{outcomeLabel(record)}</p>
      <p className="endings-seats">
        {record.seats.map((seat, i) => (
          <Fragment key={i}>
            {i > 0 && ", "}
            <PlayerName player={seat.player} name={seat.name} role={seat.role} />
          </Fragment>
        ))}
      </p>
      <div className="endings-see">
        <GameLink record={record}>See this game</GameLink>
      </div>
    </>
  );
}

/** A finish list: how many in all, then the latest `FINISHES_SHOWN`, each linked. */
function Finishes({ games }: { games: GameRecord[] }): JSX.Element {
  return (
    <>
      <p className="endings-count">{plural(games.length, "game")}</p>
      <ul className="endings-list">
        {games.slice(0, FINISHES_SHOWN).map((record) => (
          <li key={record.id}>
            <GameLink record={record}>
              {`${formatLocalDateTime(record.endedAt)} · ${outcomeLabel(record)} · ${record.liberalPolicies} L, ${record.fascistPolicies} F`}
            </GameLink>
          </li>
        ))}
      </ul>
    </>
  );
}

/** One line of Most in one game: the count and a link to its game, or none yet. */
function MostLine({ label, most }: { label: string; most: GameCount | null }): JSX.Element {
  if (!most) return <li>{`${label}: none yet`}</li>;
  return (
    <li>
      {`${label}: ${most.count} · `}
      <GameLink record={most.game}>{formatLocalDateTime(most.game.endedAt)}</GameLink>
    </li>
  );
}

/** A length row's cells: the games it is over, the average length and the average rounds. */
function LengthCells({ length }: { length: LengthStats }): JSX.Element {
  return (
    <>
      <td>{length.games}</td>
      <td>{length.averageMs === null ? "—" : formatDuration(length.averageMs)}</td>
      <td>{length.averageRounds === null ? "—" : length.averageRounds.toFixed(1)}</td>
    </>
  );
}

/**
 * ENDINGS: how counted games end (`endings.ts`): the outcomes by player count, the Liberal win
 * rate beside the smoothed rate the Elo handicap uses, game length, the fastest win and the
 * longest game, the most in one game, and the closest and most lopsided final boards.
 */
export function EndingsTab({ stats }: { stats: StatsContext }): JSX.Element {
  const { counted } = stats;
  const endings = useMemo(() => computeEndings(counted), [counted]);
  const none = counted.length === 0;
  const noLength = none || (endings.length.games === 0 && NOT_FROM_START);

  return (
    <div className="endings-tab">
      <StatCard
        title="How games are won"
        definition="Counted games by the number of players and how they ended."
        className="endings-wide"
        empty={none}
      >
        <StackedBarChart bars={outcomeBars(endings)} colors={OUTCOME_COLORS} legend={OUTCOME_LABELS} label="How games are won" />
      </StatCard>
      <StatCard
        title="Liberal win rate by player count"
        definition="Smoothed: pulled toward a half by five imaginary games each way, the rate the Elo handicap uses."
        empty={none}
      >
        <ScrollRegion label="Liberal win rate by player count table">
          <table className="player-matrix endings-table">
            <thead>
              <tr>
                <th scope="col">Players</th>
                <th scope="col">Games</th>
                <th scope="col">Liberal wins</th>
                <th scope="col">Win rate</th>
                <th scope="col">Smoothed</th>
              </tr>
            </thead>
            <tbody>
              {endings.bySize.map((size) => (
                <tr key={size.seats}>
                  <th scope="row">{size.seats}</th>
                  <td>{size.games}</td>
                  <td>{size.liberalWins}</td>
                  <td>{size.liberalRate.value === null ? "—" : formatPercent(size.liberalRate.value)}</td>
                  <td>{formatPercent(size.smoothedLiberalRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </StatCard>
      <StatCard title="Game length" definition="From start to end, over games recorded from their start." empty={noLength}>
        <ScrollRegion label="Game length table">
          <table className="player-matrix endings-table">
            <thead>
              <tr>
                <th scope="col">Players</th>
                <th scope="col">Games</th>
                <th scope="col">Average length</th>
                <th scope="col">Average rounds</th>
              </tr>
            </thead>
            <tbody>
              {endings.bySize.map((size) => (
                <tr key={size.seats}>
                  <th scope="row">{size.seats}</th>
                  <LengthCells length={size.length} />
                </tr>
              ))}
              <tr className="endings-all">
                <th scope="row">All</th>
                <LengthCells length={endings.length} />
              </tr>
            </tbody>
          </table>
        </ScrollRegion>
      </StatCard>
      <StatCard title="Fastest win" definition="The shortest game recorded from its start." empty={noLength}>
        {endings.fastestWin && <OneGame record={endings.fastestWin} />}
      </StatCard>
      <StatCard title="Longest game" definition="The longest game recorded from its start." empty={noLength}>
        {endings.longestGame && <OneGame record={endings.longestGame} />}
      </StatCard>
      <StatCard
        title="Most in one game"
        definition="Chaos policies, failed elections and vetoed agendas. Ties go to the earlier game."
        empty={none}
      >
        <ul className="endings-list endings-most">
          <MostLine label="Chaos policies" most={endings.mostChaos} />
          <MostLine label="Failed elections" most={endings.mostFailedElections} />
          <MostLine label="Vetoes" most={endings.mostVetoes} />
        </ul>
      </StatCard>
      <StatCard
        title="Closest finishes"
        definition="The losing side one policy from winning: 4 Liberal or 5 Fascist policies."
        className="endings-wide"
        empty={none || (endings.closestFinishes.length === 0 && "No close finishes yet.")}
      >
        <Finishes games={endings.closestFinishes} />
      </StatCard>
      <StatCard
        title="Most lopsided finishes"
        definition="The losing side's track still at 0."
        className="endings-wide"
        empty={none || (endings.lopsidedFinishes.length === 0 && "No lopsided finishes yet.")}
      >
        <Finishes games={endings.lopsidedFinishes} />
      </StatCard>
    </div>
  );
}
