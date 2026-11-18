import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER } from "../counting";
import { ev } from "../game/sampleGames";
import type { GameEvent, GameRecord } from "../record";
import { NO_GAMES } from "../StatCard";
import { makeRecord, makeSeats } from "../testRecords";
import { dashesBeforeFigures } from "../testSplitTables";
import { buildStats, type StatsContext } from "../useStats";
import { ActivityTab } from "./ActivityTab";

const NAMES = ["Ann", "Bo", "Cy", "Di", "Ed", "Flo"];
const PLAYERS = NAMES.map((name, i) => ({ number: i + 1, name }));

/** A finished five-seat game held by `players` from `start`, `minutes` long, with `events`. */
function game(id: string, start: string, minutes: number, players: number[], events: GameEvent[] = []): GameRecord {
  const startedAt = Date.parse(start);
  return makeRecord({
    id,
    startedAt,
    endedAt: startedAt + minutes * 60_000,
    seats: makeSeats(["LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "HITLER"], players),
    events,
  });
}

const NOVEMBER = [
  game("g1", "2026-11-02T19:00:00Z", 40, [1, 2, 3, 4, 5]),
  game("g2", "2026-11-02T20:00:00Z", 40, [1, 2, 3, 4, 5]),
  game("g3", "2026-11-02T22:30:00Z", 30, [1, 2, 3, 4, 6]),
  game("g4", "2026-11-07T18:00:00Z", 45, [1, 2, 3, 5, 6]),
  game("g5", "2026-11-14T21:00:00Z", 60, [2, 3, 4, 5, 6]),
  game("g6", "2026-11-14T23:30:00Z", 60, [1, 2, 3, 4, 5]),
];
const NOW = Date.parse("2026-11-20T12:00:00Z");

/**
 * Four terms in a row, term `k` with seat `k` presiding over the next seat: the nomination 4 s
 * after the last term's end, each seat's Ja vote `seat + 1` s after it, the discard 3 s after the
 * last vote, the policy 2 s later and END TERM 6 s after that. The fourth term's countdown is
 * paused, seat 4's connection drops, and the countdown ends it.
 */
function night(): GameEvent[] {
  const events: GameEvent[] = [];
  let at = 0;
  for (let k = 0; k < 4; k++) {
    const r = k + 1;
    const nominated = at + 4000;
    events.push(ev.nominate(r, nominated, k, k + 1));
    for (let seat = 0; seat < 5; seat++) events.push(ev.vote(r, nominated + (seat + 1) * 1000, seat, true));
    const voted = nominated + 5000;
    events.push(ev.election(r, voted, true, 5, 0), ev.draw(r, voted, k, "LLF"));
    events.push(ev.discard(r, voted + 3000, k, 2, "F"), ev.enact(r, voted + 5000, "L", "chancellor", k + 1, r, 0));
    if (k === 3) events.push(ev.timerPause(r, voted + 6000, k), ev.disconnect(r, voted + 7000, 4), ev.timerResume(r, voted + 8000, k));
    at = voted + 11000;
    events.push(ev.endTerm(r, at, k, k === 3 ? "countdown" : "president"));
  }
  return events;
}
const NIGHTS = Array.from({ length: 8 }, (_, i) => game(`n${i + 1}`, `2026-11-0${i + 1}T20:00:00Z`, 30, [1, 2, 3, 4, 5], night()));

/** One election and nothing after it: seat 0 nominates 4 s in, and each seat votes Ja `seat + 1` s
 *  after the nomination, as in a night. */
function oneElection(): GameEvent[] {
  const events: GameEvent[] = [ev.nominate(1, 4000, 0, 1)];
  for (let seat = 0; seat < 5; seat++) events.push(ev.vote(1, 5000 + seat * 1000, seat, true));
  events.push(ev.election(1, 9000, true, 5, 0));
  return events;
}

const stats = (games: GameRecord[]): StatsContext => buildStats({ players: PLAYERS, games }, DEFAULT_FILTER);
const tab = (games: GameRecord[]) => render(<ActivityTab stats={stats(games)} now={NOW} timeZone="UTC" />);
const card = (slug: string) => document.querySelector<HTMLElement>(`[data-card="${slug}"]`)!;
/** An element's text but for a ranked card's count line under the name, which only the stacked
 *  query shows. */
function shown(el: Element): string | null {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".ranked-count-under").forEach((line) => line.remove());
  return copy.textContent;
}
/** A ranked card's lines under the names ("6 games"), in row order. */
const underLines = (slug: string) => Array.from(card(slug).querySelectorAll(".ranked-count-under"), (line) => line.textContent);

const SLUGS = [
  "games-over-time",
  "cumulative-games",
  "attendance",
  "participation",
  "calendar",
  "day-of-week",
  "hour-of-day",
  "busiest-times",
  "sessions",
  "gaps",
  "decision-times",
  "fastest-voter",
  "slowest-president",
  "countdown",
  "dropped-connections",
];
const WIDE = ["games-over-time", "cumulative-games", "attendance", "calendar", "hour-of-day", "decision-times"];

describe("ActivityTab", () => {
  it("showsEveryCardInOrder", () => {
    tab(NOVEMBER);
    expect(Array.from(document.querySelectorAll(".activity-cell")).map((c) => c.getAttribute("data-card"))).toEqual(SLUGS);
    expect(Array.from(document.querySelectorAll(".activity-wide")).map((c) => c.getAttribute("data-card"))).toEqual(WIDE);
    expect(Array.from(document.querySelectorAll("h2.activity-heading")).map((h) => h.textContent)).toEqual([
      "Games",
      "When",
      "Sessions and gaps",
      "Timing",
    ]);
    expect(within(card("busiest-times")).getByText("Busiest day: Mon 2 Nov 2026 · 3 games")).toBeInTheDocument();
    expect(within(card("busiest-times")).getByText("Busiest week: Week of 2 Nov 2026 · 4 games")).toBeInTheDocument();
    expect(within(card("busiest-times")).getByText("Busiest month: November 2026 · 6 games")).toBeInTheDocument();
    expect(within(card("gaps")).getByText("Days since the last game: 5")).toBeInTheDocument();
    expect(
      within(card("gaps")).getByText("Longest gap between sessions: 7 days, Sat 7 Nov 2026 to Sat 14 Nov 2026")
    ).toBeInTheDocument();
    expect(within(card("sessions")).getByText("3 sessions · 2.0 games per session")).toBeInTheDocument();
    expect(within(card("sessions")).getByText("Most in one: 3 games, Mon 2 Nov 2026")).toBeInTheDocument();
  });

  it("theChartsShowTheCounts", () => {
    tab(NOVEMBER);
    expect(screen.getByRole("img", { name: "Games per week" })).toHaveAccessibleDescription(
      "Week of 2 Nov 2026 4, Week of 9 Nov 2026 2"
    );
    expect(screen.getByRole("img", { name: "Cumulative games per week" })).toHaveAccessibleDescription(
      "Week of 2 Nov 2026 4, Week of 9 Nov 2026 6"
    );
    expect(screen.getByRole("img", { name: "Attendance per week" })).toHaveAccessibleDescription(
      "2 Nov: Ann 4, Bo 4, Cy 4, Di 3, Ed 3, Flo 2. 9 Nov: Ann 1, Bo 2, Cy 2, Di 2, Ed 2, Flo 1."
    );
    expect(screen.getByRole("img", { name: "Games by day of the week" })).toHaveAccessibleDescription(
      "Monday 3, Tuesday 0, Wednesday 0, Thursday 0, Friday 0, Saturday 3, Sunday 0"
    );
    const hours = screen.getByRole("img", { name: "Games by hour of the day" });
    expect(hours.getAttribute("aria-describedby")).toBeTruthy();
    expect(hours).toHaveAccessibleDescription(/^00:00 to 01:00 0, .*, 21:00 to 22:00 1, 22:00 to 23:00 1, 23:00 to 00:00 1$/);
    expect(screen.getByRole("img", { name: "Games per day, Last 12 months" })).toHaveAccessibleDescription(
      "6 games on 3 days; busiest Mon 2 Nov 2026 with 3 games."
    );
  });

  it("participationRanksEachPlayersShare", () => {
    tab(NOVEMBER);
    const rows = Array.from(card("participation").querySelectorAll("tbody tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map(shown)
    );
    expect(rows[0]).toEqual(["1.", "Bo", "100%", "6"]);
    expect(rows[rows.length - 1]).toEqual(["6.", "Flo", "50%", "3"]);
    const lines = underLines("participation");
    expect([lines[0], lines[lines.length - 1]]).toEqual(["6 games", "3 games"]);
  });

  it("theSwitchRedrawsGamesCumulativeAndAttendance", () => {
    tab(NOVEMBER);
    expect(screen.getByRole("button", { name: "PER WEEK" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "PER MONTH" })).toHaveAttribute("aria-pressed", "false");
    expect(within(card("attendance")).getByText("Each player's counted games each week.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PER MONTH" }));
    expect(screen.getByRole("button", { name: "PER MONTH" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Games per month" })).toHaveAccessibleDescription("November 2026 6");
    expect(screen.getByRole("img", { name: "Cumulative games per month" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Attendance per month" })).toBeInTheDocument();
    expect(within(card("attendance")).getByText("Each player's counted games each month.")).toBeInTheDocument();
  });

  it("theCalendarOffersLast12MonthsAndEachYear", () => {
    tab(NOVEMBER);
    const views = within(card("calendar")).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")]);
    expect(views).toEqual([
      ["LAST 12 MONTHS", "true"],
      ["2026", "false"],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    expect(screen.getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Games per day, 2026" })).toHaveAccessibleDescription(
      "6 games on 3 days; busiest Mon 2 Nov 2026 with 3 games."
    );
  });

  it("aYearNoLongerShownFallsBackToTheFirstView", () => {
    const { rerender } = tab([...NOVEMBER, game("old", "2025-03-01T20:00:00Z", 30, [1, 2, 3, 4, 5])]);
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    rerender(<ActivityTab stats={stats(NOVEMBER)} now={NOW} timeZone="UTC" />);
    expect(screen.getByRole("button", { name: "LAST 12 MONTHS" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "Games per day, Last 12 months" })).toBeInTheDocument();
  });

  it("noGamesEmptiesEveryCard", () => {
    tab([]);
    for (const slug of SLUGS) expect(within(card(slug)).getByText(NO_GAMES)).toBeInTheDocument();
    expect(document.querySelector(".activity-tab svg")).toBeNull();
    expect(document.querySelector(".activity-tab button")).toBeNull();
  });

  it("gamesWithNoTimesSayWhy", () => {
    tab(NOVEMBER);
    expect(within(card("decision-times")).getByText("No timed decisions in these games.")).toBeInTheDocument();
    expect(within(card("fastest-voter")).getByText("No one has 30 timed votes over 8 games yet.")).toBeInTheDocument();
    expect(within(card("slowest-president")).getByText("No president has 5 timed choices yet.")).toBeInTheDocument();
    expect(within(card("countdown")).getByText("No terms ended in these games.")).toBeInTheDocument();
    expect(within(card("dropped-connections")).getByText("No dropped connections in these games.")).toBeInTheDocument();
    expect(within(card("gaps")).queryByText("Only one session so far.")).toBeNull();
  });

  it("oneSessionHasNoGap", () => {
    tab(NOVEMBER.slice(0, 2));
    expect(within(card("gaps")).getByText("Only one session so far.")).toBeInTheDocument();
  });

  it("belowTheMinimumShowsADash", () => {
    tab([game("one", "2026-11-02T19:00:00Z", 30, [1, 2, 3, 4, 5], oneElection())]);
    expect(within(card("fastest-voter")).getByText("No one has 30 timed votes over 8 games yet.")).toBeInTheDocument();
    const table = within(card("decision-times")).getByRole("region", { name: "Decision times table" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Player",
      "Nominate",
      "Vote",
      "Discard",
      "Chancellor",
      "Power",
      "End term",
    ]);
    const ann = within(table).getByRole("row", { name: /Ann/ });
    expect(within(ann).getAllByRole("cell").map((td) => td.textContent)).toEqual(["—1", "—1", "—0", "—0", "—0", "—0"]);
  });

  it("theTimingCardsNameTheirPlayers", () => {
    tab(NIGHTS);
    const table = within(card("decision-times")).getByRole("region", { name: "Decision times table" });
    const ann = within(table).getByRole("row", { name: /Ann/ });
    expect(within(ann).getAllByRole("cell").map((td) => td.textContent)).toEqual([
      "4.0 s8",
      "1.0 s32",
      "3.0 s8",
      "—0",
      "—0",
      "6.0 s8",
    ]);
    expect(card("fastest-voter")).toHaveTextContent("Ann · 1.0 s a vote, over 32 timed votes");
    expect(card("slowest-president")).toHaveTextContent("Ann, Bo and Cy · 4.3 s a choice");
    expect(within(card("countdown")).getByText("Ended by the countdown: 25% (8 of 32 terms)")).toBeInTheDocument();
    expect(within(card("countdown")).getByText("Pauses: 8")).toBeInTheDocument();
    const presidents = Array.from(card("countdown").querySelectorAll("tbody tr")).map(shown);
    expect(presidents[0]).toBe("1.Di100%8");
    expect(underLines("countdown")[0]).toBe("8 terms");
    const drops = Array.from(card("dropped-connections").querySelectorAll("tbody tr")).map(shown);
    expect(drops).toEqual(["1.Ed8 times8"]);
    expect(underLines("dropped-connections")).toEqual(["8 games"]);
  });

  it("aCountdownShareBelowTheMinimumIsADash", () => {
    tab(NIGHTS.slice(0, 1));
    expect(within(card("countdown")).getByText("Ended by the countdown: — (1 of 4 terms)")).toBeInTheDocument();
  });

  it("decisionTimesSortByTheShownTime", () => {
    // Over the nights Ann votes in 1.0 s, Bo 2.0 s, … Ed 5.0 s; Flo votes once, so hers is "—".
    tab([...NIGHTS, game("flo", "2026-11-09T20:00:00Z", 30, [6, 2, 3, 4, 5], oneElection())]);
    const table = within(card("decision-times")).getByRole("region", { name: "Decision times table" });
    const votes = () =>
      Array.from(table.querySelectorAll("tbody tr"), (tr) => [
        tr.querySelector("th")?.textContent,
        tr.querySelectorAll("td")[1].querySelector(".split-text")?.textContent,
      ]);
    fireEvent.click(within(table).getByRole("button", { name: "Vote" }));
    expect(within(table).getByRole("columnheader", { name: "Vote" })).toHaveAttribute("aria-sort", "descending");
    expect(votes()).toEqual([
      ["Ed", "5.0 s"],
      ["Di", "4.0 s"],
      ["Cy", "3.0 s"],
      ["Bo", "2.0 s"],
      ["Ann", "1.0 s"],
      ["Flo", "—"],
    ]);
    fireEvent.click(within(table).getByRole("button", { name: "Vote" }));
    expect(within(table).getByRole("columnheader", { name: "Vote" })).toHaveAttribute("aria-sort", "ascending");
    expect(votes()).toEqual([
      ["Ann", "1.0 s"],
      ["Bo", "2.0 s"],
      ["Cy", "3.0 s"],
      ["Di", "4.0 s"],
      ["Ed", "5.0 s"],
      ["Flo", "—"],
    ]);
  });

  it("everyDashSortsLast", () => {
    // Review Focus 1: Ed never presides, so his Nominate, Discard and End term are "—" beside times.
    const { container } = tab([game("one", "2026-11-02T19:00:00Z", 30, [1, 2, 3, 4, 5], oneElection()), ...NIGHTS]);
    const { checked, misplaced } = dashesBeforeFigures(container);
    expect(misplaced).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });

  it("namesInSentencesAreNotLinks", () => {
    tab(NIGHTS);
    for (const slug of ["fastest-voter", "slowest-president"]) {
      expect(card(slug).querySelector("a")).toBeNull();
      expect(card(slug).querySelector(".player-name")).not.toBeNull();
    }
  });
});
