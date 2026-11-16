import { useId, useMemo } from "react";
import { compareNames, MIN_CHANCES, nameOf, rankRows, type Rate } from "../counting";
import { plural } from "../format";
import { formatPercent } from "../numbers";
import { computePowers, type PlayerPowers, type VetoAnswers } from "../powers";
import { RankedTable } from "../RankedTable";
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

const BY_ROLE: SplitColumn[] = [
  { key: "LIBERAL", label: "Liberal" },
  { key: "FASCIST", label: "Fascist" },
  { key: "HITLER", label: "Hitler" },
];
const BY_SIDE: SplitColumn[] = [
  { key: "LIBERAL", label: "Liberal" },
  { key: "FASCIST", label: "Fascist side" },
];

/** A card: its title, its definition, its line when it has no row, and its table (null: no row). */
interface Card {
  title: string;
  definition: string;
  line: string;
  table: JSX.Element | null;
  className?: string;
}

/** A rate as shown: "—" below its minimum, else a whole percent. */
function percent(r: Rate): string {
  return r.value === null ? "—" : formatPercent(r.value);
}

/** Larger values first, a missing one (below the minimum) last. */
function byRate(a: Rate, b: Rate): number {
  return (b.value ?? -1) - (a.value ?? -1);
}

/** Every player's entry, by number. */
type Entries<T> = [number, T][];

/** INVESTIGATIONS' value: how many, what they saw, and whom (people only). */
interface Investigations {
  count: number;
  saw: Record<Side, number>;
  targets: Map<number, number>;
}

/** The tab's cards, in order, from the two modules' entries. */
function cards(votes: Entries<PlayerVotes>, powers: Entries<PlayerPowers>, names: Map<number, string>): Card[] {
  /** Players ranked by a count, higher first, ties by name; only counts above zero. */
  const counted = <T,>(entries: Entries<T>, value: (entry: T) => number, games: (entry: T) => number) => {
    const rows = entries
      .map(([player, entry]) => ({ player, value: value(entry), count: games(entry) }))
      .filter((row) => row.value > 0);
    return rows.length === 0 ? null : <RankedTable rows={rankRows(rows, (a, b) => b - a, names, 0)} format={String} names={names} />;
  };
  const voteCount = (value: (v: PlayerVotes) => number) => counted(votes, value, (v) => v.games);
  const powerCount = (value: (p: PlayerPowers) => number) => counted(powers, value, (p) => p.games);

  /** Players ranked by a rate, from `MIN_CHANCES` chances; only players with a chance. */
  const rated = <T,>(entries: Entries<T>, value: (entry: T) => Rate, noun: string) => {
    const rows = entries
      .map(([player, entry]) => ({ player, value: value(entry), count: value(entry).chances }))
      .filter((row) => row.count > 0);
    if (rows.length === 0) return null;
    return (
      <RankedTable
        rows={rankRows(rows, byRate, names, MIN_CHANCES)}
        format={(r) => formatPercent(r.value!)}
        names={names}
        showCount
        countLabel={(n) => plural(n, noun)}
      />
    );
  };

  /** A table by role or side: a row per player with a chance in any column, every cell given. */
  const split = <T,>(
    title: string,
    columns: SplitColumn[],
    entries: Entries<T>,
    cellOf: (entry: T, key: string) => { cell: SplitCell; chance: boolean }
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

  /** "4 (3 F, 1 L) · Bo 2, Cy 1, CPU 1": whom by most times, then name, and CPU seats last. */
  const investigations = (v: Investigations): string => {
    const targets = Array.from(v.targets)
      .map(([player, times]) => ({ name: nameOf(names, player), times }))
      .sort((a, b) => b.times - a.times || compareNames(a.name, b.name));
    const whom = targets.map((t) => `${t.name} ${t.times}`);
    const cpu = v.count - targets.reduce((total, t) => total + t.times, 0);
    if (cpu > 0) whom.push(`CPU ${cpu}`);
    return `${v.count} (${v.saw.FASCIST} F, ${v.saw.LIBERAL} L) · ${whom.join(", ")}`;
  };
  const investigationRows = powers
    .filter(([, p]) => p.investigations > 0)
    .map(([player, p]) => ({
      player,
      value: { count: p.investigations, saw: p.saw, targets: p.investigatedPlayers },
      count: p.games,
    }));
  const investigationTable =
    investigationRows.length === 0 ? null : (
      <RankedTable rows={rankRows(investigationRows, (a, b) => b.count - a.count, names, 0)} format={investigations} names={names} />
    );

  const noNominations = "No nominations yet with these players.";
  const noVotes = "No votes yet with these players.";
  const noInvestigations = "No investigations yet with these players.";
  const noExecutions = "No executions yet with these players.";
  const noSpecial = "No special elections yet with these players.";
  return [
    {
      title: "NOMINATED AS CHANCELLOR",
      definition: "Times a president named them chancellor.",
      line: noNominations,
      table: voteCount((v) => v.nominatedChancellor),
    },
    {
      title: "NOMINATIONS PASSED",
      definition: "As president, the share of their nominations the vote passed.",
      line: noNominations,
      table: rated(votes, (v) => v.presidentPassed, "nomination"),
    },
    {
      title: "ELECTED AS CHANCELLOR",
      definition: "As a nominated chancellor, the share of their elections that passed.",
      line: noNominations,
      table: rated(votes, (v) => v.chancellorPassed, "election"),
    },
    {
      title: "PICKING A TEAMMATE",
      definition: "As president, the share of their nominations that named someone on their own side.",
      line: noNominations,
      table: split("PICKING A TEAMMATE", BY_SIDE, votes, (v, key) => rateCell(v.teammatePick[key as Side])),
    },
    {
      title: "JA RATE",
      definition: "The share of their votes that were Ja, by their role.",
      line: noVotes,
      table: split("JA RATE", BY_ROLE, votes, (v, key) => rateCell(v.jaByRole[key as Role])),
    },
    {
      title: "LIBERAL VOTE ACCURACY",
      definition:
        "As a Liberal, the share of votes that were right: Ja on a government with no one from the Fascist side, Nein on one with someone from it.",
      line: noVotes,
      table: rated(votes, (v) => v.liberalAccuracy, "vote"),
    },
    {
      title: "FASCIST LOYALTY",
      definition: "On the Fascist side, the share of Ja votes on governments with a teammate in them, not counting themselves.",
      line: "No votes on a teammate's government yet with these players.",
      table: rated(votes, (v) => v.fascistLoyalty, "vote"),
    },
    {
      title: "VOTED HITLER IN",
      definition: "As a Liberal, Ja votes on the election that made Hitler chancellor and ended the game.",
      line: "No Liberal has voted Hitler in yet with these players.",
      table: voteCount((v) => v.votedHitlerIn),
    },
    {
      title: "SWING VOTES",
      definition: "Votes that alone would have flipped the result, had they gone the other way.",
      line: "No swing votes yet with these players.",
      table: voteCount((v) => v.swing),
    },
    {
      title: "LONE DISSENT",
      definition: "The only vote against all the others in an election.",
      line: "No lone dissent yet with these players.",
      table: voteCount((v) => v.loneDissent),
    },
    {
      title: "FAILED ELECTIONS",
      definition: "As president, nominations the vote turned down.",
      line: "No failed elections yet with these players.",
      table: voteCount((v) => v.failedAsPresident),
    },
    {
      title: "CHAOS",
      definition: "As president, terms whose failed election or accepted veto put the top policy on the board.",
      line: "No chaos policies yet with these players.",
      table: voteCount((v) => v.chaos),
    },
    {
      title: "INVESTIGATIONS",
      definition:
        "Party memberships they looked at as president, what they saw (F for the Fascist side, L for Liberal) and whom.",
      line: noInvestigations,
      table: investigationTable,
      className: "votes-investigations",
    },
    {
      title: "LIBERAL FINDS",
      definition: "As a Liberal, the share of their investigations that found someone from the Fascist side.",
      line: "No investigations by a Liberal yet with these players.",
      table: rated(powers, (p) => p.liberalFinds, "investigation"),
    },
    {
      title: "CHECKING A TEAMMATE",
      definition: "On the Fascist side, the share of their investigations that looked at a teammate.",
      line: "No investigations by the Fascist side yet with these players.",
      table: rated(powers, (p) => p.teammateChecks, "investigation"),
    },
    {
      title: "TIMES INVESTIGATED",
      definition: "Times others investigated them, by their role.",
      line: noInvestigations,
      table: split("TIMES INVESTIGATED", BY_ROLE, powers, (p, key) => countCell(p.timesInvestigated[key as Role])),
    },
    {
      title: "PEEKS",
      definition: "Times they looked at the top three policies as president.",
      line: "No peeks yet with these players.",
      table: powerCount((p) => p.peeks),
    },
    {
      title: "EXECUTIONS",
      definition: "Players they executed as president.",
      line: noExecutions,
      table: powerCount((p) => p.executions),
    },
    {
      title: "EXECUTION TARGETS",
      definition: "The share of their executions that hit someone from the Fascist side, by their own side.",
      line: noExecutions,
      table: split("EXECUTION TARGETS", BY_SIDE, powers, (p, key) => rateCell(p.fascistTargets[key as Side])),
    },
    {
      title: "HITLER EXECUTED",
      definition: "Times they executed Hitler.",
      line: "No one has executed Hitler yet with these players.",
      table: powerCount((p) => p.hitlerExecuted),
    },
    {
      title: "TIMES EXECUTED",
      definition: "Times they were executed.",
      line: noExecutions,
      table: powerCount((p) => p.timesExecuted),
    },
    {
      title: "FIRST TO GO",
      definition: "Games where they were the first player executed.",
      line: noExecutions,
      table: powerCount((p) => p.executedFirst),
    },
    {
      title: "SPECIAL ELECTIONS",
      definition: "Times they chose the next president.",
      line: noSpecial,
      table: powerCount((p) => p.specialElections),
    },
    {
      title: "SPECIAL ELECTION PICKS",
      definition: "The share of their special elections that made a teammate president.",
      line: noSpecial,
      table: rated(powers, (p) => p.specialTeammate, "special election"),
    },
    {
      title: "VETOES AS PRESIDENT",
      definition: "Vetoes they accepted, of those their chancellor asked for, by their role.",
      line: "No vetoes yet with these players.",
      table: split("VETOES AS PRESIDENT", BY_ROLE, powers, (p, key) => vetoCell(p.vetoes[key as Role])),
    },
    {
      title: "SURVIVAL",
      definition: "The share of their games they were alive at the end, by their role.",
      line: "No games yet with these players.",
      table: split("SURVIVAL", BY_ROLE, powers, (p, key) => rateCell(p.survivalByRole[key as Role])),
    },
  ];
}

/** How many of the cards sit under ELECTIONS AND VOTES; the rest are under POWERS AND SURVIVAL. */
const ELECTION_CARDS = 12;

/** A heading and its cards. */
function Section({ heading, cards, noGames }: { heading: string; cards: Card[]; noGames: boolean }): JSX.Element {
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
  const all = useMemo(() => cards(votes, powers, stats.names), [votes, powers, stats.names]);
  const noGames = stats.counted.length === 0;
  return (
    <div className="votes-tab">
      <Section heading="ELECTIONS AND VOTES" cards={all.slice(0, ELECTION_CARDS)} noGames={noGames} />
      <Section heading="POWERS AND SURVIVAL" cards={all.slice(ELECTION_CARDS)} noGames={noGames} />
    </div>
  );
}
