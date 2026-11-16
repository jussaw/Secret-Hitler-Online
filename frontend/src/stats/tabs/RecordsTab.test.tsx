import { fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { replayElo } from "../elo";
import type { GameRecord, Role, Side } from "../record";
import { NO_GAMES } from "../StatCard";
import { makeRecord, makeSeats } from "../testRecords";
import type { StatsContext } from "../useStats";
import { RecordsTab } from "./RecordsTab";

const NAMES = ["Bo", "Ann", "Cy", "Di", "Ed"];
const PLAYERS = NAMES.map((name, i) => ({ number: i + 1, name }));

/** A side's roles for `n` seats: Liberals, or the Fascist side with Hitler in its first seat. */
function rolesOf(side: Side, n: number): Role[] {
  return Array.from({ length: n }, (_, i): Role => (side === "LIBERAL" ? "LIBERAL" : i === 0 ? "HITLER" : "FASCIST"));
}

/**
 * A finished 30-minute game started at `start` and won by `side`: `winners` seated on it and
 * `losers` on the other side, then CPU seats up to five, on the winning side when `winners` is
 * empty and on the losing side otherwise.
 */
function played(id: string, start: string, winners: number[], losers: number[] = [], side: Side = "LIBERAL"): GameRecord {
  const other: Side = side === "LIBERAL" ? "FASCIST" : "LIBERAL";
  const cpus: null[] = Array(Math.max(0, 5 - winners.length - losers.length)).fill(null);
  const winning: (number | null)[] = winners.length === 0 ? cpus : winners;
  const losing: (number | null)[] = winners.length === 0 ? losers : [...losers, ...cpus];
  const startedAt = Date.parse(start);
  return makeRecord({
    id,
    startedAt,
    endedAt: startedAt + 30 * 60_000,
    outcome: side === "LIBERAL" ? "LIBERAL_POLICIES" : "FASCIST_POLICIES",
    winner: side,
    hasCpu: cpus.length > 0,
    seats: makeSeats([...rolesOf(side, winning.length), ...rolesOf(other, losing.length)], [...winning, ...losing]),
  });
}

const NOW = Date.parse("2026-11-20T12:00:00Z");

const MONTHS = [
  played("aug", "2026-08-10T20:00:00Z", [2]),
  played("o1", "2026-10-12T20:00:00Z", [3]),
  played("o2", "2026-10-13T20:00:00Z", [3]),
  played("o3", "2026-10-14T20:00:00Z", [1]),
  ...[2, 3, 4, 5].map((d) => played(`n${d}`, `2026-11-0${d}T20:00:00Z`, [1, 2])),
  played("n6", "2026-11-06T20:00:00Z", [3]),
];

const GAMES_A_TO_D = [
  played("a", "2026-11-01T20:00:00Z", [1, 2, 3], [4, 5]),
  played("b", "2026-11-02T20:00:00Z", [4, 5], [1, 2, 3], "FASCIST"),
  played("c", "2026-11-03T20:00:00Z", [1, 2, 3], [4, 5]),
  played("d", "2026-11-04T20:00:00Z", [1, 2, 3], [4, 5]),
];

/** The context for `games`, all of them counted (CPU games too), with Elo replayed over them. */
function stats(games: GameRecord[]): StatsContext {
  return {
    data: { players: PLAYERS, games },
    filter: { players: null, cpu: false },
    counted: games,
    elo: replayElo(games),
    names: new Map(PLAYERS.map((p) => [p.number, p.name])),
  };
}
const tab = (games: GameRecord[], now = NOW) => render(<RecordsTab stats={stats(games)} now={now} timeZone="UTC" />);
const card = (slug: string) => document.querySelector<HTMLElement>(`[data-card="${slug}"]`)!;
/** A card's table rows: the rank ("" for none), the period or month, each name, and the wins, in reading order. */
const rowsOf = (slug: string) =>
  Array.from(card(slug).querySelectorAll("table.ranked-table tbody tr")).map((row) => [
    row.querySelector(".ranked-rank")?.textContent ?? "",
    ...Array.from(row.querySelectorAll(".records-sub, .player-name")).map((e) => e.textContent ?? ""),
    row.querySelector(".ranked-value")?.textContent ?? "",
  ]);
/** Text as it reads, every run of whitespace (a no-break space too) one space. */
const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

const SLUGS = [
  "longest-win-streak",
  "longest-losing-streak",
  "current-streaks",
  "most-wins-week",
  "most-wins-month",
  "player-of-the-month",
  "players-of-the-month",
  "most-games-session",
  "rating-records",
];

afterEach(() => window.history.replaceState(null, "", "/"));

describe("RecordsTab", () => {
  it("playerOfTheMonthListsEveryTiedPlayer", () => {
    tab(MONTHS);
    expect(Array.from(document.querySelectorAll(".records-cell")).map((c) => c.getAttribute("data-card"))).toEqual(SLUGS);
    // Bo and Ann both won 4 in 5 counted games: by name
    expect(
      within(card("player-of-the-month"))
        .getAllByText(/^(Ann|Bo)$/)
        .map((e) => e.textContent)
    ).toEqual(["Ann", "Bo"]);
    expect(within(card("player-of-the-month")).getByText("4 wins")).toBeInTheDocument();
    expect(card("player-of-the-month")).toHaveTextContent("The most counted wins this month (November 2026); ties all shown.");
  });

  it("theUpsetLinksToItsGame", () => {
    tab(GAMES_A_TO_D);
    const links = within(card("rating-records")).getAllByRole("link", { name: "See the game" });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toMatch(/^\/stats\/games\/[abcd]$/);
    fireEvent.click(links[0]);
    expect(window.location.pathname).toBe(links[0].getAttribute("href"));
  });

  it("currentStreaksReadAsWinsAndLosses", () => {
    tab(GAMES_A_TO_D);
    const streaks = within(card("current-streaks"));
    expect(streaks.getAllByText("2 wins")).toHaveLength(3);
    expect(streaks.getAllByText("2 losses")).toHaveLength(2);
  });

  it("noGamesEmptiesEveryCard", () => {
    tab([]);
    for (const slug of SLUGS) expect(card(slug), slug).toHaveTextContent(NO_GAMES);
  });

  it("theStreaksNameTheirHoldersAndDays", () => {
    tab(GAMES_A_TO_D);
    // Bo, Ann and Cy won c and d together, and Di and Ed lost them: every teammate holds the record.
    expect(card("longest-win-streak")).toHaveTextContent("Ann, Bo, Cy · 2 wins · Tue 3 Nov 2026 to Wed 4 Nov 2026");
    expect(card("longest-losing-streak")).toHaveTextContent("Di, Ed · 2 losses · Tue 3 Nov 2026 to Wed 4 Nov 2026");
  });

  it("theBestPeriodsAndTheHistory", () => {
    tab(MONTHS);
    // Ann and Bo tie on 4 wins in a week and a month (and 5 games each): by name; Cy's best is October's.
    expect(rowsOf("most-wins-week")).toEqual([
      ["1.", "Ann", "Week of 2 Nov 2026", "4 wins"],
      ["1.", "Bo", "Week of 2 Nov 2026", "4 wins"],
      ["3.", "Cy", "Week of 12 Oct 2026", "2 wins"],
    ]);
    expect(rowsOf("most-wins-month")).toEqual([
      ["1.", "Ann", "November 2026", "4 wins"],
      ["1.", "Bo", "November 2026", "4 wins"],
      ["3.", "Cy", "October 2026", "2 wins"],
    ]);
    expect(rowsOf("players-of-the-month")).toEqual([
      ["", "October 2026", "Cy", "2 wins"],
      ["", "August 2026", "Ann", "1 win"],
    ]);
  });

  it("aTiedMonthListsEachHolder", () => {
    tab(MONTHS, Date.parse("2026-12-02T12:00:00Z"));
    expect(rowsOf("players-of-the-month")[0]).toEqual(["", "November 2026", "Ann", "Bo", "4 wins"]);
  });

  it("aMonthWithNoWinsYetSaysSo", () => {
    tab(MONTHS, Date.parse("2026-12-02T12:00:00Z"));
    expect(card("player-of-the-month")).toHaveTextContent("No wins yet this month.");
    expect(card("players-of-the-month").querySelector("tbody tr")).toHaveTextContent("November 2026");
  });

  it("theLongestSessions", () => {
    tab([...GAMES_A_TO_D, played("e", "2026-11-04T20:40:00Z", [4, 5], [1, 2, 3], "FASCIST")]);
    const lines = Array.from(card("most-games-session").querySelectorAll("li")).map((li) => plain(li.textContent));
    expect(lines).toEqual([
      "2 games · Wed 4 Nov 2026 · 1 h 10 min",
      "1 game · Tue 3 Nov 2026 · 30 min",
      "1 game · Mon 2 Nov 2026 · 30 min",
      "1 game · Sun 1 Nov 2026 · 30 min",
    ]);
  });

  it("theRatingRecords", () => {
    tab(GAMES_A_TO_D);
    const ratings = card("rating-records");
    expect(ratings.querySelector(".records-peak")).toHaveTextContent(/^Highest peak: Ann, Bo, Cy · \d{4}$/);
    // b: the Fascists won against the odds; Di and Ed gained what Bo, Ann and Cy lost.
    expect(ratings.querySelector(".records-upset")).toHaveTextContent(
      /^Biggest upset: Fascists won with a \d+% chance · Di, Ed \+(\d+) · Ann, Bo, Cy −\1$/
    );
    expect(within(ratings).getByRole("link", { name: "See the game" })).toHaveAttribute("href", "/stats/games/b");
  });

  it("aSideWithNoPeopleIsLeftOut", () => {
    // The CPU seats lost b: only the winners' side is named.
    tab([played("a", "2026-11-01T20:00:00Z", [1, 2, 3], [4, 5]), played("b", "2026-11-02T20:00:00Z", [4, 5], [], "FASCIST")]);
    expect(card("rating-records").querySelector(".records-upset")).toHaveTextContent(/chance · Di, Ed \+\d+$/);
  });
});
