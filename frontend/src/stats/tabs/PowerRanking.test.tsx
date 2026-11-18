import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER } from "../counting";
import { computeOverview, type PowerRow } from "../overview";
import { overviewFixture } from "../testOverview";
import { buildStats } from "../useStats";
import { PowerRanking } from "./PowerRanking";

const names = new Map([
  [1, "Ann"],
  [2, "Bo"],
  [3, "Cy"],
  [4, "Di"],
]);

/** A settled player's row. */
const settled = (player: number, rank: number, rating: number, lastChange = 0, games = 8): PowerRow => ({
  player,
  rank,
  rating,
  lastChange,
  games,
  provisional: false,
});

/** A provisional player's row: no rank. */
const provisional = (player: number, rating: number, lastChange = 0, games = 3): PowerRow => ({
  player,
  rank: null,
  rating,
  lastChange,
  games,
  provisional: true,
});

/** Each body row's cells, as text (the head row left out). */
function cells(): string[][] {
  return screen
    .getAllByRole("row")
    .filter((row) => row.closest("tbody") !== null)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent ?? ""));
}

/** The names down the table, in order. */
const shownNames = () => cells().map((row) => row[1]);
/** A column's head, by its accessible name. */
const columnHead = (name: string) => screen.getByRole("columnheader", { name });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
/** The heads that say they sort the table, by accessible name, with the way they run. */
const sortedHeads = () =>
  screen
    .getAllByRole("columnheader")
    .filter((th) => th.hasAttribute("aria-sort"))
    .map((th) => th.getAttribute("aria-sort"));

describe("PowerRanking", () => {
  it("opensInComputeOverviewsOrder", () => {
    const fixture = overviewFixture();
    const stats = buildStats(fixture.data, DEFAULT_FILTER);
    const rows = computeOverview(stats, fixture.now, "UTC").powerRanking;
    render(<PowerRanking rows={rows} names={stats.names} />);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["#", "Player", "Elo", "Last", "Games"]);
    for (const name of ["Rank", "Player", "Elo", "Last", "Games"]) {
      expect(columnHead(name).querySelector("button")).toHaveAttribute("type", "button");
    }
    // The rows exactly as computeOverview gives them: settled players by rating, then provisional ones.
    expect(shownNames()).toEqual(rows.map((row) => stats.names.get(row.player)));
    expect(shownNames()).toEqual(["Ann", "Zed", "Cy", "Bo"]);
    expect(rows.map((row) => row.provisional)).toEqual([false, false, true, true]);
    expect(Math.round(rows[0].rating)).toBeGreaterThanOrEqual(Math.round(rows[1].rating));
    expect(cells().map((row) => row[0])).toEqual(["1.", "2.", "", ""]);
    expect(columnHead("Rank")).toHaveAttribute("aria-sort", "ascending");
    expect(sortedHeads()).toEqual(["ascending"]);
  });

  it("aProvisionalRowTakesItsPlaceByElo", () => {
    render(
      <PowerRanking
        rows={[settled(1, 1, 1600), settled(2, 2, 1550), provisional(3, 1700), provisional(4, 1500)]}
        names={names}
      />
    );
    expect(shownNames()).toEqual(["Ann", "Bo", "Cy", "Di"]);
    press("Elo");
    expect(columnHead("Elo")).toHaveAttribute("aria-sort", "descending");
    expect(shownNames()).toEqual(["Cy", "Ann", "Bo", "Di"]);
    // Cy keeps no rank and its italics wherever it falls.
    expect(cells()[0]).toEqual(["", "Cy", "1700", "0", "3"]);
    const first = screen.getAllByRole("row").find((row) => row.closest("tbody") !== null)!;
    expect(first).toHaveClass("is-provisional");
    press("Elo");
    expect(columnHead("Elo")).toHaveAttribute("aria-sort", "ascending");
    expect(shownNames()).toEqual(["Di", "Bo", "Ann", "Cy"]);
  });

  it("provisionalRowsStayLastUnderRankEitherWay", () => {
    render(
      <PowerRanking
        rows={[settled(1, 1, 1600), settled(2, 2, 1580), settled(3, 3, 1550), provisional(4, 1700)]}
        names={names}
      />
    );
    press("Rank");
    expect(columnHead("Rank")).toHaveAttribute("aria-sort", "descending");
    expect(shownNames()).toEqual(["Cy", "Bo", "Ann", "Di"]);
    expect(cells().map((row) => row[0])).toEqual(["3.", "2.", "1.", ""]);
    press("Rank");
    expect(columnHead("Rank")).toHaveAttribute("aria-sort", "ascending");
    expect(shownNames()).toEqual(["Ann", "Bo", "Cy", "Di"]);
  });

  it("eloComparesRounded", () => {
    // Bo's 1539.6 and Ann's 1540.4 both show 1540: a tie, which keeps the rows' own order (Bo, with
    // more games, first) whichever way the sort runs.
    render(<PowerRanking rows={[settled(3, 1, 1600), settled(2, 2, 1539.6, 0, 9), settled(1, 2, 1540.4, 0, 7)]} names={names} />);
    expect(cells().map((row) => row[2])).toEqual(["1600", "1540", "1540"]);
    press("Elo");
    expect(shownNames()).toEqual(["Cy", "Bo", "Ann"]);
    press("Elo");
    expect(shownNames()).toEqual(["Bo", "Ann", "Cy"]);
  });

  it("theLastChangeSorts", () => {
    render(
      <PowerRanking rows={[settled(1, 1, 1600, -13), settled(2, 2, 1550, 19), settled(3, 3, 1520, 0.4)]} names={names} />
    );
    press("Last");
    expect(columnHead("Last")).toHaveAttribute("aria-sort", "descending");
    expect(cells().map((row) => `${row[1]} ${row[3]}`)).toEqual(["Bo +19", "Cy 0", "Ann −13"]);
    expect(sortedHeads()).toEqual(["descending"]);
    press("Last");
    expect(cells().map((row) => `${row[1]} ${row[3]}`)).toEqual(["Ann −13", "Cy 0", "Bo +19"]);
    press("Games");
    expect(columnHead("Games")).toHaveAttribute("aria-sort", "descending");
  });

  it("theLastChangeComparesRounded", () => {
    // Ann's −0.3 and Bo's 0.4 both show 0: a tie, which keeps the rows' own order (Ann first) under
    // Last descending, where the raw changes would put Bo first.
    render(<PowerRanking rows={[settled(1, 1, 1600, -0.3), settled(2, 2, 1550, 0.4), settled(3, 3, 1520, 5)]} names={names} />);
    press("Last");
    expect(columnHead("Last")).toHaveAttribute("aria-sort", "descending");
    expect(cells().map((row) => `${row[1]} ${row[3]}`)).toEqual(["Cy +5", "Ann 0", "Bo 0"]);
  });
});
