import { Fragment, useMemo, type ReactNode } from "react";
import { StackedBarChart } from "../charts/StackedBarChart";
import {
  computeEndings,
  FINISHES_SHOWN,
  gameLength,
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  outcomeBars,
  type GameCount,
  type LengthStats,
  type SizeEndings,
} from "../endings";
import { formatDuration, formatLocalDateTime, outcomeLabel, plural, wholeMinutes } from "../format";
import { formatPercent, rateFigure, wholePercent } from "../numbers";
import PlayerName from "../PlayerName";
import type { GameRecord } from "../record";
import { routePath } from "../routes";
import { ScrollRegion } from "../ScrollRegion";
import { SortHeadRow, useTableSort, type HeadColumn } from "../SortHead";
import type { TableSort } from "../sorting";
import { StatCard } from "../StatCard";
import StatsLink from "../StatsLink";
import type { StatsContext } from "../useStats";
import { NO_VALUE, rateCellText } from "./cellText";
import "./cardGrid.css";
import "./EndingsTab.css";
import "./PlayerMatrix.css";

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
      <p className="endings-headline">{`${formatDuration(gameLength(record))} · ${plural(record.rounds, "round")}`}</p>
      <p className="endings-result">{outcomeLabel(record)}</p>
      <p className="endings-seats">
        {record.seats.map((seat, i) => (
          <Fragment key={i}>
            {i > 0 && ", "}
            <PlayerName player={seat.player} name={seat.name} role={seat.role} />
          </Fragment>
        ))}
      </p>
      <div>
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

/** An average's cell: the text a Game length cell shows and the figure that text shows, which its
 *  column sorts by. */
interface AverageCell {
  text: string;
  /** Null exactly when the text is `NO_VALUE`. */
  value: number | null;
}

/** The cell of `average`, its text by `text` and its figure by `figure`, or `NO_VALUE` and null
 *  with no game to average (null). */
function averageCell(
  average: number | null,
  text: (average: number) => string,
  figure: (average: number) => number
): AverageCell {
  return average === null ? { text: NO_VALUE, value: null } : { text: text(average), value: figure(average) };
}

/** Average rounds to one decimal, as a number: what the Average rounds column sorts by and
 *  `roundsText` shows, so 7.25 and 7.33, both "7.3", are a tie. */
function roundsFigure(rounds: number): number {
  return Number(rounds.toFixed(1));
}

/** Average rounds as a cell shows them, to one decimal (`roundsFigure`): "7.5", "10.0". */
function roundsText(rounds: number): string {
  return roundsFigure(rounds).toFixed(1);
}

/** A length row's average length: "38 min" (`formatDuration`), its figure the whole minutes it
 *  shows (`wholeMinutes`). */
function lengthCell(length: LengthStats): AverageCell {
  return averageCell(length.averageMs, formatDuration, wholeMinutes);
}

/** A length row's average rounds: "7.5" (`roundsText`), its figure `roundsFigure`. */
function roundsCell(length: LengthStats): AverageCell {
  return averageCell(length.averageRounds, roundsText, roundsFigure);
}

/** A length row's cells: the games it is over, the average length and the average rounds. */
function LengthCells({ length }: { length: LengthStats }): JSX.Element {
  return (
    <>
      <td>{length.games}</td>
      <td>{lengthCell(length).text}</td>
      <td>{roundsCell(length).text}</td>
    </>
  );
}

/** The Liberal win rate table's columns. */
type WinRateColumn = "seats" | "games" | "liberalWins" | "rate" | "smoothed";

/** The Game length table's columns. */
type LengthColumn = "seats" | "games" | "length" | "rounds";

/** The order both tables open in: by Players, 5 first. */
const SEATS_ORDER: TableSort<"seats"> = Object.freeze({ column: "seats", direction: "ascending" });

/** Both tables' Players column: a table size, 5 first on its first press too, since it is the
 *  column the tables' own order follows, so a press on it from another column gives that back. */
const SEATS_COLUMN: HeadColumn<SizeEndings, "seats"> = {
  key: "seats",
  label: "Players",
  first: "ascending",
  value: (size) => size.seats,
};

/** A column of either table under `label`, most first by `value`, the figure its cell shows (null
 *  for a "—", below every figure either way). Its values stand at the left, so it is not `end`. */
function figureColumn<K extends string>(
  key: K,
  label: string,
  value: (size: SizeEndings) => number | null
): HeadColumn<SizeEndings, K> {
  return { key, label, first: "descending", value };
}

/** The Liberal win rate table's columns, in order: Players, then each by the figure its cell
 *  shows, the "—" of a rate below its minimum below every rate either way. */
const WIN_RATE_COLUMNS: readonly HeadColumn<SizeEndings, WinRateColumn>[] = [
  SEATS_COLUMN,
  figureColumn("games", "Games", (size) => size.games),
  figureColumn("liberalWins", "Liberal wins", (size) => size.liberalWins),
  figureColumn("rate", "Win rate", (size) => rateFigure(size.liberalRate)),
  figureColumn("smoothed", "Smoothed", (size) => wholePercent(size.smoothedLiberalRate)),
];

/** The Game length table's columns, in order: Players, then each by the figure its cell shows
 *  (`LengthCells`' `lengthCell` and `roundsCell`), a "—" below every figure either way. */
const LENGTH_COLUMNS: readonly HeadColumn<SizeEndings, LengthColumn>[] = [
  SEATS_COLUMN,
  figureColumn("games", "Games", (size) => size.length.games),
  figureColumn("length", "Average length", (size) => lengthCell(size.length).value),
  figureColumn("rounds", "Average rounds", (size) => roundsCell(size.length).value),
];

/**
 * The Liberal win rate by player count: a row per size. Each head sorts by its column
 * (`SortHeadRow`, #109): it opens by Players, 5 first, Players marked. A component of its own, so
 * its sort goes when its card empties.
 */
function WinRateTable({ sizes }: { sizes: SizeEndings[] }): JSX.Element {
  const { rows, sort, press } = useTableSort(sizes, WIN_RATE_COLUMNS, SEATS_ORDER);
  return (
    <table className="player-matrix">
      <SortHeadRow columns={WIN_RATE_COLUMNS} sort={sort} onSort={press} />
      <tbody>
        {rows.map((size) => (
          <tr key={size.seats}>
            <th scope="row">{size.seats}</th>
            <td>{size.games}</td>
            <td>{size.liberalWins}</td>
            <td>{rateCellText(size.liberalRate)}</td>
            <td>{formatPercent(size.smoothedLiberalRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Game length: a row per size, then All, every size's games together. Each head sorts the sizes
 * by its column (`SortHeadRow`, #109), opening by Players, 5 first, Players marked; the All row is
 * outside the sort, always the last row. A component of its own, so its sort goes when its card
 * empties.
 */
function LengthTable({ sizes, all }: { sizes: SizeEndings[]; all: LengthStats }): JSX.Element {
  const { rows, sort, press } = useTableSort(sizes, LENGTH_COLUMNS, SEATS_ORDER);
  return (
    <table className="player-matrix">
      <SortHeadRow columns={LENGTH_COLUMNS} sort={sort} onSort={press} />
      <tbody>
        {rows.map((size) => (
          <tr key={size.seats}>
            <th scope="row">{size.seats}</th>
            <LengthCells length={size.length} />
          </tr>
        ))}
        <tr className="endings-all">
          <th scope="row">All</th>
          <LengthCells length={all} />
        </tr>
      </tbody>
    </table>
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
        definition="Counted games by the number of players, along the bottom, and how they ended."
        className="endings-wide"
        empty={none}
      >
        <StackedBarChart
          bars={outcomeBars(endings)}
          colors={OUTCOME_COLORS}
          legend={OUTCOME_LABELS}
          label="How games are won by the number of players"
        />
      </StatCard>
      <StatCard
        title="Liberal win rate by player count"
        definition="Smoothed: pulled toward a half by five imaginary games each way, the rate the Elo handicap uses."
        empty={none}
      >
        <ScrollRegion label="Liberal win rate by player count table">
          <WinRateTable sizes={endings.bySize} />
        </ScrollRegion>
      </StatCard>
      <StatCard title="Game length" definition="From start to end, over games recorded from their start." empty={noLength}>
        <ScrollRegion label="Game length table">
          <LengthTable sizes={endings.bySize} all={endings.length} />
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
        className="endings-wide"
        empty={none}
      >
        <ul className="endings-list">
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
