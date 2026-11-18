import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GameRecord, Player } from "../record";
import { NO_GAMES } from "../StatCard";
import { dashesBeforeFigures } from "../testSplitTables";
import { buildStats } from "../useStats";
import { ALL, execute, FIVE, gameOf, investigate, range, term } from "../votesTestRounds";
import { VotesTab } from "./VotesTab";

const PLAYERS: Player[] = ["Ann", "Bo", "Cy", "Di", "Ed"].map((name, i) => ({ number: i + 1, name }));

/** The tab over `games`, every player on and CPU games counted. */
function show(games: GameRecord[], players: Player[] = PLAYERS) {
  return render(<VotesTab stats={buildStats({ players, games }, { players: null, cpu: true })} />);
}

const card = (title: string) => screen.getByRole("region", { name: title });

/** JA RATE's games: Ann, a Liberal, votes Ja in 3 of 5 elections, then Ja once as Hitler. */
function jaRateGames(): GameRecord[] {
  const five = gameOf(FIVE, range(0, 5).map((i) => term(i + 1, 1, 2, i < 3 ? ALL : [1, 2, 3, 4], i < 3 ? [] : [0])));
  const once = gameOf(["HITLER", "LIBERAL", "LIBERAL", "FASCIST", "LIBERAL"], [term(1, 1, 2, ALL, [])]);
  return [five, once];
}

const TITLES = [
  "NOMINATED AS CHANCELLOR", "NOMINATIONS PASSED", "ELECTED AS CHANCELLOR", "PICKING A TEAMMATE", "JA RATE",
  "LIBERAL VOTE ACCURACY", "FASCIST LOYALTY", "VOTED HITLER IN", "SWING VOTES", "LONE DISSENT", "FAILED ELECTIONS",
  "CHAOS", "INVESTIGATIONS", "LIBERAL FINDS", "CHECKING A TEAMMATE", "TIMES INVESTIGATED", "PEEKS", "EXECUTIONS",
  "EXECUTION TARGETS", "HITLER EXECUTED", "TIMES EXECUTED", "FIRST TO GO", "SPECIAL ELECTIONS",
  "SPECIAL ELECTION PICKS", "VETOES AS PRESIDENT", "SURVIVAL",
];

describe("VotesTab", () => {
  it("shows the 26 cards in order under their two headings", () => {
    const { container } = show([]);
    expect(Array.from(container.querySelectorAll(".votes-section > h2"), (h) => h.textContent)).toEqual(["ELECTIONS AND VOTES", "POWERS AND SURVIVAL"]);
    expect(Array.from(container.querySelectorAll(".votes-card h3"), (h) => h.textContent)).toEqual(TITLES);
  });

  it("says so on every card when no game counts", () => {
    const { container } = show([]);
    for (const title of TITLES) expect(card(title).textContent).toContain(NO_GAMES);
    expect(container.querySelectorAll(".votes-card")).toHaveLength(26);
  });

  it("gives a card nobody had a chance in its own line, and never NaN", () => {
    const { container } = show([gameOf(FIVE, [term(1, 0, 1, ALL, [])])]);
    expect(card("VETOES AS PRESIDENT").textContent).toContain("No vetoes yet with these players.");
    expect(card("HITLER EXECUTED").textContent).toContain("No one has executed Hitler yet with these players.");
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/);
    expect(container.textContent).not.toContain(NO_GAMES);
  });

  it("ranks a count card higher first, ties by name", () => {
    show([gameOf(FIVE, [term(1, 0, 1, [0, 1, 2], [3, 4]), term(2, 0, 1, [1, 3, 4], [0, 2])])]); // Bo 2, the rest 1
    const text = card("SWING VOTES").textContent!;
    const at = ["Bo", "Ann", "Cy", "Di", "Ed"].map((name) => text.indexOf(name));
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("ranks a tie in a count card by more games first", () => {
    const failed = (players: number[]) => gameOf(FIVE, [term(1, 0, 3, [3], [0, 1, 2, 4])], { players });
    show([failed([1, 2, 3, 4, 5]), failed([2, 3, 4, 5, 6])], [...PLAYERS, { number: 6, name: "Fy" }]); // Ann 1 of 1 game, Bo 1 of 2
    const text = card("FAILED ELECTIONS").textContent!;
    expect(text.indexOf("Bo")).toBeLessThan(text.indexOf("Ann"));
  });

  it("shows a split cell's value with its count, and — below the minimum", () => {
    show(jaRateGames());
    const table = within(card("JA RATE")).getByRole("region", { name: "JA RATE table" }); // SplitTable's ScrollRegion
    const row = within(table).getAllByRole("row").find((tr) => within(tr).queryByText("Ann"))!;
    expect(within(row).getAllByRole("cell").slice(-3).map((td) => td.textContent)) // Liberal, Fascist, Hitler
      .toEqual([expect.stringMatching(/^60%\s*5$/), expect.stringMatching(/^—\s*0$/), expect.stringMatching(/^—\s*1$/)]);
  });

  it("says under each name what each rate card's count counts, as it did before #109", () => {
    // Ann (Liberal) investigates once and Di (Fascist) twice, and Bo calls two special elections.
    show([gameOf(FIVE, [
      term(1, 0, 1, ALL, [], investigate(0, 3, "FASCIST")),
      term(2, 3, 0, ALL, [], investigate(3, 4, "FASCIST")),
      term(3, 3, 0, ALL, [], investigate(3, 1, "LIBERAL")),
      term(4, 1, 0, ALL, [], { power: { type: "specialElection", seat: 1, target: 2 } }),
      term(5, 1, 0, ALL, [], { power: { type: "specialElection", seat: 1, target: 3 } }),
    ])]);
    const lines = (title: string) =>
      Array.from(card(title).querySelectorAll("tbody tr"), (tr) => [
        tr.querySelector(".player-name")?.textContent,
        tr.querySelector(".ranked-count-under")?.textContent,
      ]);
    expect(lines("LIBERAL FINDS")).toEqual([["Ann", "1 investigation"]]);
    expect(lines("CHECKING A TEAMMATE")).toEqual([["Di", "2 investigations"]]);
    expect(lines("SPECIAL ELECTION PICKS")).toEqual([["Bo", "2 special elections"]]);
    // The other rate cards' counts keep their heads' nouns.
    expect(lines("NOMINATIONS PASSED").map(([, line]) => line)).toContain("2 nominations");
    expect(lines("ELECTED AS CHANCELLOR").map(([, line]) => line)).toContain("4 elections");
    expect(lines("LIBERAL VOTE ACCURACY").map(([, line]) => line)).toContain("5 votes");
  });

  it("says whom each player investigated, Bots last", () => {
    show([gameOf(FIVE, [term(1, 0, 1, ALL, [], investigate(0, 3, "FASCIST")), term(2, 0, 1, ALL, [], investigate(0, 4, "FASCIST")),
      term(3, 0, 2, ALL, [], investigate(0, 1, "LIBERAL")), term(4, 0, 2, ALL, [], investigate(0, 3, "FASCIST"))],
      { players: [1, 2, 3, 4, null] })]);
    expect(within(card("INVESTIGATIONS")).getByText("4 (3 F, 1 L) · Di 2, Bo 1, Bots ×1")).toBeInTheDocument();
  });

  it("says none of these players was investigated or executed when only CPU seats were", () => {
    show([gameOf(FIVE, [term(1, 0, 1, ALL, [], investigate(0, 4, "FASCIST")), term(2, 0, 1, ALL, [], execute(0, 4, "HITLER"))],
      { players: [1, 2, 3, 4, null], outcome: "HITLER_EXECUTED" })]);
    expect(within(card("INVESTIGATIONS")).getByText("1 (1 F, 0 L) · Bots ×1")).toBeInTheDocument();
    expect(card("TIMES INVESTIGATED").textContent).toContain("None of these players has been investigated yet.");
    expect(within(card("EXECUTIONS")).getByText("Ann")).toBeInTheDocument();
    for (const title of ["TIMES EXECUTED", "FIRST TO GO"]) {
      expect(card(title).textContent).toContain("None of these players has been executed yet.");
    }
  });

  it("says none of these players investigated or executed anyone when only CPU seats did", () => {
    show([gameOf(FIVE, [term(1, 4, 1, ALL, [], investigate(4, 0, "LIBERAL")), term(2, 4, 1, ALL, [], execute(4, 0, "LIBERAL"))],
      { players: [1, 2, 3, 4, null], outcome: "FASCIST_POLICIES" })]);
    expect(card("INVESTIGATIONS").textContent).toContain("None of these players has investigated anyone yet.");
    expect(within(card("TIMES INVESTIGATED")).getByText("Ann")).toBeInTheDocument();
    for (const title of ["EXECUTIONS", "EXECUTION TARGETS"]) {
      expect(card(title).textContent).toContain("None of these players has executed anyone yet.");
    }
    expect(within(card("TIMES EXECUTED")).getByText("Ann")).toBeInTheDocument();
  });

  it("shows a renamed player once, under their current name", () => {
    const seated = (first: string) => gameOf(FIVE, [term(1, 1, 0, ALL, [])], { names: [first, "Bo", "Cy", "Di", "Ed"] });
    const { container } = show([seated("Rowan"), seated("Ash")], [{ number: 1, name: "Ash" }, ...PLAYERS.slice(1)]);
    expect(container.textContent).not.toContain("Rowan");
    expect(within(card("NOMINATED AS CHANCELLOR")).getAllByText("Ash")).toHaveLength(1);
  });

  it("vetoesSortByTheAccepted", () => {
    // Review Focus 2: "1 of 4" leads with its accepted vetoes, so it sorts by its 1, never its 4.
    // Ann (a Liberal) accepts 1 of her chancellors' 4 vetoes, and Bo (a Liberal) both of his 2.
    show([
      gameOf(FIVE, [
        term(1, 0, 1, ALL, [], { veto: true }),
        term(2, 0, 1, ALL, [], { veto: false }),
        term(3, 0, 1, ALL, [], { veto: false }),
        term(4, 0, 1, ALL, [], { veto: false }),
        term(5, 1, 2, ALL, [], { veto: true }),
        term(6, 1, 2, ALL, [], { veto: true }),
      ]),
    ]);
    const table = within(card("VETOES AS PRESIDENT")).getByRole("region", { name: "VETOES AS PRESIDENT table" });
    const liberal = () =>
      Array.from(table.querySelectorAll("tbody tr"), (tr) => [tr.querySelector("th")?.textContent, tr.querySelector("td")?.textContent]);
    expect(liberal()).toEqual([
      ["Ann", "1 of 4"],
      ["Bo", "2 of 2"],
    ]);
    fireEvent.click(within(table).getByRole("button", { name: "Liberal" }));
    expect(within(table).getByRole("columnheader", { name: "Liberal" })).toHaveAttribute("aria-sort", "descending");
    expect(liberal()).toEqual([
      ["Bo", "2 of 2"],
      ["Ann", "1 of 4"],
    ]);
  });

  it("everyDashSortsLast", () => {
    // Review Focus 1: on JA RATE's games, every split card's "—" stays below its figures.
    const { container } = show(jaRateGames());
    const { checked, misplaced } = dashesBeforeFigures(container);
    expect(misplaced).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });
});
