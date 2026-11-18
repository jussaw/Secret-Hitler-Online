import { useId, useMemo, type ReactNode } from "react";
import { computeCards, HAND_LABELS, type CardStats } from "../cards";
import { MIN_CHANCES, MIN_GAMES, rankRows, rate, type Rate } from "../counting";
import { plural } from "../format";
import { ROLE_WORDS } from "../game/text";
import { countFigure, formatPercent, formatSigned, rateFigure, wholePercent } from "../numbers";
import { RankedTable, type RankedHeads } from "../RankedTable";
import { ROLES, type Role } from "../record";
import { byRole, computeRoles, TABLE_SIZES, type RoleStats } from "../roles";
import { SplitTable, type SplitCell, type SplitColumn } from "../SplitTable";
import { StatCard } from "../StatCard";
import type { StatsContext } from "../useStats";
import { rateText } from "./cellText";
import "./RolesTab.css";

/** Larger first, null last: how a rate or a share ranks. */
function larger(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return b - a;
}

/** More first: how a count ranks. */
const more = (a: number, b: number) => b - a;
const byValue = (a: Rate, b: Rate) => larger(a.value, b.value);
/** A rate as shown: a whole percent, or "—" below its minimum (`rateText`, whose figure is
 *  `rateFigure`'s). */
const percent = (r: Rate) => rateText(r.value);
const handsLabel = (n: number) => plural(n, "hand");
const sum = (counts: readonly number[]) => counts.reduce((total, n) => total + n, 0);
/** Each player's stats in a module's `byPlayer`, as rows to filter and map. */
const entries = <P,>(byPlayer: Map<number, P>) => Array.from(byPlayer, ([player, p]) => ({ player, p }));

/** A rate's cell: its share with its chances ("60%" and 5), "—" and its chances below the minimum,
 *  sorted by the whole percent it shows (null for "—"). */
const rateCell = (r: Rate): SplitCell => ({ text: percent(r), value: rateFigure(r), count: r.chances });
/** A plain count's cell: the number as its text and its figure, with no count beside it. */
const countCell = (n: number): SplitCell => ({ text: String(n), value: countFigure(n) });

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

/** One stat card: a ranked table or a split table, or its line when it has no rows. */
interface CardSpec {
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
  names: Map<number, string>,
  rows: { player: number; value: T; count: number }[],
  compare: (a: T, b: T) => number,
  format: (value: T) => string,
  min: number,
  heads: RankedHeads<T>
): { rows: number; body: ReactNode } {
  const shown = rows.filter((row) => row.count > 0);
  return {
    rows: shown.length,
    body: <RankedTable rows={rankRows(shown, compare, names, min)} format={format} names={names} {...heads} />,
  };
}

/** The card's split table, for the `rows` that have a cell. */
function split(names: Map<number, string>, title: string, columns: SplitColumn[], rows: SplitRow[]) {
  const shown = rows.filter((row) => Object.keys(row.cells).length > 0);
  return { rows: shown.length, body: <SplitTable title={title} columns={columns} rows={shown} names={names} /> };
}

/** A cell for each role that `make` gives one for (null: none, so the table shows "—"). */
function roleCells(make: (role: Role) => SplitCell | null): Record<string, SplitCell> {
  const made = byRole(make);
  const cells: Record<string, SplitCell> = {};
  for (const role of ROLES) {
    const cell = made[role];
    if (cell !== null) cells[role] = cell;
  }
  return cells;
}

function rolesCards(stats: StatsContext, roles: RoleStats): CardSpec[] {
  const { names } = stats;
  const players = entries(roles.byPlayer);
  const winAs = (role: Role, title: string, definition: string, none: string): CardSpec => ({
    title,
    definition,
    none,
    ...ranked(
      names,
      players.map(({ player, p }) => ({ player, value: p.winAs[role], count: p.winAs[role].chances })),
      byValue,
      percent,
      MIN_GAMES,
      { valueHead: "Win rate", sortValue: rateFigure, countHead: "Games" }
    ),
  });
  return [
    {
      title: "Role split",
      definition: "Share of their games as Liberal, as Fascist and as Hitler.",
      wide: true,
      ...split(
        names,
        "Role split",
        ROLE_COLUMNS,
        players
          .filter(({ p }) => p.games > 0)
          .map(({ player, p }) => ({
            player,
            cells: roleCells((role) => {
              const share = p.split[role];
              return { text: percent(share), value: rateFigure(share), count: share.hits };
            }),
          }))
      ),
    },
    {
      title: "Role luck",
      definition: "Their Liberal share minus the share their tables' seats would give.",
      ...ranked(
        names,
        players.map(({ player, p }) => ({ player, value: p.luck, count: p.games })),
        larger,
        (luck) => (luck === null ? "—" : `${formatSigned(luck * 100)}%`),
        MIN_GAMES,
        { valueHead: "Luck", sortValue: (luck) => (luck === null ? null : wholePercent(luck)), countHead: "Games" }
      ),
    },
    {
      title: "Times as Hitler",
      definition: "Games played as Hitler.",
      ...ranked(
        names,
        players.map(({ player, p }) => ({ player, value: p.split.HITLER.hits, count: p.games })),
        more,
        String,
        1,
        { valueHead: "Times", sortValue: countFigure }
      ),
    },
    {
      title: "Longest run of one role",
      definition: "Most games in a row in the same role.",
      ...ranked(
        names,
        players.map(({ player, p }) => ({ player, value: p.longestRun, count: p.games })),
        (a, b) => more(a.length, b.length),
        (run) => `${run.length} as ${ROLE_WORDS[run.role]}`,
        1,
        { valueHead: "Run", sortValue: (run) => run.length }
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
        names,
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
      // A record restored from an older backup starts late, so only complete games say who began.
      none: stats.counted.some((record) => record.complete)
        ? "No player has made the first nomination yet."
        : "No complete games yet with these players.",
      ...ranked(
        names,
        players.map(({ player, p }) => ({ player, value: p.firstPresident, count: p.firstPresident.chances })),
        byValue,
        percent,
        MIN_GAMES,
        { valueHead: "Win rate", sortValue: rateFigure, countHead: "Games" }
      ),
    },
  ];
}

/**
 * Hands drawn: everyone's shares on a line, then each player's hands. With hands drawn only by CPU
 * presidents, the line stands alone; with none drawn at all, the card says so.
 */
function handsCard(names: Map<number, string>, cards: CardStats): CardSpec {
  const everyone = sum(cards.hands);
  const shares = HAND_LABELS.map((label, i) => `${label} ${formatPercent(cards.hands[i] / everyone)}`);
  const table = split(
    names,
    "Hands drawn",
    HAND_COLUMNS,
    entries(cards.byPlayer)
      .filter(({ p }) => sum(p.hands) > 0)
      .map(({ player, p }) => {
        const drawn = sum(p.hands);
        const cells: Record<string, SplitCell> = { total: countCell(drawn) };
        HAND_LABELS.forEach((label, i) => {
          // One rate for the text and the figure it sorts by.
          const share = rate(p.hands[i], drawn, MIN_CHANCES);
          cells[label] = { text: percent(share), value: rateFigure(share), count: p.hands[i] };
        });
        return { player, cells };
      })
  );
  return {
    title: "Hands drawn",
    definition: "How often their three cards held 0, 1, 2 or 3 Liberals, beside everyone's.",
    wide: true,
    none: "No hands drawn yet with these players.",
    rows: everyone,
    body: (
      <>
        <p className="roles-group">{`Everyone: ${shares.join(" · ")} (${handsLabel(everyone)})`}</p>
        {table.rows > 0 && table.body}
      </>
    ),
  };
}

function presidentCards(names: Map<number, string>, cards: CardStats): CardSpec[] {
  const players = entries(cards.byPlayer);
  return [
    handsCard(names, cards),
    {
      title: "Liberal accuracy",
      definition: "As a Liberal president holding both kinds, how often they discarded a Fascist.",
      none: "No Liberal president has held both kinds yet.",
      ...ranked(
        names,
        players.map(({ player, p }) => ({ player, value: p.liberalAccuracy, count: p.liberalAccuracy.chances })),
        byValue,
        percent,
        MIN_CHANCES,
        { valueHead: "Accuracy", sortValue: rateFigure, countHead: "Hands" }
      ),
    },
    {
      title: "Deep cover (president)",
      definition: "As a Fascist or Hitler president holding both kinds: discarded a Fascist · a Liberal.",
      none: "No Fascist or Hitler president has held both kinds yet.",
      ...ranked(
        names,
        players.map(({ player, p }) => ({ player, value: p.deepCover, count: p.deepCover.chances })),
        byValue,
        // The second share is what the first leaves after rounding, so the two add up to 100%.
        (r) => (r.value === null ? "—" : `${formatPercent(r.value)} · ${100 - Math.round(r.value * 100)}%`),
        MIN_CHANCES,
        // Sorted by the first share: how often they discarded a Fascist.
        { valueHead: "Discards", sortValue: rateFigure, countHead: "Hands" }
      ),
    },
  ];
}

function chancellorCards(names: Map<number, string>, cards: CardStats): CardSpec[] {
  const players = entries(cards.byPlayer);
  return [
    {
      title: "Given one of each",
      definition: "Handed a Liberal and a Fascist, how often they enacted the Liberal. Accepted vetoes are left out.",
      none: "No chancellor has been handed one of each yet.",
      ...split(
        names,
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
        names,
        "Policies enacted",
        ROLE_COLUMNS,
        players.map(({ player, p }) => ({
          player,
          cells: roleCells((role) => {
            const { L, F } = p.enacted[role];
            // Sorted by the Liberals it leads with, never its Fascists or its total.
            return L + F > 0 ? { text: `${L} L · ${F} F`, value: L } : null;
          }),
        }))
      ),
    },
    {
      title: "Vetoes asked for",
      definition: "Vetoes asked for as chancellor, by the two cards they held.",
      none: "No vetoes yet with these players.",
      ...split(
        names,
        "Vetoes asked for",
        VETO_COLUMNS,
        players
          .filter(({ p }) => sum(p.vetoes) > 0)
          .map(({ player, p }) => {
            const [ff, fl, ll] = p.vetoes;
            return { player, cells: { total: countCell(sum(p.vetoes)), FF: countCell(ff), FL: countCell(fl), LL: countCell(ll) } };
          })
      ),
    },
  ];
}

function blameCards(names: Map<number, string>, roles: RoleStats, cards: CardStats): CardSpec[] {
  const players = entries(cards.byPlayer);
  const games = (player: number) => roles.byPlayer.get(player)?.games ?? 0;
  return [
    {
      title: "Fascist choices",
      definition: "Times they chose a Fascist when the government could have enacted a Liberal.",
      none: "No Fascist chosen over a Liberal yet.",
      ...ranked(
        names,
        players.filter(({ p }) => p.fascistChoices > 0).map(({ player, p }) => ({ player, value: p.fascistChoices, count: games(player) })),
        more,
        String,
        1,
        { valueHead: "Choices", sortValue: countFigure }
      ),
    },
    {
      title: "Forced Fascists",
      definition: "As a Liberal: three Fascists drawn as president, or two handed over as chancellor.",
      none: "No forced Fascists yet with these players.",
      ...split(
        names,
        "Forced Fascists",
        FORCED_COLUMNS,
        players
          .filter(({ p }) => p.forced.president + p.forced.chancellor > 0)
          .map(({ player, p }) => ({
            player,
            cells: { president: countCell(p.forced.president), chancellor: countCell(p.forced.chancellor) },
          }))
      ),
    },
  ];
}

/** A section: its heading over its cards in a grid. */
function Section({ title, cards, noGames }: { title: string; cards: CardSpec[]; noGames: boolean }): JSX.Element {
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
      <Section title="As president" cards={presidentCards(stats.names, cards)} noGames={noGames} />
      <Section title="As chancellor" cards={chancellorCards(stats.names, cards)} noGames={noGames} />
      <Section title="Blame" cards={blameCards(stats.names, roles, cards)} noGames={noGames} />
    </div>
  );
}
