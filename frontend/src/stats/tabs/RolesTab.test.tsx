import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeCards, type CardStats, type PlayerCards } from "../cards";
import { MIN_CHANCES, MIN_GAMES, rate } from "../counting";
import type { StatsData } from "../record";
import { computeRoles, type PlayerRoles, type RoleStats } from "../roles";
import { NO_GAMES } from "../StatCard";
import { game, seatsOf } from "../testGames";
import { buildStats } from "../useStats";
import { RolesTab } from "./RolesTab";

vi.mock("../roles", async (orig) => ({ ...(await orig<typeof import("../roles")>()), computeRoles: vi.fn() }));
vi.mock("../cards", async (orig) => ({ ...(await orig<typeof import("../cards")>()), computeCards: vi.fn() }));

/** A player's role stats, all zero, with `o` over them. */
function playerRoles(o: Partial<PlayerRoles> = {}): PlayerRoles {
  const none = () => ({ LIBERAL: rate(0, 0, MIN_GAMES), FASCIST: rate(0, 0, MIN_GAMES), HITLER: rate(0, 0, MIN_GAMES) });
  return {
    games: 0,
    split: none(),
    expectedLiberalGames: 0,
    luck: null,
    longestRun: { role: "LIBERAL", length: 0 },
    winAs: none(),
    bySize: new Map(),
    firstPresident: rate(0, 0, MIN_GAMES),
    ...o,
  };
}

/** A player's card stats, all zero, with `o` over them. */
function playerCards(o: Partial<PlayerCards> = {}): PlayerCards {
  const none = () => ({ LIBERAL: rate(0, 0), FASCIST: rate(0, 0), HITLER: rate(0, 0) });
  return {
    hands: [0, 0, 0, 0],
    liberalAccuracy: rate(0, 0),
    deepCover: rate(0, 0),
    oneOfEach: none(),
    enacted: { LIBERAL: { L: 0, F: 0 }, FASCIST: { L: 0, F: 0 }, HITLER: { L: 0, F: 0 } },
    vetoes: [0, 0, 0],
    fascistChoices: 0,
    forced: { president: 0, chancellor: 0 },
    ...o,
  };
}

const ROLE_STATS: RoleStats = {
  byPlayer: new Map([
    [
      1,
      playerRoles({
        games: 6,
        luck: 0.0636,
        longestRun: { role: "LIBERAL", length: 3 },
        bySize: new Map([
          [5, rate(3, 5, MIN_GAMES)],
          [7, rate(1, 2, MIN_GAMES)],
        ]),
      }),
    ],
    [2, playerRoles({ games: 2 })],
    [4, playerRoles({ games: 5 })],
  ]),
};

const CARD_STATS: CardStats = {
  byPlayer: new Map([
    [
      1,
      playerCards({
        hands: [1, 1, 1, 1],
        enacted: { LIBERAL: { L: 2, F: 1 }, FASCIST: { L: 0, F: 0 }, HITLER: { L: 0, F: 1 } },
      }),
    ],
    [2, playerCards()],
    [4, playerCards({ deepCover: rate(2, 5, MIN_CHANCES) })],
  ]),
  hands: [2, 2, 1, 1],
};

const T0 = Date.UTC(2026, 10, 1, 20, 0);

/**
 * Annie (whose seat in the one game is still named Ann), Bo and Di, with that game (complete
 * unless `complete` is false) or none.
 */
function stats({ withGames = true, complete = true }: { withGames?: boolean; complete?: boolean } = {}) {
  const seats = seatsOf([1, 2, 4, null, null]);
  seats[0] = { ...seats[0], name: "Ann" };
  const data: StatsData = {
    players: [
      { number: 1, name: "Annie" },
      { number: 2, name: "Bo" },
      { number: 4, name: "Di" },
    ],
    games: withGames ? [game("g1", T0, seats, "LIBERAL", { complete })] : [],
  };
  return buildStats(data, { players: null, cpu: true });
}

const TITLES = [
  "Role split",
  "Role luck",
  "Times as Hitler",
  "Longest run of one role",
  "Win rate as Liberal",
  "Win rate as Fascist",
  "Win rate as Hitler",
  "Win rate by player count",
  "First president",
  "Hands drawn",
  "Liberal accuracy",
  "Deep cover (president)",
  "Given one of each",
  "Policies enacted",
  "Vetoes asked for",
  "Fascist choices",
  "Forced Fascists",
];

/** The texts of the cells after the name in `name`'s row of the table region `table`. */
function cellsOf(table: string, name: string): string[] {
  const row = within(screen.getByRole("region", { name: table })).getByRole("row", { name: new RegExp(`^${name}\\b`) });
  return Array.from(row.querySelectorAll("td"), (td) => td.textContent ?? "");
}

beforeEach(() => {
  vi.mocked(computeRoles).mockReset().mockReturnValue(ROLE_STATS);
  vi.mocked(computeCards).mockReset().mockReturnValue(CARD_STATS);
});

describe("RolesTab", () => {
  it("shows four sections and seventeen cards in order", () => {
    render(<RolesTab stats={stats()} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Roles",
      "As president",
      "As chancellor",
      "Blame",
    ]);
    const cards = TITLES.map((title) => screen.getByRole("region", { name: title }));
    cards.slice(1).forEach((card, i) => {
      expect(cards[i].compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING, TITLES[i + 1]).toBeTruthy();
    });
  });

  it("shows each format", () => {
    const { container } = render(<RolesTab stats={stats()} />);
    expect(screen.getByText("+6%")).toBeInTheDocument();
    expect(screen.getByText("3 as Liberal")).toBeInTheDocument();
    expect(screen.getByText("40% · 60%")).toBeInTheDocument();
    expect(container.querySelector(".roles-group")).toHaveTextContent(
      /^Everyone: FFF 33% · FFL 33% · FLL 17% · LLL 17% \(6 hands\)$/
    );
    const matches = (cells: string[], patterns: RegExp[]) => {
      expect(cells).toHaveLength(patterns.length);
      cells.forEach((cell, i) => expect(cell).toMatch(patterns[i]));
    };
    matches(cellsOf("Win rate by player count table", "Annie"), [/^60%\D*5$/, /^—$/, /^—\D*2$/, /^—$/, /^—$/, /^—$/]);
    matches(cellsOf("Hands drawn table", "Annie"), [/^—\D*1$/, /^—\D*1$/, /^—\D*1$/, /^—\D*1$/, /^4$/]);
    matches(cellsOf("Policies enacted table", "Annie"), [/^2 L · 1 F$/, /^—$/, /^0 L · 1 F$/]);
  });

  it("names players as they are called now", () => {
    render(<RolesTab stats={stats()} />);
    expect(screen.getAllByText("Annie").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ann")).toBeNull();
  });

  it("says NO_GAMES on every card when nothing counts", () => {
    vi.mocked(computeRoles).mockReturnValue({ byPlayer: new Map() });
    vi.mocked(computeCards).mockReturnValue({ byPlayer: new Map(), hands: [0, 0, 0, 0] });
    render(<RolesTab stats={stats({ withGames: false })} />);
    expect(screen.getAllByText(NO_GAMES)).toHaveLength(17);
  });

  it("gives a card with nothing its own line", () => {
    render(<RolesTab stats={stats()} />);
    expect(screen.getByText("No vetoes yet with these players.")).toBeInTheDocument();
  });

  it("gives each card with games but nothing to show its own line", () => {
    // One game, lost at five seats, with nothing else to its name.
    const once = playerRoles({ games: 1, bySize: new Map([[5, rate(0, 1, MIN_GAMES)]]) });
    vi.mocked(computeRoles).mockReturnValue({ byPlayer: new Map([[1, once]]) });
    vi.mocked(computeCards).mockReturnValue({ byPlayer: new Map([[1, playerCards()]]), hands: [0, 0, 0, 0] });
    render(<RolesTab stats={stats()} />);
    const lines: [string, string][] = [
      ["Win rate as Liberal", "No games as a Liberal yet with these players."],
      ["Win rate as Fascist", "No games as a Fascist yet with these players."],
      ["Win rate as Hitler", "No games as Hitler yet with these players."],
      ["First president", "No player has made the first nomination yet."],
      ["Hands drawn", "No hands drawn yet with these players."],
      ["Liberal accuracy", "No Liberal president has held both kinds yet."],
      ["Deep cover (president)", "No Fascist or Hitler president has held both kinds yet."],
      ["Given one of each", "No chancellor has been handed one of each yet."],
      ["Policies enacted", "No policy enacted by a chancellor yet."],
      ["Vetoes asked for", "No vetoes yet with these players."],
      ["Fascist choices", "No Fascist chosen over a Liberal yet."],
      ["Forced Fascists", "No forced Fascists yet with these players."],
    ];
    for (const [title, line] of lines) {
      expect(within(screen.getByRole("region", { name: title })).getByText(line), title).toBeInTheDocument();
    }
    expect(screen.queryByText(NO_GAMES)).toBeNull();
  });

  it("says First president has no complete games only when none is complete", () => {
    vi.mocked(computeRoles).mockReturnValue({ byPlayer: new Map([[1, playerRoles({ games: 1 })]]) });
    render(<RolesTab stats={stats({ complete: false })} />);
    const card = screen.getByRole("region", { name: "First president" });
    expect(within(card).getByText("No complete games yet with these players.")).toBeInTheDocument();
  });

  it("keeps everyone's hands when no player drew one", () => {
    vi.mocked(computeCards).mockReturnValue({ byPlayer: new Map([[1, playerCards()]]), hands: [1, 0, 0, 0] });
    render(<RolesTab stats={stats()} />);
    const card = screen.getByRole("region", { name: "Hands drawn" });
    expect(card.querySelector(".roles-group")).toHaveTextContent(/^Everyone: FFF 100% · FFL 0% · FLL 0% · LLL 0% \(1 hand\)$/);
    expect(within(card).queryByText("No hands drawn yet with these players.")).toBeNull();
    expect(within(card).queryByRole("region", { name: "Hands drawn table" })).toBeNull();
  });

  it("keeps wide tables in their card's region that scrolls", () => {
    render(<RolesTab stats={stats()} />);
    for (const title of ["Role split", "Win rate by player count", "Hands drawn", "Policies enacted"]) {
      const card = screen.getByRole("region", { name: title });
      expect(card, title).toHaveClass("roles-wide");
      expect(within(card).getByRole("region", { name: `${title} table` })).toBeInTheDocument();
    }
  });

  it("computes once per counted games", () => {
    const context = stats();
    const { rerender } = render(<RolesTab stats={context} />);
    rerender(<RolesTab stats={context} />);
    expect(computeRoles).toHaveBeenCalledTimes(1);
    expect(computeCards).toHaveBeenCalledTimes(1);
  });
});
