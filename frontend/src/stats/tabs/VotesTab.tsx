import { useId, useMemo } from "react";
import { compareNames, MIN_CHANCES, nameOf, rankRows, type Rate } from "../counting";
import { countFigure, formatPercent, rateFigure } from "../numbers";
import { computePowers, type PlayerPowers, type VetoAnswers } from "../powers";
import { RankedTable, type RankedHeads } from "../RankedTable";
import type { Role, Side } from "../record";
import { SplitTable, type SplitCell, type SplitColumn } from "../SplitTable";
import { StatCard } from "../StatCard";
import type { StatsContext } from "../useStats";
import { computeVotes, type PlayerVotes } from "../votes";
import "./VotesTab.css";

/**
 * VOTES & POWERS (`/stats/votes`): each player's elections and votes, then their presidential
 * powers and survival, over the counted games, in 26 cards under two headings. A count card ranks
 * the players above zero, a rate card the players with a chance (unranked below the minimum), and
 * a split card shows a table by role or side with every player who had a chance in any column. A
 * card with no row says why in its own line, and every card says `NO_GAMES` when no game counts.
 */

/** A split table's column: a role or a side, with its head's label. */
interface Column<K extends string> extends SplitColumn {
  key: K;
}

const BY_ROLE: Column<Role>[] = [
  { key: "LIBERAL", label: "Liberal" },
  { key: "FASCIST", label: "Fascist" },
  { key: "HITLER", label: "Hitler" },
];
const BY_SIDE: Column<Side>[] = [
  { key: "LIBERAL", label: "Liberal" },
  { key: "FASCIST", label: "Fascist side" },
];

/** A stat card: its title, its definition, its line when it has no row, and its table (null: no row). */
interface CardSpec {
  title: string;
  definition: string;
  line: string;
  table: JSX.Element | null;
  className?: string;
}

/** The tab's two sections of cards. */
interface Sections {
  elections: CardSpec[];
  powers: CardSpec[];
}

/** A rate as shown: "—" below its minimum, else a whole percent. */
function percent(r: Rate): string {
  return r.value === null ? "—" : formatPercent(r.value);
}

/** Larger values first, a missing one (below the minimum) last. */
function byRate(a: Rate, b: Rate): number {
  return (b.value ?? -1) - (a.value ?? -1);
}

/** A rate card's heads: every rate sorts by its whole percent (`rateFigure`). */
type RateHeads = Omit<RankedHeads<Rate>, "sortValue">;

/** The line under the name of the cards whose count head is not their count's noun: "Checks"
 *  count investigations, and SPECIAL ELECTION PICKS' "Elections" special elections. */
const INVESTIGATION_WORDS: [string, string] = ["investigation", "investigations"];
const SPECIAL_ELECTION_WORDS: [string, string] = ["special election", "special elections"];

/** INVESTIGATIONS' sort figure: the number its line starts with. */
const investigationsFigure = (p: PlayerPowers) => p.investigations;

/** Every player's entry, by number. */
type Entries<T> = [number, T][];

/** The tab's cards, in order in their sections, from the two modules' entries. */
function sections(votes: Entries<PlayerVotes>, powers: Entries<PlayerPowers>, names: Map<number, string>): Sections {
  /** Players ranked by a count, higher first, ties by name; only counts above zero. The count is
   *  the value, under `valueHead`, with no count column, as every row is ranked. */
  const countTable = <T extends { games: number }>(entries: Entries<T>, value: (entry: T) => number, valueHead: string) => {
    const rows = entries
      .map(([player, entry]) => ({ player, value: value(entry), count: entry.games }))
      .filter((row) => row.value > 0);
    if (rows.length === 0) return null;
    return (
      <RankedTable
        rows={rankRows(rows, (a, b) => b - a, names, 0)}
        format={String}
        names={names}
        valueHead={valueHead}
        sortValue={countFigure}
      />
    );
  };

  /** Players ranked by a rate, from `MIN_CHANCES` chances; only players with a chance. The rate is
   *  under `heads.valueHead`, sorted by its whole percent, and its chances under `heads.countHead`. */
  const rateTable = <T,>(entries: Entries<T>, value: (entry: T) => Rate, heads: RateHeads) => {
    const rows = entries
      .map(([player, entry]) => ({ player, value: value(entry), count: value(entry).chances }))
      .filter((row) => row.count > 0);
    if (rows.length === 0) return null;
    return (
      <RankedTable
        rows={rankRows(rows, byRate, names, MIN_CHANCES)}
        format={(r) => formatPercent(r.value!)}
        names={names}
        sortValue={rateFigure}
        {...heads}
      />
    );
  };

  /** A table by role or side: a row per player with a chance in any column, every cell given. */
  const splitTable = <T, K extends string>(
    title: string,
    columns: Column<K>[],
    entries: Entries<T>,
    cellOf: (entry: T, key: K) => { cell: SplitCell; chance: boolean }
  ) => {
    const rows = entries
      .map(([player, entry]) => {
        const cells: Record<string, SplitCell> = {};
        let chance = false;
        for (const column of columns) {
          const found = cellOf(entry, column.key);
          cells[column.key] = found.cell;
          chance = chance || found.chance;
        }
        return { player, cells, chance };
      })
      .filter((row) => row.chance)
      .map(({ player, cells }) => ({ player, cells }));
    return rows.length === 0 ? null : <SplitTable title={title} columns={columns} rows={rows} names={names} />;
  };
  const rateCell = (r: Rate) => ({ cell: { text: percent(r), count: r.chances }, chance: r.chances > 0 });
  const countCell = (n: number) => ({ cell: { text: String(n) }, chance: n > 0 });
  const vetoCell = ({ accepted, refused }: VetoAnswers) => ({
    cell: { text: `${accepted} of ${accepted + refused}` },
    chance: accepted + refused > 0,
  });

  /**
   * "4 (3 F, 1 L) · Bo 2, Cy 1, Bots ×1": whom by most times, then name, and the Bots last. The
   * "×" keeps the Bots' count from reading as a seat's name ("Bot 1") or a player called "Bots".
   */
  const investigations = (p: PlayerPowers): string => {
    const whom = Array.from(p.investigatedPlayers)
      .map(([player, times]) => ({ name: nameOf(names, player), times }))
      .sort((a, b) => b.times - a.times || compareNames(a.name, b.name))
      .map((target) => `${target.name} ${target.times}`);
    if (p.investigatedCpu > 0) whom.push(`Bots ×${p.investigatedCpu}`);
    return `${p.investigations} (${p.saw.FASCIST} F, ${p.saw.LIBERAL} L) · ${whom.join(", ")}`;
  };
  const investigationRows = powers
    .filter(([, p]) => p.investigations > 0)
    .map(([player, p]) => ({ player, value: p, count: p.games }));
  const investigationTable =
    investigationRows.length === 0 ? null : (
      <RankedTable
        rows={rankRows(investigationRows, (a, b) => b.investigations - a.investigations, names, 0)}
        format={investigations}
        names={names}
        valueHead="Investigations"
        sortValue={investigationsFigure}
        valueEnd={false}
      />
    );

  const noNominations = "No nominations yet with these players.";
  const noVotes = "No votes yet with these players.";
  // A power's two sides can differ when CPU seats sat in: say whom no one used it on, or who used it on no one.
  const noneInvestigated = "None of these players has been investigated yet.";
  const noneExecuted = "None of these players has been executed yet.";
  const noneExecuting = "None of these players has executed anyone yet.";
  const noSpecial = "No special elections yet with these players.";
  const elections: CardSpec[] = [
    {
      title: "NOMINATED AS CHANCELLOR",
      definition: "Times a president named them chancellor.",
      line: noNominations,
      table: countTable(votes, (v) => v.nominatedChancellor, "Times"),
    },
    {
      title: "NOMINATIONS PASSED",
      definition: "As president, the share of their nominations the vote passed.",
      line: noNominations,
      table: rateTable(votes, (v) => v.presidentPassed, { valueHead: "Passed", countHead: "Nominations" }),
    },
    {
      title: "ELECTED AS CHANCELLOR",
      definition: "As a nominated chancellor, the share of their elections that passed.",
      line: noNominations,
      table: rateTable(votes, (v) => v.chancellorPassed, { valueHead: "Elected", countHead: "Elections" }),
    },
    {
      title: "PICKING A TEAMMATE",
      definition: "As president, the share of their nominations that named someone on their own side.",
      line: noNominations,
      table: splitTable("PICKING A TEAMMATE", BY_SIDE, votes, (v, key) => rateCell(v.teammatePick[key])),
    },
    {
      title: "JA RATE",
      definition: "The share of their votes that were Ja, by their role.",
      line: noVotes,
      table: splitTable("JA RATE", BY_ROLE, votes, (v, key) => rateCell(v.jaByRole[key])),
    },
    {
      title: "LIBERAL VOTE ACCURACY",
      definition:
        "As a Liberal, the share of votes that were right: Ja on a government with no one from the Fascist side, Nein on one with someone from it.",
      line: noVotes,
      table: rateTable(votes, (v) => v.liberalAccuracy, { valueHead: "Accuracy", countHead: "Votes" }),
    },
    {
      title: "FASCIST LOYALTY",
      definition: "On the Fascist side, the share of Ja votes on governments with a teammate in them, not counting themselves.",
      line: "No votes on a teammate's government yet with these players.",
      table: rateTable(votes, (v) => v.fascistLoyalty, { valueHead: "Loyalty", countHead: "Votes" }),
    },
    {
      title: "VOTED HITLER IN",
      definition: "As a Liberal, Ja votes on the election that made Hitler chancellor and ended the game.",
      line: "No Liberal has voted Hitler in yet with these players.",
      table: countTable(votes, (v) => v.votedHitlerIn, "Votes"),
    },
    {
      title: "SWING VOTES",
      definition: "Votes that alone would have flipped the result, had they gone the other way.",
      line: "No swing votes yet with these players.",
      table: countTable(votes, (v) => v.swing, "Votes"),
    },
    {
      title: "LONE DISSENT",
      definition: "The only vote against all the others in an election.",
      line: "No lone dissent yet with these players.",
      table: countTable(votes, (v) => v.loneDissent, "Votes"),
    },
    {
      title: "FAILED ELECTIONS",
      definition: "As president, nominations the vote turned down.",
      line: "No failed elections yet with these players.",
      table: countTable(votes, (v) => v.failedAsPresident, "Failed"),
    },
    {
      title: "CHAOS",
      definition: "As president, terms whose failed election or accepted veto put the top policy on the board.",
      line: "No chaos policies yet with these players.",
      table: countTable(votes, (v) => v.chaos, "Chaos"),
    },
  ];
  const powerCards: CardSpec[] = [
    {
      title: "INVESTIGATIONS",
      definition:
        "Party memberships they looked at as president, what they saw (F for the Fascist side, L for Liberal) and whom.",
      line: "None of these players has investigated anyone yet.",
      table: investigationTable,
      className: "votes-investigations",
    },
    {
      title: "LIBERAL FINDS",
      definition: "As a Liberal, the share of their investigations that found someone from the Fascist side.",
      line: "No investigations by a Liberal yet with these players.",
      table: rateTable(powers, (p) => p.liberalFinds, { valueHead: "Finds", countHead: "Checks", countWords: INVESTIGATION_WORDS }),
    },
    {
      title: "CHECKING A TEAMMATE",
      definition: "On the Fascist side, the share of their investigations that looked at a teammate.",
      line: "No investigations by the Fascist side yet with these players.",
      table: rateTable(powers, (p) => p.teammateChecks, { valueHead: "Teammate", countHead: "Checks", countWords: INVESTIGATION_WORDS }),
    },
    {
      title: "TIMES INVESTIGATED",
      definition: "Times others investigated them, by their role.",
      line: noneInvestigated,
      table: splitTable("TIMES INVESTIGATED", BY_ROLE, powers, (p, key) => countCell(p.timesInvestigated[key])),
    },
    {
      title: "PEEKS",
      definition: "Times they looked at the top three policies as president.",
      line: "No peeks yet with these players.",
      table: countTable(powers, (p) => p.peeks, "Peeks"),
    },
    {
      title: "EXECUTIONS",
      definition: "Players they executed as president.",
      line: noneExecuting,
      table: countTable(powers, (p) => p.executions, "Executions"),
    },
    {
      title: "EXECUTION TARGETS",
      definition: "The share of their executions that hit someone from the Fascist side, by their own side.",
      line: noneExecuting,
      table: splitTable("EXECUTION TARGETS", BY_SIDE, powers, (p, key) => rateCell(p.fascistTargets[key])),
    },
    {
      title: "HITLER EXECUTED",
      definition: "Times they executed Hitler.",
      line: "No one has executed Hitler yet with these players.",
      table: countTable(powers, (p) => p.hitlerExecuted, "Times"),
    },
    {
      title: "TIMES EXECUTED",
      definition: "Times they were executed.",
      line: noneExecuted,
      table: countTable(powers, (p) => p.timesExecuted, "Times"),
    },
    {
      title: "FIRST TO GO",
      definition: "Games where they were the first player executed.",
      line: noneExecuted,
      table: countTable(powers, (p) => p.executedFirst, "Games"),
    },
    {
      title: "SPECIAL ELECTIONS",
      definition: "Times they chose the next president.",
      line: noSpecial,
      table: countTable(powers, (p) => p.specialElections, "Times"),
    },
    {
      title: "SPECIAL ELECTION PICKS",
      definition: "The share of their special elections that made a teammate president.",
      line: noSpecial,
      table: rateTable(powers, (p) => p.specialTeammate, {
        valueHead: "Teammate",
        countHead: "Elections",
        countWords: SPECIAL_ELECTION_WORDS,
      }),
    },
    {
      title: "VETOES AS PRESIDENT",
      definition: "Vetoes they accepted, of those their chancellor asked for, by their role.",
      line: "No vetoes yet with these players.",
      table: splitTable("VETOES AS PRESIDENT", BY_ROLE, powers, (p, key) => vetoCell(p.vetoes[key])),
    },
    {
      title: "SURVIVAL",
      definition: "The share of their games they were alive at the end, by their role.",
      line: "No games yet with these players.",
      table: splitTable("SURVIVAL", BY_ROLE, powers, (p, key) => rateCell(p.survivalByRole[key])),
    },
  ];
  return { elections, powers: powerCards };
}

/** A heading and its cards. */
function Section({ heading, cards, noGames }: { heading: string; cards: CardSpec[]; noGames: boolean }): JSX.Element {
  const headingId = useId();
  return (
    <section className="votes-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{heading}</h2>
      <div className="votes-grid">
        {cards.map((c) => (
          <StatCard
            key={c.title}
            title={c.title}
            definition={c.definition}
            empty={noGames ? true : c.table === null ? c.line : undefined}
            className={c.className ? `votes-card ${c.className}` : "votes-card"}
          >
            {c.table}
          </StatCard>
        ))}
      </div>
    </section>
  );
}

/** VOTES & POWERS: two sections of cards over the counted games. */
export function VotesTab({ stats }: { stats: StatsContext }): JSX.Element {
  const votes = useMemo(() => Array.from(computeVotes(stats.counted).byPlayer), [stats.counted]);
  const powers = useMemo(() => Array.from(computePowers(stats.counted).byPlayer), [stats.counted]);
  const cards = useMemo(() => sections(votes, powers, stats.names), [votes, powers, stats.names]);
  const noGames = stats.counted.length === 0;
  return (
    <div className="votes-tab">
      <Section heading="ELECTIONS AND VOTES" cards={cards.elections} noGames={noGames} />
      <Section heading="POWERS AND SURVIVAL" cards={cards.powers} noGames={noGames} />
    </div>
  );
}
