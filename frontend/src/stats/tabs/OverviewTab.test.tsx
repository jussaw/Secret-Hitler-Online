import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTER, type StatsFilter } from "../counting";
import type { PlayerNameProps } from "../PlayerName";
import type { StatsData } from "../record";
import { NO_GAMES } from "../StatCard";
import { overviewFixture } from "../testOverview";
import { buildStats } from "../useStats";
import { OverviewTab } from "./OverviewTab";

// PlayerName as it is, plus what it was given for `link`, so a test can tell a name that may
// become a link (Phase 22) from one inside a dashboard value.
vi.mock("../PlayerName", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../PlayerName")>();
  const Recorded = (props: PlayerNameProps) => (
    <span data-link={props.link === undefined ? "unset" : String(props.link)}>{actual.PlayerName(props)}</span>
  );
  return { ...actual, PlayerName: Recorded, default: Recorded };
});

const fixture = overviewFixture();

function tab(data: StatsData = fixture.data, filter: StatsFilter = DEFAULT_FILTER) {
  return render(<OverviewTab stats={buildStats(data, filter)} now={fixture.now} timeZone="UTC" />);
}

const card = (name: string) => screen.getByRole("region", { name });
/** A cell's text but for a ranked card's count line under the name, which only the stacked query
 *  shows. */
function shown(cell: Element): string {
  const copy = cell.cloneNode(true) as Element;
  copy.querySelectorAll(".ranked-count-under").forEach((line) => line.remove());
  return copy.textContent ?? "";
}
/** A card's table body rows (the head row left out), each as its cells' text. */
const rows = (name: string) =>
  Array.from(card(name).querySelectorAll("tbody tr")).map((row) => Array.from(row.querySelectorAll("td, th")).map(shown));
/** A ranked card's lines under the names ("5 games"), in row order. */
const underLines = (name: string) => Array.from(card(name).querySelectorAll(".ranked-count-under"), (line) => line.textContent);
/** The names a card shows, in order. */
const names = (el: HTMLElement) => Array.from(el.querySelectorAll(".player-name")).map((n) => n.textContent);

describe("OverviewTab", () => {
  it("theDashboard", () => {
    tab();
    const glance = screen.getByRole("region", { name: "At a glance" });
    expect(within(glance).getAllByRole("region").map((r) => r.querySelector("h3")?.textContent)).toEqual([
      "Since last game",
      "Last game",
      "Win streak",
      "Hot hand",
      "Player of the month",
    ]);
    expect(card("Since last game")).toHaveTextContent("2 days");
    const last = within(card("Last game")).getByRole("link");
    expect(last).toHaveAttribute("href", "/games/g07");
    expect(last.textContent).toMatch(/^Liberals win · 5 Liberal policies/);
    expect(last).toHaveTextContent("Fri 13 Nov 2026, 8:30 PM");
    expect(within(last).getByText("Liberals")).toHaveClass("stats-liberal");
    expect(card("Win streak")).toHaveTextContent("Ann · 4 wins");
    expect(card("Hot hand")).toHaveTextContent("Ann · 4 of 5");
    expect(card("Player of the month")).toHaveTextContent("Ann · 4 wins");
    // The definitions.
    expect(card("Since last game")).toHaveTextContent("Whole days since the last counted game ended.");
    expect(card("Last game")).toHaveTextContent("The most recent counted game.");
    expect(card("Win streak")).toHaveTextContent("The longest current run of wins, among players seen in the last 7 days.");
    expect(card("Hot hand")).toHaveTextContent("Won at least 3 of their last 5 games, and played in the last 7 days.");
    expect(card("Player of the month")).toHaveTextContent("Most wins this month.");
  });

  it("dashboardNamesAreNotLinks", () => {
    // Two leaders, so the names are joined.
    const data: StatsData = {
      ...fixture.data,
      players: [...fixture.data.players, { number: 4, name: "Dee" }, { number: 5, name: "Eli" }],
      games: [
        ...fixture.data.games,
        ...[1, 2, 3, 4].map((i) => ({
          ...fixture.data.games[2],
          id: `dee${i}`,
          endedAt: Date.UTC(2026, 10, 14, 10 + i),
          startedAt: Date.UTC(2026, 10, 14, 10 + i) - 1_800_000,
          seats: [
            { ...fixture.data.games[2].seats[0], player: 4, name: "P4" },
            { ...fixture.data.games[2].seats[1], player: 5, name: "P5" },
          ],
        })),
      ],
    };
    tab(data);
    expect(card("Win streak")).toHaveTextContent("Ann, Dee · 4 wins");
    for (const title of ["Win streak", "Hot hand", "Player of the month"]) {
      const marks = Array.from(card(title).querySelectorAll("[data-link]")).map((n) => n.getAttribute("data-link"));
      expect(marks.length, title).toBeGreaterThan(0);
      expect(new Set(marks), title).toEqual(new Set(["false"]));
    }
    const ranked = Array.from(card("Power ranking").querySelectorAll("[data-link]")).map((n) => n.getAttribute("data-link"));
    expect(new Set(ranked)).toEqual(new Set(["unset"]));
  });

  it("powerRankingRows", () => {
    tab();
    const region = within(card("Power ranking")).getByRole("region", { name: "Power ranking table" });
    const header = Array.from(region.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(header).toEqual(["#", "Player", "Elo", "Last", "Games"]);
    const body = Array.from(region.querySelectorAll("tbody tr"));
    expect(body.map((tr) => names(tr as HTMLElement)[0])).toEqual(["Ann", "Zed", "Cy", "Bo"]);
    expect(body.map((tr) => tr.classList.contains("is-provisional"))).toEqual([false, false, true, true]);
    const cells = body.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent));
    expect(cells[0]).toEqual(["1.", "Ann", "1543", expect.stringMatching(/^\+\d+$/), "5"]);
    expect(cells[2][0]).toBe("");
    expect(cells[3][0]).toBe("");
    expect(card("Power ranking")).toHaveTextContent(
      "Elo ratings. Players with fewer than 5 games are provisional, in italics at the bottom."
    );
  });

  it("theRatingHistoryChart", () => {
    tab();
    const chart = within(card("Rating history")).getByRole("img", { name: "Rating history" });
    const description = document.getElementById(chart.getAttribute("aria-describedby")!);
    expect(description?.textContent).toMatch(/Ann: from \d+ to \d+, highest \d+\./);
    expect(card("Rating history")).toHaveTextContent(
      "Each player's rating after every counted game, dashed while provisional."
    );
    // Ann is provisional for her first five games: the segments into those points are dashed.
    expect(chart.querySelectorAll(".chart-line.is-dashed").length).toBeGreaterThan(0);
    // A tap on the chart shows a game's details.
    fireEvent.pointerDown(chart, { clientX: 300, clientY: 100, pointerType: "touch" });
    const lines = Array.from(document.querySelectorAll(".chart-tooltip > *")).map((line) => line.textContent ?? "");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/^([+−]\d+|0) → \d+$|^Did not play · \d+$/);
  });

  it("aPlayerKeepsTheirColourUnderAnyFilter", () => {
    const { unmount } = tab();
    const colour = (name: string) =>
      Array.from(card("Rating history").querySelectorAll(".chart-legend li"))
        .find((li) => li.textContent === name)
        ?.querySelector<HTMLElement>(".chart-swatch")?.style.backgroundColor;
    const zed = colour("Zed");
    unmount();
    tab(fixture.data, { players: new Set([3, 9]), cpu: false });
    expect(colour("Zed")).toBe(zed);
  });

  it("theHeadline", () => {
    tab();
    expect(rows("Wins").slice(0, 2)).toEqual([
      ["1.", "Ann", "4"],
      ["2.", "Zed", "1"],
    ]);
    expect(rows("Games played")[0]).toEqual(["1.", "Ann", "5"]);
    expect(rows("Win rate")).toContainEqual(["", "Bo", "—", "2"]);
    expect(rows("Win rate")[0]).toEqual(["1.", "Ann", "80%", "5"]);
    expect(underLines("Win rate")[0]).toBe("5 games");
    expect(underLines("Win rate")).toContain("2 games");
    expect(underLines("Games played")).toEqual([]);
    expect(rows("Current streak")[0]).toEqual(["1.", "Ann", "4"]);
    expect(rows("Longest streak")[0]).toEqual(["1.", "Ann", "4"]);
    const sides = within(card("Liberal / Fascist wins"));
    expect(card("Liberal / Fascist wins")).toHaveTextContent("5 / 2");
    expect(sides.getByText("5")).toHaveClass("stats-liberal");
    expect(sides.getByText("2")).toHaveClass("stats-fascist");
    for (const [title, definition] of [
      ["Games played", "Counted games each player played."],
      ["Wins", "Counted games each player won."],
      ["Win rate", "Share of their games each player won, from 5 games."],
      ["Current streak", "Wins in a row up to each player's latest game."],
      ["Longest streak", "The most wins in a row each player has had."],
      ["Liberal / Fascist wins", "Counted games won by each side."],
    ]) {
      expect(card(title)).toHaveTextContent(definition);
    }
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Ratings", "Headline", "Games"]);
  });

  it("latestGamesLink", () => {
    tab();
    const latest = card("Latest games");
    expect(latest).toHaveTextContent("The ten most recent counted games.");
    const links = within(latest).getAllByRole("link");
    expect(links).toHaveLength(7);
    expect(links[0]).toHaveAttribute("href", "/games/g07");
    expect(links[0].textContent).toMatch(/^Fri 13 Nov 2026, 8:30 PM/);
    expect(links[0]).toHaveTextContent("Liberals win · 5 Liberal policies");
    expect(links[6]).toHaveAttribute("href", "/games/g01");
    expect(names(latest)).toEqual([]);
  });

  it("aLinkMovesThePageInPlace", () => {
    tab();
    fireEvent.click(within(card("Latest games")).getAllByRole("link")[1]);
    expect(window.location.pathname).toBe("/games/g06");
    window.history.replaceState(null, "", "/");
  });

  it("emptyLinesWithGames", () => {
    // A week on, no one has played in the last 7 days; in December, no one has won this month.
    render(<OverviewTab stats={buildStats(fixture.data, DEFAULT_FILTER)} now={Date.UTC(2026, 11, 1, 12)} timeZone="UTC" />);
    expect(card("Win streak")).toHaveTextContent("No current win streaks in the last 7 days.");
    expect(card("Hot hand")).toHaveTextContent("No one has won 3 of their last 5 in the last 7 days.");
    expect(card("Player of the month")).toHaveTextContent("No wins yet this month.");
    expect(card("Since last game")).toHaveTextContent("18 days");
  });

  it("everyCardSaysSoWithNoGames", () => {
    const { container } = tab(fixture.data, { players: new Set(), cpu: false });
    const cards = Array.from(container.querySelectorAll(".stat-card"));
    expect(cards).toHaveLength(14);
    for (const c of cards) expect(c).toHaveTextContent(NO_GAMES);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("oneGameDrawsDots", () => {
    const { container } = tab(fixture.data, { players: new Set([3, 9]), cpu: false });
    const chart = within(card("Rating history")).getByRole("img", { name: "Rating history" });
    expect(chart.querySelectorAll(".chart-dot")).toHaveLength(2);
    for (const el of Array.from(chart.querySelectorAll("*"))) {
      for (const attribute of ["d", "cx", "cy", "x", "y", "x1", "x2", "y1", "y2"]) {
        expect(el.getAttribute(attribute) ?? "", `${el.tagName} ${attribute}`).not.toMatch(/NaN|Infinity/);
      }
    }
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });
});
