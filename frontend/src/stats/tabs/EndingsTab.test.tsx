import { render, screen, within } from "@testing-library/react";
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

/** The body rows of the region `label`'s table, each as its header's and cells' texts. */
function bodyRows(label: string): string[][] {
  const table = within(screen.getByRole("region", { name: label })).getByRole("table");
  return Array.from(table.querySelectorAll("tbody tr"), (row) => Array.from(row.querySelectorAll("th, td"), (c) => c.textContent ?? ""));
}

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
    render(
      <EndingsTab
        stats={statsOf([
          ...repeat(4, () => ended(6, "LIBERAL_POLICIES")),
          ...repeat(6, () => ended(6, "FASCIST_POLICIES")),
          ended(5, "LIBERAL_POLICIES"),
          ended(5, "HITLER_EXECUTED"),
          ended(5, "HITLER_ELECTED"),
        ])}
      />
    );
    const region = screen.getByRole("region", { name: "Liberal win rate by player count table" });
    expect(within(region).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Players",
      "Games",
      "Liberal wins",
      "Win rate",
      "Smoothed",
    ]);
    expect(bodyRows("Liberal win rate by player count table")).toEqual([
      ["5", "3", "2", "—", "54%"],
      ["6", "10", "4", "40%", "45%"],
    ]);
  });

  it("averages each size's length, then all of them", () => {
    render(
      <EndingsTab
        stats={statsOf([
          ended(5, "LIBERAL_POLICIES", { minutes: 30, rounds: 6 }),
          ended(5, "HITLER_ELECTED", { minutes: 45, rounds: 9 }),
          ended(8, "FASCIST_POLICIES", { minutes: 75, rounds: 10 }),
          ended(9, "HITLER_EXECUTED", { minutes: 20, rounds: 4, complete: false }),
        ])}
      />
    );
    expect(bodyRows("Game length table")).toEqual([
      ["5", "2", "38 min", "7.5"],
      ["8", "1", "1 h 15 min", "10.0"],
      ["9", "0", "—", "—"],
      ["All", "3", "50 min", "8.3"],
    ]);
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
