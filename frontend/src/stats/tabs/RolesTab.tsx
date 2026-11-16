import { useId, useMemo, type ReactNode } from "react";
import { computeCards, HAND_LABELS, type CardStats } from "../cards";
import { MIN_CHANCES, MIN_GAMES, rankRows, rate, type Rate } from "../counting";
import { plural } from "../format";
import { ROLE_WORDS } from "../game/text";
import { formatPercent, formatSigned } from "../numbers";
import { RankedTable } from "../RankedTable";
import { ROLES, type Role } from "../record";
import { computeRoles, TABLE_SIZES, type RoleStats } from "../roles";
import { SplitTable, type SplitCell, type SplitColumn } from "../SplitTable";
import { StatCard } from "../StatCard";
import type { StatsContext } from "../useStats";
import "./RolesTab.css";

/** Larger first, null last: how a rate or a share ranks. */
function larger(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return b - a;
}

const byValue = (a: Rate, b: Rate) => larger(a.value, b.value);
const percent = (r: Rate) => (r.value === null ? "—" : formatPercent(r.value));
const handsLabel = (n: number) => plural(n, "hand");

/** A rate's cell: its share with its chances ("60%" and 5), "—" and its chances below the minimum. */
const rateCell = (r: Rate): SplitCell => ({ text: percent(r), count: r.chances });

const ROLE_COLUMNS: SplitColumn[] = ROLES.map((role) => ({ key: role, label: ROLE_WORDS[role] }));
const SIZE_COLUMNS: SplitColumn[] = TABLE_SIZES.map((n) => ({ key: String(n), label: String(n) }));
const HAND_COLUMNS: SplitColumn[] = [
  ...HAND_LABELS.map((label) => ({ key: label, label })),
  { key: "total", label: "Hands" },
];
const VETO_COLUMNS: SplitColumn[] = [
  { key: "total", label: "Vetoes" },
  { key: "FF", label: "FF" },
  { key: "FL", label: "FL" },
  { key: "LL", label: "LL" },
];
const FORCED_COLUMNS: SplitColumn[] = [
  { key: "president", label: "FFF as president" },
  { key: "chancellor", label: "FF as chancellor" },
];

type SplitRow = { player: number; cells: Record<string, SplitCell> };

/** One card: a ranked table or a split table, or its line when it has no rows. */
interface Card {
  title: string;
  definition: string;
  wide?: boolean;
  /** What the card says when it has games but no rows (else `NO_GAMES`). */
  none?: string;
  rows: number;
  body: ReactNode;
}

/** The card's ranked table of one value per player, for `rows` with a count above zero. */
function ranked<T>(
  stats: StatsContext,
  rows: { player: number; value: T; count: number }[],
  compare: (a: T, b: T) => number,
  format: (value: T) => string,
  min: number,
  countLabel?: (n: number) => string
): { rows: number; body: ReactNode } {
  const shown = rows.filter((row) => row.count > 0);
  return {
    rows: shown.length,
    body: (
      <RankedTable rows={rankRows(shown, compare, stats.names, min)} format={format} names={stats.names} countLabel={countLabel} />
    ),
  };
}

/** The card's split table, for the `rows` that have a cell. */
function split(stats: StatsContext, title: string, columns: SplitColumn[], rows: SplitRow[], above?: ReactNode) {
  const shown = rows.filter((row) => Object.keys(row.cells).length > 0);
  return {
    rows: shown.length,
    body: (
      <>
        {above}
        <SplitTable title={title} columns={columns} rows={shown} names={stats.names} />
      </>
    ),
  };
}

/** A cell for each role that `make` gives one for (null: none, so the table shows "—"). */
function roleCells(make: (role: Role) => SplitCell | null): Record<string, SplitCell> {
  const cells: Record<string, SplitCell> = {};
  for (const role of ROLES) {
    const cell = make(role);
    if (cell !== null) cells[role] = cell;
  }
  return cells;
}

function rolesCards(stats: StatsContext, roles: RoleStats): Card[] {
  const players = Array.from(roles.byPlayer, ([player, p]) => ({ player, p }));
  const winAs = (role: Role, title: string, definition: string, none: string): Card => ({
    title,
    definition,
    none,
    ...ranked(
      stats,
      players.map(({ player, p }) => ({ player, value: p.winAs[role], count: p.winAs[role].chances })),
      byValue,
      percent,
      MIN_GAMES
    ),
  });
  return [
    {
      title: "Role split",
      definition: "Share of their games as Liberal, as Fascist and as Hitler.",
      wide: true,
      ...split(
        stats,
        "Role split",
        ROLE_COLUMNS,
        players
          .filter(({ p }) => p.games > 0)
          .map(({ player, p }) => ({ player, cells: roleCells((role) => ({ text: percent(p.split[role]), count: p.split[role].hits })) }))
      ),
    },
    {
      title: "Role luck",
      definition: "Their Liberal share minus the share their tables' seats would give.",
      ...ranked(
        stats,
        players.map(({ player, p }) => ({ player, value: p.luck, count: p.games })),
        larger,
        (luck) => (luck === null ? "—" : `${formatSigned(luck * 100)}%`),
        MIN_GAMES
      ),
    },
    {
      title: "Times as Hitler",
      definition: "Games played as Hitler.",
      ...ranked(
        stats,
        players.map(({ player, p }) => ({ player, value: p.split.HITLER.hits, count: p.games })),
        (a, b) => b - a,
        String,
        1
      ),
    },
    {
      title: "Longest run of one role",
      definition: "Most games in a row in the same role.",
      ...ranked(
        stats,
        players.map(({ player, p }) => ({ player, value: p.longestRun, count: p.games })),
        (a, b) => b.length - a.length,
        (run) => `${run.length} as ${ROLE_WORDS[run.role]}`,
        1
      ),
    },
    winAs("LIBERAL", "Win rate as Liberal", "Games won as a Liberal, of their games as one.", "No games as a Liberal yet with these players."),
    winAs(
      "FASCIST",
      "Win rate as Fascist",
      "Games won as a Fascist (not Hitler), of their games as one.",
      "No games as a Fascist yet with these players."
    ),
    winAs("HITLER", "Win rate as Hitler", "Games won as Hitler, of their games as Hitler.", "No games as Hitler yet with these players."),
    {
      title: "Win rate by player count",
      definition: "Games won at each table size, from 5 to 10 seats.",
      wide: true,
      ...split(
        stats,
        "Win rate by player count",
        SIZE_COLUMNS,
        players.map(({ player, p }) => {
          const cells: Record<string, SplitCell> = {};
          for (const n of TABLE_SIZES) {
            const at = p.bySize.get(n);
            if (at !== undefined && at.chances > 0) cells[String(n)] = rateCell(at);
          }
          return { player, cells };
        })
      ),
    },
    {
      title: "First president",
      definition: "Games won when they made the first nomination.",
      none: "No complete games yet with these players.",
      ...ranked(
        stats,
        players.map(({ player, p }) => ({ player, value: p.firstPresident, count: p.firstPresident.chances })),
        byValue,
        percent,
        MIN_GAMES
      ),
    },
  ];
}

function presidentCards(stats: StatsContext, cards: CardStats): Card[] {
  const players = Array.from(cards.byPlayer, ([player, p]) => ({ player, p }));
  const total = (hands: readonly number[]) => hands.reduce((sum, n) => sum + n, 0);
  const everyone = total(cards.hands);
  const group =
    everyone === 0
      ? null
      : `Everyone: ${HAND_LABELS.map((label, i) => `${label} ${formatPercent(cards.hands[i] / everyone)}`).join(" · ")} (${handsLabel(everyone)})`;
  return [
    {
      title: "Hands drawn",
      definition: "How often their three cards held 0, 1, 2 or 3 Liberals, beside everyone's.",
      wide: true,
      none: "No hands drawn yet with these players.",
      ...split(
        stats,
        "Hands drawn",
        HAND_COLUMNS,
        players
          .filter(({ p }) => total(p.hands) > 0)
          .map(({ player, p }) => {
            const drawn = total(p.hands);
            const cells: Record<string, SplitCell> = { total: { text: String(drawn) } };
            HAND_LABELS.forEach((label, i) => {
              cells[label] = { text: percent(rate(p.hands[i], drawn, MIN_CHANCES)), count: p.hands[i] };
            });
            return { player, cells };
          }),
        group === null ? null : <p className="roles-group">{group}</p>
      ),
    },
    {
      title: "Liberal accuracy",
      definition: "As a Liberal president holding both kinds, how often they discarded a Fascist.",
      none: "No Liberal president has held both kinds yet.",
      ...ranked(
        stats,
        players.map(({ player, p }) => ({ player, value: p.liberalAccuracy, count: p.liberalAccuracy.chances })),
        byValue,
        percent,
        MIN_CHANCES,
        handsLabel
      ),
    },
    {
      title: "Deep cover (president)",
      definition: "As a Fascist or Hitler president holding both kinds: discarded a Fascist · a Liberal.",
      none: "No Fascist or Hitler president has held both kinds yet.",
      ...ranked(
        stats,
        players.map(({ player, p }) => ({ player, value: p.deepCover, count: p.deepCover.chances })),
        byValue,
        (r) => (r.value === null ? "—" : `${formatPercent(r.value)} · ${100 - Math.round(r.value * 100)}%`),
        MIN_CHANCES,
        handsLabel
      ),
    },
  ];
}

function chancellorCards(stats: StatsContext, cards: CardStats): Card[] {
  const players = Array.from(cards.byPlayer, ([player, p]) => ({ player, p }));
  return [
    {
      title: "Given one of each",
      definition: "Handed a Liberal and a Fascist, how often they enacted the Liberal. Accepted vetoes are left out.",
      none: "No chancellor has been handed one of each yet.",
      ...split(
        stats,
        "Given one of each",
        ROLE_COLUMNS,
        players.map(({ player, p }) => ({
          player,
          cells: roleCells((role) => (p.oneOfEach[role].chances > 0 ? rateCell(p.oneOfEach[role]) : null)),
        }))
      ),
    },
    {
      title: "Policies enacted",
      definition: "Policies enacted as chancellor, by kind and by their role.",
      wide: true,
      none: "No policy enacted by a chancellor yet.",
      ...split(
        stats,
        "Policies enacted",
        ROLE_COLUMNS,
        players.map(({ player, p }) => ({
          player,
          cells: roleCells((role) => {
            const { L, F } = p.enacted[role];
            return L + F > 0 ? { text: `${L} L · ${F} F` } : null;
          }),
        }))
      ),
    },
    {
      title: "Vetoes asked for",
      definition: "Vetoes asked for as chancellor, by the two cards they held.",
      none: "No vetoes yet with these players.",
      ...split(
        stats,
        "Vetoes asked for",
        VETO_COLUMNS,
        players
          .filter(({ p }) => p.vetoes[0] + p.vetoes[1] + p.vetoes[2] > 0)
          .map(({ player, p }) => {
            const [ff, fl, ll] = p.vetoes;
            const count = (n: number): SplitCell => ({ text: String(n) });
            return { player, cells: { total: count(ff + fl + ll), FF: count(ff), FL: count(fl), LL: count(ll) } };
          })
      ),
    },
  ];
}

function blameCards(stats: StatsContext, roles: RoleStats, cards: CardStats): Card[] {
  const players = Array.from(cards.byPlayer, ([player, p]) => ({ player, p }));
  const games = (player: number) => roles.byPlayer.get(player)?.games ?? 0;
  return [
    {
      title: "Fascist choices",
      definition: "Times they chose a Fascist when the government could have enacted a Liberal.",
      none: "No Fascist chosen over a Liberal yet.",
      ...ranked(
        stats,
        players.filter(({ p }) => p.fascistChoices > 0).map(({ player, p }) => ({ player, value: p.fascistChoices, count: games(player) })),
        (a, b) => b - a,
        String,
        1
      ),
    },
    {
      title: "Forced Fascists",
      definition: "As a Liberal: three Fascists drawn as president, or two handed over as chancellor.",
      none: "No forced Fascists yet with these players.",
      ...split(
        stats,
        "Forced Fascists",
        FORCED_COLUMNS,
        players
          .filter(({ p }) => p.forced.president + p.forced.chancellor > 0)
          .map(({ player, p }) => ({
            player,
            cells: { president: { text: String(p.forced.president) }, chancellor: { text: String(p.forced.chancellor) } },
          }))
      ),
    },
  ];
}

/** A section: its heading over its cards in a grid. */
function Section({ title, cards, noGames }: { title: string; cards: Card[]; noGames: boolean }): JSX.Element {
  const headingId = useId();
  return (
    <section className="roles-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <div className="roles-grid">
        {cards.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            definition={card.definition}
            className={card.wide ? "roles-wide" : undefined}
            empty={noGames ? true : card.rows === 0 ? (card.none ?? true) : undefined}
          >
            {card.body}
          </StatCard>
        ))}
      </div>
    </section>
  );
}

/**
 * ROLES & CARDS (`/stats/roles`): each player's roles and cards over the counted games, in four
 * sections (Roles, As president, As chancellor, Blame) of seventeen cards. The numbers come from
 * `computeRoles` and `computeCards`, worked out once per counted games.
 */
export function RolesTab({ stats }: { stats: StatsContext }): JSX.Element {
  const roles = useMemo(() => computeRoles(stats.counted), [stats.counted]);
  const cards = useMemo(() => computeCards(stats.counted), [stats.counted]);
  const noGames = stats.counted.length === 0;
  return (
    <div className="roles-tab">
      <Section title="Roles" cards={rolesCards(stats, roles)} noGames={noGames} />
      <Section title="As president" cards={presidentCards(stats, cards)} noGames={noGames} />
      <Section title="As chancellor" cards={chancellorCards(stats, cards)} noGames={noGames} />
      <Section title="Blame" cards={blameCards(stats, roles, cards)} noGames={noGames} />
    </div>
  );
}
