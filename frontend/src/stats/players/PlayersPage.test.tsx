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
const statsUnder = (filter: StatsFilter = DEFAULT_FILTER) => buildStats(data, filter);
/** The ratings that give PLAYERS' order Bo, Ed, Ann, Cy, Di, Fay. */
const withSampleRatings = () =>
  withRatings(statsUnder(), {
    1: { rating: 1540, games: 6 },
    2: { rating: 1560, games: 6 },
    3: { rating: 1520, games: 6 },
    4: { rating: 1500, games: 6 },
    5: { rating: 1560, games: 5 },
    6: { rating: 1700, games: 1 },
  });

function renderList(stats: StatsContext) {
  return render(<PlayersList stats={stats} now={SAMPLE_NOW} timeZone={TZ} />);
}

const card = () => screen.getByRole("region", { name: "Players" });
/** The table's body rows. */
const bodyRows = () => within(card()).getAllByRole("row").slice(1);
/** The row of the player named `name`. */
const rowOf = (name: string) => bodyRows().find((row) => within(row).queryByRole("link", { name }))!;
/** A row's cells after the player's, as text. */
const cellTexts = (row: HTMLElement) => within(row).getAllByRole("cell").slice(1).map((cell) => cell.textContent);

describe("PlayersList", () => {
  it("sortsByEloWithProvisionalLast", () => {
    renderList(withSampleRatings());
    expect(bodyRows().map((row) => within(row).getByRole("link").textContent)).toEqual(["Bo", "Ed", "Ann", "Cy", "Di", "Fay"]);
    expect(rowOf("Fay")).toHaveClass("is-provisional");
    expect(bodyRows().filter((row) => row.classList.contains("is-provisional"))).toHaveLength(1);
  });

  it("showsGamesWinRateEloAndLastPlayed", () => {
    renderList(withSampleRatings());
    expect(within(card()).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Player",
      "Games",
      "Win rate",
      "Elo",
      "Last played",
    ]);
    expect(cellTexts(rowOf("Ann"))).toEqual(["6", "83%", "1540", "2 days ago"]);
    expect(cellTexts(rowOf("Fay"))[1]).toBe("— (1)");
  });

  it("namesLinkToTheirPages", () => {
    renderList(withSampleRatings());
    expect(within(card()).getByRole("link", { name: "Ann" })).toHaveAttribute("href", "/players/1");
  });

  it("theCpuSwitchCountsCpuGames", () => {
    renderList(statsUnder({ players: null, cpu: true }));
    expect(cellTexts(rowOf("Gus"))[0]).toBe("1");
    expect(cellTexts(rowOf("Ann"))[0]).toBe("7");
  });

  it("noCountedGamesIsTheEmptyState", () => {
    // Only the CPU game and the unfinished one, with the CPU switch off.
    const uncounted = { players: data.players, games: data.games.filter((g) => g.id === "cpu" || g.id === "unf") };
    renderList(buildStats(uncounted, DEFAULT_FILTER));
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

  /** The player chooser: the chips' group and, on phones, its folded line. */
  const playerChooser = () => [screen.queryByRole("group", { name: "Players" }), screen.queryByRole("button", { name: /^Players:/ })];

  it("theCpuSwitchAloneMovesTheAddress", async () => {
    history.replaceState(null, "", "/players");
    render(<StatsApp />);
    const players = await screen.findByRole("region", { name: "Players" });
    expect(within(players).queryByRole("link", { name: "Gus" })).toBeNull();
    expect(playerChooser()).toEqual([null, null]);
    fireEvent.click(screen.getByRole("switch", { name: "Include games with Bots" }));
    expect(location.pathname).toBe("/players");
    expect(location.search).toBe("?cpu=1");
    expect(within(screen.getByRole("region", { name: "Players" })).getByRole("link", { name: "Gus" })).toBeInTheDocument();
  });

  it("aPlayerFilterInTheAddressStillListsEveryPlayer", async () => {
    history.replaceState(null, "", "/players?players=2,3");
    render(<StatsApp />);
    await screen.findByRole("region", { name: "Players" });
    expect(bodyRows().map((row) => within(row).getByRole("link").textContent).sort()).toEqual(["Ann", "Bo", "Cy", "Di", "Ed", "Fay"]);
    expect(cellTexts(rowOf("Ann"))[0]).toBe("6");
    expect(playerChooser()).toEqual([null, null]);
    // The next change of the switch leaves the ignored player filter out of the address.
    fireEvent.click(screen.getByRole("switch", { name: "Include games with Bots" }));
    expect(location.search).toBe("?cpu=1");
    expect(parseFilter(location.search)).toEqual({ players: null, cpu: true });
  });
});
