import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStatsDataForTests } from "../api";
import { DEFAULT_FILTER, parseFilter, type StatsFilter } from "../counting";
import { NO_GAMES } from "../StatCard";
import StatsApp from "../StatsApp";
import { buildStats, type StatsContext } from "../useStats";
import { PlayersList } from "./PlayersPage";
import { SAMPLE_NOW, sampleData, TZ, withRatings } from "./testStats";

const data = sampleData();
const ctx = (filter: StatsFilter = DEFAULT_FILTER) => buildStats(data, filter);
/** The ratings that give PLAYERS' order Bo, Ed, Ann, Cy, Di, Fay. */
const rated = () =>
  withRatings(ctx(), {
    1: { rating: 1540, games: 6 },
    2: { rating: 1560, games: 6 },
    3: { rating: 1520, games: 6 },
    4: { rating: 1500, games: 6 },
    5: { rating: 1560, games: 5 },
    6: { rating: 1700, games: 1 },
  });

function list(stats: StatsContext) {
  return render(<PlayersList stats={stats} now={SAMPLE_NOW} timeZone={TZ} />);
}

const card = () => screen.getByRole("region", { name: "Players" });
/** The table's body rows. */
const bodyRows = () => within(card()).getAllByRole("row").slice(1);
/** The row of the player named `name`. */
const rowOf = (name: string) => bodyRows().find((row) => within(row).queryByRole("link", { name }))!;
/** A row's cells after the player's, as text. */
const numbers = (row: HTMLElement) => within(row).getAllByRole("cell").slice(1).map((cell) => cell.textContent);

describe("PlayersList", () => {
  it("sortsByEloWithProvisionalLast", () => {
    list(rated());
    expect(bodyRows().map((row) => within(row).getByRole("link").textContent)).toEqual(["Bo", "Ed", "Ann", "Cy", "Di", "Fay"]);
    expect(rowOf("Fay")).toHaveClass("is-provisional");
    expect(bodyRows().filter((row) => row.classList.contains("is-provisional"))).toHaveLength(1);
  });

  it("showsGamesWinRateEloAndLastPlayed", () => {
    list(rated());
    expect(within(card()).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Player",
      "Games",
      "Win rate",
      "Elo",
      "Last played",
    ]);
    expect(numbers(rowOf("Ann"))).toEqual(["6", "83%", "1540", "2 days ago"]);
    expect(numbers(rowOf("Fay"))[1]).toBe("— (1)");
  });

  it("namesLinkToTheirPages", () => {
    list(rated());
    expect(within(card()).getByRole("link", { name: "Ann" })).toHaveAttribute("href", "/stats/players/1");
  });

  it("theFilterApplies", () => {
    list(ctx({ players: new Set([1, 2, 3, 4, 5]), cpu: false }));
    expect(within(card()).queryByRole("link", { name: "Fay" })).toBeNull();
    expect(numbers(rowOf("Ann"))[0]).toBe("5");
  });

  it("noCountedGamesIsTheEmptyState", () => {
    list(ctx({ players: new Set([7]), cpu: false }));
    expect(card()).toHaveTextContent(NO_GAMES);
    expect(within(card()).queryByRole("table")).toBeNull();
  });
});

describe("PlayersPage", () => {
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

  it("theFilterAboveTheListMovesTheAddress", async () => {
    history.replaceState(null, "", "/stats/players");
    render(<StatsApp />);
    const players = await screen.findByRole("region", { name: "Players" });
    expect(within(players).queryByRole("link", { name: "Gus" })).toBeNull();
    expect(screen.getByRole("group", { name: "Players" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Include games with CPU players" }));
    expect(location.pathname).toBe("/stats/players");
    expect(parseFilter(location.search)).toEqual({ players: null, cpu: true });
    expect(within(screen.getByRole("region", { name: "Players" })).getByRole("link", { name: "Gus" })).toBeInTheDocument();
  });
});
