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
/** Ratings: Fay, provisional, highest; Bo and Ed tied at 1560; then Ann, Cy and Di. */
const RATINGS = {
  1: { rating: 1540, games: 6 },
  2: { rating: 1560, games: 6 },
  3: { rating: 1520, games: 6 },
  4: { rating: 1500, games: 6 },
  5: { rating: 1560, games: 5 },
  6: { rating: 1700, games: 1 },
};
const withSampleRatings = () => withRatings(statsUnder(), RATINGS);

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
/** The names down the table, in order. */
const shownNames = () => bodyRows().map((row) => within(row).getByRole("link").textContent);
/** A column head's button. */
const head = (name: string) => within(card()).getByRole("button", { name });
/** The `aria-sort` of every column head that has one, by its text. */
const sortedHeads = () =>
  Object.fromEntries(
    within(card())
      .getAllByRole("columnheader")
      .filter((th) => th.hasAttribute("aria-sort"))
      .map((th) => [th.textContent, th.getAttribute("aria-sort")])
  );

describe("PlayersList", () => {
  it("opensInNameOrderWithAProvisionalPlayerInTheirPlace", () => {
    // Fay, provisional and rated highest, renamed "cat": A to Z ignoring case puts them third.
    const renamed = { ...data, players: data.players.map((p) => (p.number === 6 ? { ...p, name: "cat" } : p)) };
    renderList(withRatings(buildStats(renamed, DEFAULT_FILTER), RATINGS));
    expect(shownNames()).toEqual(["Ann", "Bo", "cat", "Cy", "Di", "Ed"]);
    expect(rowOf("cat")).toHaveClass("is-provisional");
    expect(bodyRows().filter((row) => row.classList.contains("is-provisional"))).toHaveLength(1);
    expect(sortedHeads()).toEqual({ Player: "ascending" });
  });

  it("eachHeadSortsByItsColumnAndASecondPressTurnsItRound", () => {
    renderList(withSampleRatings());
    // Each head's first press, then its second; ties go by name either way, and Fay's win rate,
    // below its minimum, stays below every rate.
    const cases: [string, string[], string[]][] = [
      ["Elo", ["Fay", "Bo", "Ed", "Ann", "Cy", "Di"], ["Di", "Cy", "Ann", "Bo", "Ed", "Fay"]],
      ["Win rate", ["Ann", "Cy", "Ed", "Bo", "Di", "Fay"], ["Bo", "Di", "Ed", "Cy", "Ann", "Fay"]],
      ["Games", ["Ann", "Bo", "Cy", "Di", "Ed", "Fay"], ["Fay", "Ed", "Ann", "Bo", "Cy", "Di"]],
      ["Last played", ["Ann", "Bo", "Cy", "Di", "Ed", "Fay"], ["Fay", "Ann", "Bo", "Cy", "Di", "Ed"]],
      ["Player", ["Ann", "Bo", "Cy", "Di", "Ed", "Fay"], ["Fay", "Ed", "Di", "Cy", "Bo", "Ann"]],
    ];
    for (const [name, first, second] of cases) {
      fireEvent.click(head(name));
      expect(shownNames(), `${name}, first press`).toEqual(first);
      expect(sortedHeads(), `${name}, first press`).toEqual({ [name]: name === "Player" ? "ascending" : "descending" });
      fireEvent.click(head(name));
      expect(shownNames(), `${name}, second press`).toEqual(second);
      expect(sortedHeads(), `${name}, second press`).toEqual({ [name]: name === "Player" ? "descending" : "ascending" });
    }
  });

  it("sortingChangesNoNumber", () => {
    renderList(withSampleRatings());
    fireEvent.click(head("Elo"));
    expect(cellTexts(rowOf("Ann"))).toEqual(["6", "83%", "1540", "2 days ago"]);
    expect(cellTexts(rowOf("Fay"))).toEqual(["1", "— (1)", "1700", "37 days ago"]);
  });

  it("aSearchShowsOnlyTheMatchingRowsInTheSortedOrder", () => {
    const stats = withSampleRatings();
    const { rerender } = renderList(stats);
    fireEvent.click(head("Elo"));
    rerender(<PlayersList stats={stats} now={SAMPLE_NOW} timeZone={TZ} search="A" />);
    expect(shownNames()).toEqual(["Fay", "Ann"]);
    rerender(<PlayersList stats={stats} now={SAMPLE_NOW} timeZone={TZ} search="zz" />);
    expect(within(card()).queryByRole("table")).toBeNull();
    expect(card()).toHaveTextContent("No players match “zz”.");
    rerender(<PlayersList stats={stats} now={SAMPLE_NOW} timeZone={TZ} search="" />);
    expect(shownNames()).toEqual(["Fay", "Bo", "Ed", "Ann", "Cy", "Di"]);
    expect(sortedHeads()).toEqual({ Elo: "descending" });
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

  const searchBox = () => screen.getByRole("searchbox", { name: "Search players" });

  it("theSearchBoxStandsBeforeTheSwitchInTheFilterBar", async () => {
    history.replaceState(null, "", "/players");
    render(<StatsApp />);
    await screen.findByRole("region", { name: "Players" });
    const cpuSwitch = screen.getByRole("switch", { name: "Include games with Bots" });
    expect(searchBox().closest(".filter-bar")).toContainElement(cpuSwitch);
    expect(searchBox().compareDocumentPosition(cpuSwitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("typingNarrowsTheRowsIgnoringCaseAndEmptyingShowsThemAll", async () => {
    history.replaceState(null, "", "/players");
    render(<StatsApp />);
    await screen.findByRole("region", { name: "Players" });
    fireEvent.change(searchBox(), { target: { value: "A" } });
    expect(shownNames()).toEqual(["Ann", "Fay"]);
    fireEvent.change(searchBox(), { target: { value: "an" } });
    expect(shownNames()).toEqual(["Ann"]);
    fireEvent.change(searchBox(), { target: { value: "zz" } });
    expect(card()).toHaveTextContent("No players match “zz”.");
    expect(within(card()).queryByRole("table")).toBeNull();
    fireEvent.change(searchBox(), { target: { value: "" } });
    expect(shownNames()).toEqual(["Ann", "Bo", "Cy", "Di", "Ed", "Fay"]);
    // The search never reaches the address.
    expect(location.pathname + location.search).toBe("/players");
  });

  it("theSwitchKeepsTheSearchAndTheSort", async () => {
    history.replaceState(null, "", "/players");
    render(<StatsApp />);
    await screen.findByRole("region", { name: "Players" });
    fireEvent.change(searchBox(), { target: { value: "a" } });
    fireEvent.click(head("Games"));
    fireEvent.click(head("Games"));
    expect(shownNames()).toEqual(["Fay", "Ann"]);
    expect(cellTexts(rowOf("Ann"))[0]).toBe("6");
    fireEvent.click(screen.getByRole("switch", { name: "Include games with Bots" }));
    expect(location.search).toBe("?cpu=1");
    expect(searchBox()).toHaveValue("a");
    expect(shownNames()).toEqual(["Fay", "Ann"]);
    expect(cellTexts(rowOf("Ann"))[0]).toBe("7");
    expect(sortedHeads()).toEqual({ Games: "ascending" });
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
