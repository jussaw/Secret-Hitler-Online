import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStatsDataForTests } from "../api";
import { DEFAULT_FILTER, parseFilter, type StatsFilter } from "../counting";
import { formatLocalDate } from "../format";
import { filterGames, parseGamesFilter } from "../games/gamesFilter";
import { formatRating } from "../numbers";
import { computePlayer } from "../player";
import StatsApp from "../StatsApp";
import { TROPHIES } from "../trophies";
import { buildStats } from "../useStats";
import PlayerPage, { PlayerView } from "./PlayerPage";
import type { StatsData } from "../record";
import { played, SAMPLE_NOW, sampleData, TZ } from "./testStats";

const data = sampleData();

/** The page's titles, in order. */
const TITLES = ["Elo", "Win rate", "Roles", "Cards as president", "As chancellor", "Votes & powers", "People", "Timing", "Latest games"];

function view(player = 1, filter: StatsFilter = DEFAULT_FILTER, records: StatsData = data) {
  const playerStats = computePlayer(buildStats(records, filter), player, SAMPLE_NOW, TZ);
  return render(<PlayerView player={playerStats} cpu={filter.cpu} now={SAMPLE_NOW} timeZone={TZ} />);
}

const card = (name: string) => screen.getByRole("region", { name });
const regionNames = () => screen.getAllByRole("region").map((region) => region.querySelector("h3")?.textContent);

describe("PlayerView", () => {
  it("theCardsFollowTheSpec", () => {
    view();
    expect(regionNames()).toEqual(TITLES);
  });

  it("theHeaderSaysGamesCpuGamesAndLastPlayed", () => {
    view();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Ann$/);
    expect(within(screen.getByRole("heading", { level: 1 })).queryByRole("link")).toBeNull();
    expect(screen.getByText("6 games since 2 Oct · +1 with Bots, not counted · last played 2 days ago")).toBeInTheDocument();
    for (const label of ["Hitler Hunter", "Chancellor Hitler"]) {
      const trophy = TROPHIES.find((t) => t.label === label)!;
      expect(screen.getByText(label)).toHaveAttribute("title", trophy.rule);
    }
    expect(screen.getByRole("list", { name: "Trophies" }).children).toHaveLength(2);
  });

  it("theToggleDropsTheCpuNote", () => {
    view(1, { players: null, cpu: true });
    expect(screen.getByText("7 games since 2 Oct · last played 2 days ago")).toBeInTheDocument();
    expect(screen.queryByText(/with Bots/)).toBeNull();
  });

  it("eloShowsRatingRankAndPeak", () => {
    const ann = computePlayer(buildStats(data, DEFAULT_FILTER), 1, SAMPLE_NOW, TZ);
    view();
    const elo = card("Elo");
    expect(elo).toHaveTextContent(formatRating(ann.elo!.rating));
    expect(ann.elo!.rank).not.toBeNull();
    expect(elo).toHaveTextContent(`#${ann.elo!.rank}`);
    expect(elo).toHaveTextContent(`peak ${formatRating(ann.elo!.peak)}`);
    expect(within(elo).getByRole("img", { name: "Rating history" })).toBeInTheDocument();
    expect(elo.querySelector(".player-big")).not.toHaveTextContent("provisional");
  });

  it("aProvisionalPlayersEloSaysSo", () => {
    view(6);
    expect(card("Elo").querySelector(".player-big")).toHaveTextContent("provisional");
    expect(card("Elo")).not.toHaveTextContent("#");
  });

  it("latestGamesLinkToTheirGames", () => {
    view();
    const rows = within(card("Latest games")).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/games/unf");
    const cpuRow = rows.find((row) => within(row).getByRole("link").getAttribute("href") === "/games/cpu")!;
    expect(cpuRow.querySelector(".games-row-cpu")).toHaveTextContent(/^Bots$/);
    expect(rows.filter((row) => row.textContent!.includes("Bots"))).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("unfinished");
    expect(rows[1]).toHaveTextContent(/Liberal.*won.*Liberal policies/);
  });

  it("aGamePastMidnightShowsTheDayItStartedAsGamesDoes", () => {
    // Ann's newest game starts at 23:50 UTC on 14 Nov and ends at 00:30 on the 15th.
    const late = {
      ...played("late", [2026, 11, 14], [[1, "LIBERAL"], [2, "LIBERAL"], [3, "LIBERAL"], [4, "FASCIST"], [5, "HITLER"]], "LIBERAL_POLICIES"),
      startedAt: Date.UTC(2026, 10, 14, 23, 50),
      endedAt: Date.UTC(2026, 10, 15, 0, 30),
    };
    view(1, DEFAULT_FILTER, { players: data.players, games: [...data.games, late] });
    const first = within(card("Latest games")).getAllByRole("row")[0];
    expect(within(first).getByRole("link")).toHaveAttribute("href", "/games/late");
    expect(within(first).getByRole("link")).toHaveTextContent(/^14 Nov$/);
    expect(formatLocalDate(late.startedAt, TZ)).toContain("14 Nov");
  });

  it("allGamesOpensGamesFilteredToThem", () => {
    view();
    const all = within(card("Latest games")).getByRole("link", { name: /^All 8 games/ });
    const href = all.getAttribute("href")!;
    expect(href.startsWith("/games?")).toBe(true);
    const search = href.slice(href.indexOf("?"));
    const ids = filterGames(data.games, parseGamesFilter(search)).map((g) => g.id).sort();
    expect(ids).toEqual(["cpu", "g1", "g2", "g3", "g4", "g5", "g6", "unf"]);
    expect(all.querySelector('[aria-hidden="true"]')).toHaveTextContent("›");
  });

  it("peopleLinkToPlayers", () => {
    view();
    const people = card("People");
    const most = within(people).getByRole("rowheader", { name: "Most played with" }).closest("tr")!;
    expect(within(most).getByRole("link", { name: "Bo" })).toHaveAttribute("href", "/players/2");
    expect(people).toHaveTextContent(/Most played with\s*Bo · 6 games/);
  });

  it("aPlayerWithNoCountedGamesShowsEmptyCards", () => {
    view(7);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Gus$/);
    expect(screen.getByText("No counted games · +1 with Bots, not counted")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Trophies" })).toBeNull();
    const empty = screen.getAllByRole("region").filter((region) => region.textContent!.includes("No counted games yet."));
    expect(empty.map((region) => region.querySelector("h3")?.textContent)).toEqual(TITLES.slice(0, 8));
    const latest = card("Latest games");
    expect(within(latest).getAllByRole("row")).toHaveLength(1);
    expect(within(latest).getAllByRole("link")[0]).toHaveAttribute("href", "/games/cpu");
    expect(within(latest).getByRole("link", { name: /^All 1 game$/ })).toBeInTheDocument();
  });

  it("aPlayerWithOnlyAnUnfinishedGameShowsEmptyCards", () => {
    const unfinished = played("hal", [2026, 11, 14], [[8, "LIBERAL"], [2, "LIBERAL"], [3, "LIBERAL"], [4, "FASCIST"], [5, "HITLER"]], "UNFINISHED");
    view(8, DEFAULT_FILTER, { players: [...data.players, { number: 8, name: "Hal" }], games: [...data.games, unfinished] });
    expect(screen.getByText("No counted games")).toHaveClass("player-summary");
    const empty = screen.getAllByRole("region").filter((region) => region.textContent!.includes("No counted games yet."));
    expect(empty.map((region) => region.querySelector("h3")?.textContent)).toEqual(TITLES.slice(0, 8));
    const latest = card("Latest games");
    expect(within(latest).getAllByRole("row")).toHaveLength(1);
    expect(within(latest).getAllByRole("row")[0]).toHaveTextContent("unfinished");
    expect(within(latest).getAllByRole("link")[0]).toHaveAttribute("href", "/games/hal");
    expect(within(latest).getByRole("link", { name: /^All 1 game$/ })).toBeInTheDocument();
  });

  it("aPlayerWithNoRecordsShowsEveryCardEmpty", () => {
    view(9, DEFAULT_FILTER, { players: [...data.players, { number: 9, name: "Ivy" }], games: data.games });
    const empty = screen.getAllByRole("region").filter((region) => region.textContent!.includes("No counted games yet."));
    expect(empty.map((region) => region.querySelector("h3")?.textContent)).toEqual(TITLES);
    expect(within(card("Latest games")).queryByRole("link")).toBeNull();
  });
});

describe("PlayerPage", () => {
  it("anUnknownPlayerIsNotFound", () => {
    for (const number of [99, 0]) {
      // A route the page is given; the address /players/0 never makes one (theAppsNotFoundPages).
      const { unmount } = render(<PlayerPage data={data} route={{ page: "player", number }} />);
      expect(screen.getByText("This player was not found.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "All players" })).toHaveAttribute("href", "/players");
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      unmount();
    }
  });

  describe("in the app", () => {
    beforeEach(() => {
      resetStatsDataForTests();
      vi.stubGlobal("scrollTo", vi.fn());
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } }))
      );
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("theAppsNotFoundPages", async () => {
      history.replaceState(null, "", "/players/99");
      const { unmount } = render(<StatsApp />);
      expect(await screen.findByText("This player was not found.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "All players" })).toHaveAttribute("href", "/players");
      unmount();
      // 0 is no player's number, so the address names no page at all.
      history.replaceState(null, "", "/players/0");
      render(<StatsApp />);
      expect(await screen.findByText("This page was not found.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to the stats" })).toHaveAttribute("href", "/stats");
    });

    it("aPlayerFilterLeavesTheNumbersAlone", async () => {
      vi.spyOn(Date, "now").mockReturnValue(SAMPLE_NOW);
      const pageText = async (address: string) => {
        history.replaceState(null, "", address);
        const { unmount } = render(<StatsApp />);
        await screen.findByRole("heading", { level: 1 });
        const text = screen.getByRole("main").textContent;
        unmount();
        return text;
      };
      const all = await pageText("/players/1");
      expect(all).toContain("6 games since 2 Oct");
      expect(await pageText("/players/1?players=2,3")).toBe(all);
    });

    it("theCpuToggleStandsAlone", async () => {
      history.replaceState(null, "", "/players/1?players=2,3");
      render(<StatsApp />);
      const toggle = await screen.findByRole("switch", { name: "Include games with Bots" });
      expect(screen.queryByRole("group", { name: "Players" })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Players:/ })).toBeNull();
      // PLAYERS' search box is PLAYERS' alone.
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(toggle.closest(".filter-bar")).not.toHaveClass("has-lead");
      expect(screen.getByText(/^6 games since 2 Oct/)).toBeInTheDocument();
      fireEvent.click(toggle);
      expect(location.pathname).toBe("/players/1");
      expect(parseFilter(location.search).cpu).toBe(true);
      expect(screen.getByText(/^7 games since 2 Oct/)).toBeInTheDocument();
    });
  });
});
