import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FINISHES_SHOWN } from "../endings";
import { formatLocalDateTime } from "../format";
import { NO_GAMES } from "../StatCard";
import { chaosRun, ended, failed } from "../testEndings";
import { repeat, statsOf } from "../testRivals";
import { EndingsTab } from "./EndingsTab";

const TITLES = [
  "How games are won",
  "Liberal win rate by player count",
  "Game length",
  "Fastest win",
  "Longest game",
  "Most in one game",
  "Closest finishes",
  "Most lopsided finishes",
];
const NOT_FROM_START = "No game recorded from its start yet.";

const RATES = "Liberal win rate by player count table";
const LENGTHS = "Game length table";

/** The body rows of the region `label`'s table, each as its header's and cells' texts. */
function bodyRows(label: string): string[][] {
  const table = within(screen.getByRole("region", { name: label })).getByRole("table");
  return Array.from(table.querySelectorAll("tbody tr"), (row) => Array.from(row.querySelectorAll("th, td"), (c) => c.textContent ?? ""));
}

/** The first cell of each body row of the region `label`'s table: its players, or All. */
function firstCells(label: string): string[] {
  return bodyRows(label).map((row) => row[0]);
}

/** Each column head's `aria-sort` in the region `label`'s table, null where it has none. */
function sortsOf(label: string): (string | null)[] {
  return within(screen.getByRole("region", { name: label }))
    .getAllByRole("columnheader")
    .map((head) => head.getAttribute("aria-sort"));
}

/** A press on the head `name` of the region `label`'s table. */
function press(label: string, name: string): void {
  fireEvent.click(within(screen.getByRole("region", { name: label })).getByRole("button", { name }));
}

/** Raw and smoothed rates: 5 players (3 games, too few for a rate, smoothed 54%) and 6 players
 *  (10 games, 40%, smoothed 45%). */
function rateGames() {
  return [
    ...repeat(4, () => ended(6, "LIBERAL_POLICIES")),
    ...repeat(6, () => ended(6, "FASCIST_POLICIES")),
    ended(5, "LIBERAL_POLICIES"),
    ended(5, "HITLER_EXECUTED"),
    ended(5, "HITLER_ELECTED"),
  ];
}

const RATE_ROWS = [
  ["5", "3", "2", "—", "54%"],
  ["6", "10", "4", "40%", "45%"],
];

/** Lengths: 5 players (2 games, 38 min, 7.5 rounds), 8 (1 game, 1 h 15 min, 10.0) and 9 (none
 *  recorded from its start: "—"). */
function lengthGames() {
  return [
    ended(5, "LIBERAL_POLICIES", { minutes: 30, rounds: 6 }),
    ended(5, "HITLER_ELECTED", { minutes: 45, rounds: 9 }),
    ended(8, "FASCIST_POLICIES", { minutes: 75, rounds: 10 }),
    ended(9, "HITLER_EXECUTED", { minutes: 20, rounds: 4, complete: false }),
  ];
}

const LENGTH_ROWS = [
  ["5", "2", "38 min", "7.5"],
  ["8", "1", "1 h 15 min", "10.0"],
  ["9", "0", "—", "—"],
  ["All", "3", "50 min", "8.3"],
];
const ALL_ROW = LENGTH_ROWS[3];

describe("EndingsTab", () => {
  it("shows every card", () => {
    render(<EndingsTab stats={statsOf([ended(5, "LIBERAL_POLICIES"), ended(7, "HITLER_ELECTED")])} />);
    const cards = Array.from(document.querySelectorAll("section"), (s) => s.querySelector("h3")!.textContent);
    expect(cards).toEqual(TITLES);
    for (const title of TITLES) expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "How games are won by the number of players" })).toBeInTheDocument();
  });

  it("links each listed game to its page", () => {
    const close = ended(6, "HITLER_ELECTED", { liberal: 4, fascist: 3 });
    render(<EndingsTab stats={statsOf([close])} />);
    const href = `/games/${close.id}`;
    const link = screen.getByRole("link", { name: `${formatLocalDateTime(close.endedAt)} · Fascists win · Hitler elected · 4 L, 3 F` });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveClass("endings-game-link");
    const see = screen.getAllByRole("link", { name: "See this game" });
    expect(see).toHaveLength(2);
    for (const each of see) expect(each).toHaveAttribute("href", href);
    expect(within(screen.getByRole("region", { name: "Closest finishes" })).getByText("1 game")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Most lopsided finishes" })).toHaveTextContent("No lopsided finishes yet.");
  });

  it("shows raw and smoothed Liberal rates", () => {
    render(<EndingsTab stats={statsOf(rateGames())} />);
    const region = screen.getByRole("region", { name: RATES });
    expect(within(region).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Players",
      "Games",
      "Liberal wins",
      "Win rate",
      "Smoothed",
    ]);
    expect(bodyRows(RATES)).toEqual(RATE_ROWS);
  });

  it("averages each size's length, then all of them", () => {
    render(<EndingsTab stats={statsOf(lengthGames())} />);
    expect(bodyRows(LENGTHS)).toEqual(LENGTH_ROWS);
  });

  it("bothTablesOpenFiveFirstWithPlayersMarked", () => {
    const rates = render(<EndingsTab stats={statsOf(rateGames())} />);
    expect(bodyRows(RATES)).toEqual(RATE_ROWS);
    expect(sortsOf(RATES)).toEqual(["ascending", null, null, null, null]);
    expect(sortsOf(LENGTHS)).toEqual(["ascending", null, null, null]);
    rates.unmount();
    render(<EndingsTab stats={statsOf(lengthGames())} />);
    expect(bodyRows(LENGTHS)).toEqual(LENGTH_ROWS);
    expect(sortsOf(RATES)).toEqual(["ascending", null, null, null, null]);
    expect(sortsOf(LENGTHS)).toEqual(["ascending", null, null, null]);
    for (const label of [RATES, LENGTHS]) {
      const players = within(screen.getByRole("region", { name: label })).getByRole("columnheader", { name: "Players" });
      expect(players).toHaveAttribute("aria-sort", "ascending");
    }
  });

  it("theWinRateTableSortsByItsShownFigures", () => {
    render(<EndingsTab stats={statsOf(rateGames())} />);
    // Win rate, most first: 6's 40% above 5's "—", which stays below either way.
    press(RATES, "Win rate");
    expect(firstCells(RATES)).toEqual(["6", "5"]);
    expect(sortsOf(RATES)).toEqual([null, null, null, "descending", null]);
    press(RATES, "Win rate");
    expect(firstCells(RATES)).toEqual(["6", "5"]);
    expect(sortsOf(RATES)).toEqual([null, null, null, "ascending", null]);
    // Smoothed, most first: 5's 54% above 6's 45%; again, 6 first.
    press(RATES, "Smoothed");
    expect(bodyRows(RATES)).toEqual(RATE_ROWS);
    expect(sortsOf(RATES)).toEqual([null, null, null, null, "descending"]);
    press(RATES, "Smoothed");
    expect(firstCells(RATES)).toEqual(["6", "5"]);
    // Players, its first press 5 first, the table's own order; again, 6 first.
    press(RATES, "Players");
    expect(bodyRows(RATES)).toEqual(RATE_ROWS);
    expect(sortsOf(RATES)).toEqual(["ascending", null, null, null, null]);
    press(RATES, "Players");
    expect(bodyRows(RATES)).toEqual([RATE_ROWS[1], RATE_ROWS[0]]);
    expect(sortsOf(RATES)).toEqual(["descending", null, null, null, null]);
    // The other table keeps its own sort.
    expect(sortsOf(LENGTHS)).toEqual(["ascending", null, null, null]);
  });

  it("theAllRowStaysLastEitherWay", () => {
    render(<EndingsTab stats={statsOf(lengthGames())} />);
    // Average length, longest first: 1 h 15 min, 38 min, then the "—" below them, then All.
    press(LENGTHS, "Average length");
    expect(bodyRows(LENGTHS)).toEqual([LENGTH_ROWS[1], LENGTH_ROWS[0], LENGTH_ROWS[2], ALL_ROW]);
    expect(sortsOf(LENGTHS)).toEqual([null, null, "descending", null]);
    press(LENGTHS, "Average length");
    expect(firstCells(LENGTHS)).toEqual(["5", "8", "9", "All"]);
    expect(sortsOf(LENGTHS)).toEqual([null, null, "ascending", null]);
    // Average rounds, most first: 10.0, 7.5, "—", All.
    press(LENGTHS, "Average rounds");
    expect(firstCells(LENGTHS)).toEqual(["8", "5", "9", "All"]);
    // Games, most first: 2, 1, 0, All; then fewest first: 0, 1, 2, All.
    press(LENGTHS, "Games");
    expect(firstCells(LENGTHS)).toEqual(["5", "8", "9", "All"]);
    expect(sortsOf(LENGTHS)).toEqual([null, "descending", null, null]);
    press(LENGTHS, "Games");
    expect(bodyRows(LENGTHS)).toEqual([LENGTH_ROWS[2], LENGTH_ROWS[1], LENGTH_ROWS[0], ALL_ROW]);
    expect(sortsOf(LENGTHS)).toEqual([null, "ascending", null, null]);
    // Under every column, either way, All is the one last row, as it was.
    for (const head of ["Players", "Games", "Average length", "Average rounds"]) {
      for (let turn = 1; turn <= 2; turn += 1) {
        press(LENGTHS, head);
        const rows = bodyRows(LENGTHS);
        const at = `${head}, press ${turn}`;
        expect(rows, at).toHaveLength(4);
        expect(rows[3], at).toEqual(ALL_ROW);
        expect(rows.slice(0, 3).map((row) => row[0]).sort(), at).toEqual(["5", "8", "9"]);
      }
    }
  });

  it("averageRoundsThatShowAlikeTie", () => {
    // 5 players average 7.25 rounds and 6 players 7.33, both shown "7.3"; 7 players 9.0.
    const games = [
      ...[7, 7, 7, 8].map((rounds) => ended(5, "LIBERAL_POLICIES", { rounds })),
      ...[7, 7, 8].map((rounds) => ended(6, "FASCIST_POLICIES", { rounds })),
      ended(7, "HITLER_EXECUTED", { rounds: 9 }),
    ];
    render(<EndingsTab stats={statsOf(games)} />);
    expect(bodyRows(LENGTHS).map((row) => row[3])).toEqual(["7.3", "7.3", "9.0", "7.5"]);
    // Most first: 9.0, then the two "7.3"s, a tie in the table's own order, not 7.33 above 7.25.
    press(LENGTHS, "Average rounds");
    expect(firstCells(LENGTHS)).toEqual(["7", "5", "6", "All"]);
    press(LENGTHS, "Average rounds");
    expect(firstCells(LENGTHS)).toEqual(["5", "6", "7", "All"]);
  });

  it("aTableThatEmptiesOpensAgainInItsOwnOrder", () => {
    const games = lengthGames();
    const { rerender } = render(<EndingsTab stats={statsOf(games)} />);
    press(LENGTHS, "Average length");
    expect(firstCells(LENGTHS)).toEqual(["8", "5", "9", "All"]);
    press(RATES, "Players");
    expect(firstCells(RATES)).toEqual(["9", "8", "5"]);
    // A filter that counts no game empties both cards...
    rerender(<EndingsTab stats={statsOf([])} />);
    for (const title of ["Liberal win rate by player count", "Game length"]) {
      const card = screen.getByRole("region", { name: title });
      expect(card).toHaveTextContent(NO_GAMES);
      expect(card.querySelector("table")).toBeNull();
    }
    // ...and when the games come back each table opens in its own order, not the sort it had.
    rerender(<EndingsTab stats={statsOf(games)} />);
    expect(bodyRows(LENGTHS)).toEqual(LENGTH_ROWS);
    expect(sortsOf(LENGTHS)).toEqual(["ascending", null, null, null]);
    expect(firstCells(RATES)).toEqual(["5", "8", "9"]);
    expect(sortsOf(RATES)).toEqual(["ascending", null, null, null, null]);
  });

  it("shows the fastest win and the longest game with their seats", () => {
    const fast = ended(5, "FASCIST_POLICIES", { minutes: 22, rounds: 1 });
    const slow = ended(6, "LIBERAL_POLICIES", { minutes: 65, rounds: 12 });
    render(<EndingsTab stats={statsOf([slow, fast])} />);
    const fastest = screen.getByRole("region", { name: "Fastest win" });
    expect(fastest.querySelector(".endings-headline")).toHaveTextContent("22 min · 1 round");
    expect(fastest).toHaveTextContent("Fascists win · 6 Fascist policies");
    expect(fastest.querySelector(".endings-seats")).toHaveTextContent("P1, P2, P3, P4, P5");
    expect(fastest.querySelector(".endings-seats .stats-hitler")).toHaveTextContent("P5");
    expect(within(fastest).getByRole("link", { name: "See this game" })).toHaveAttribute("href", `/games/${fast.id}`);
    const longest = screen.getByRole("region", { name: "Longest game" });
    expect(longest.querySelector(".endings-headline")).toHaveTextContent("1 h 05 min · 12 rounds");
    expect(within(longest).getByRole("link", { name: "See this game" })).toHaveAttribute("href", `/games/${slow.id}`);
  });

  it("finds the most in one game, each linked", () => {
    const wild = ended(5, "LIBERAL_POLICIES", { events: [...chaosRun(1), ...failed(4, 1)] });
    render(<EndingsTab stats={statsOf([ended(5, "HITLER_ELECTED"), wild])} />);
    const items = within(screen.getByRole("region", { name: "Most in one game" })).getAllByRole("listitem");
    const when = formatLocalDateTime(wild.endedAt);
    expect(items.map((li) => li.textContent)).toEqual([
      `Chaos policies: 1 · ${when}`,
      `Failed elections: 4 · ${when}`,
      "Vetoes: none yet",
    ]);
    expect(within(items[0]).getByRole("link", { name: when })).toHaveAttribute("href", `/games/${wild.id}`);
  });

  it("lists the latest close finishes under the count of all", () => {
    const close = repeat(FINISHES_SHOWN + 2, () => ended(7, "HITLER_EXECUTED", { liberal: 3, fascist: 5 }));
    render(<EndingsTab stats={statsOf(close)} />);
    const region = screen.getByRole("region", { name: "Closest finishes" });
    expect(within(region).getByText("12 games")).toBeInTheDocument();
    const links = within(region).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      [...close].reverse().slice(0, FINISHES_SHOWN).map((g) => `/games/${g.id}`)
    );
    expect(links[0]).toHaveTextContent(`${formatLocalDateTime(close[close.length - 1].endedAt)} · Liberals win · Hitler executed · 3 L, 5 F`);
  });

  it("leaves games not recorded from their start out of length", () => {
    render(<EndingsTab stats={statsOf([ended(5, "LIBERAL_POLICIES", { complete: false })])} />);
    expect(screen.getAllByText(NOT_FROM_START)).toHaveLength(3);
    for (const title of ["Game length", "Fastest win", "Longest game"]) {
      expect(screen.getByRole("region", { name: title })).toHaveTextContent(NOT_FROM_START);
    }
    expect(screen.getByText("Chaos policies: none yet")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Closest finishes" })).toHaveTextContent("No close finishes yet.");
  });

  it("says so without counted games", () => {
    render(<EndingsTab stats={statsOf([])} />);
    for (const title of TITLES) expect(screen.getByRole("region", { name: title })).toHaveTextContent(NO_GAMES);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
