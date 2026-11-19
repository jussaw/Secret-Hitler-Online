import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { rate } from "./counting";
import { countCell, rateCell, SplitTable, type SplitCell, type SplitColumn } from "./SplitTable";

const columns: SplitColumn[] = [
  { key: "LIBERAL", label: "Liberal" },
  { key: "FASCIST", label: "Fascist" },
  { key: "HITLER", label: "Hitler" },
];
const names = new Map([
  [1, "Cy"],
  [2, "ann"],
  [3, "WWWWWWWWWW01"],
]);
const full: Record<string, SplitCell> = {
  LIBERAL: { text: "60%", value: 60, count: 5 },
  FASCIST: { text: "—", value: null, count: 2 },
  HITLER: { text: "0%", value: 0, count: 0 },
};

function renderTable(rows: { player: number; cells: Record<string, SplitCell> }[] = [
  { player: 1, cells: full },
  { player: 3, cells: full },
  { player: 2, cells: full },
]) {
  render(<SplitTable title="Ja rate" columns={columns} rows={rows} names={names} />);
}

/** The body rows (the head row left out). */
const bodyRows = () => screen.getAllByRole("row").filter((row) => row.closest("tbody") !== null);
/** The names down the table, in order. */
const shownNames = () => screen.getAllByRole("rowheader").map((th) => th.textContent);
/** Each body row's Liberal text, in order. */
const liberalTexts = () => bodyRows().map((row) => within(row).getAllByRole("cell")[0].querySelector(".split-text")?.textContent);
/** A head, by its words. */
const head = (name: string) => screen.getByRole("columnheader", { name });
/** A press on a head's button, by its words. */
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

/** ann, Cy and WWWWWWWWWW01, given out of name order, each with its Liberal cell in `cells` (none
 *  for a player missing there). */
function renderLiberal(cells: Record<number, SplitCell>) {
  renderTable(
    [3, 1, 2].map((player) => {
      const own: Record<string, SplitCell> = {};
      if (Object.prototype.hasOwnProperty.call(cells, player)) own.LIBERAL = cells[player];
      return { player, cells: own };
    })
  );
}

describe("SplitTable", () => {
  it("headsAndRows", () => {
    renderTable();
    const heads = screen.getAllByRole("columnheader");
    expect(heads.map((h) => h.textContent)).toEqual(["Player", "Liberal", "Fascist", "Hitler"]);
    expect(heads[1]).toHaveClass("split-liberal");
    expect(heads[2]).toHaveClass("split-fascist");
    expect(heads[3]).toHaveClass("split-hitler");
    expect(heads.map((h) => h.getAttribute("scope"))).toEqual(["col", "col", "col", "col"]);
    expect(bodyRows()).toHaveLength(3);
  });

  it("otherKeysGetNoSideClass", () => {
    render(<SplitTable title="By size" columns={[{ key: "5", label: "5" }]} rows={[]} names={names} />);
    expect(screen.getAllByRole("columnheader")[1].className).toBe("");
  });

  it("rowsSortedByName", () => {
    renderTable();
    const heads = screen.getAllByRole("rowheader");
    expect(heads.map((h) => h.textContent)).toEqual(["ann", "Cy", "WWWWWWWWWW01"]);
    expect(heads.map((h) => h.getAttribute("scope"))).toEqual(["row", "row", "row"]);
    expect(within(heads[0]).getByText("ann")).toHaveClass("player-name");
  });

  it("aCellShowsItsTextThenItsCount", () => {
    renderTable([{ player: 1, cells: { ...full, HITLER: { text: "3", value: 3 } } }]);
    const [liberal, fascist, hitler] = within(bodyRows()[0]).getAllByRole("cell");
    expect(liberal.querySelector(".split-text")).toHaveTextContent("60%");
    expect(liberal.querySelector(".split-count")).toHaveTextContent("5");
    expect(fascist.querySelector(".split-text")).toHaveTextContent("—");
    expect(fascist.querySelector(".split-count")).toHaveTextContent("2");
    expect(hitler.querySelector(".split-text")).toHaveTextContent("3");
    expect(hitler.querySelector(".split-count")).toBeNull();
    expect(liberal.firstElementChild).toHaveClass("split-text");
  });

  it("aZeroCountIsShown", () => {
    renderTable([{ player: 1, cells: full }]);
    const hitler = within(bodyRows()[0]).getAllByRole("cell")[2];
    expect(hitler.querySelector(".split-text")).toHaveTextContent("0%");
    expect(hitler.querySelector(".split-count")).toHaveTextContent("0");
  });

  it("anAbsentCellShowsADash", () => {
    renderTable([{ player: 1, cells: { LIBERAL: { text: "60%", value: 60, count: 5 } } }]);
    const [, fascist, hitler] = within(bodyRows()[0]).getAllByRole("cell");
    expect(fascist).toHaveTextContent("—");
    expect(hitler).toHaveTextContent("—");
    expect(hitler.querySelector(".split-count")).toBeNull();
  });

  it("namesKeepTheirFullTitle", () => {
    renderTable();
    expect(screen.getByRole("rowheader", { name: "WWWWWWWWWW01" })).toHaveAttribute("title", "WWWWWWWWWW01");
  });

  it("anUnknownPlayerIsNamedByNumber", () => {
    renderTable([{ player: 9, cells: full }]);
    expect(screen.getByRole("rowheader")).toHaveTextContent("Player 9");
  });

  it("scrollsInItsOwnRegion", () => {
    // Review Focus 5: a wide table scrolls inside its own region, not the page.
    renderTable();
    const region = screen.getByRole("region", { name: "Ja rate table" });
    expect(region).toHaveClass("scroll-region");
    expect(within(region).getByRole("table")).toHaveClass("split-table");
  });

  it("opensInNameOrderWithPlayerMarked", () => {
    renderTable();
    expect(shownNames()).toEqual(["ann", "Cy", "WWWWWWWWWW01"]);
    expect(screen.getAllByRole("columnheader").filter((th) => th.hasAttribute("aria-sort"))).toEqual([head("Player")]);
    expect(head("Player")).toHaveAttribute("aria-sort", "ascending");
  });

  it("aSideHeadSortsMostFirstThenTurnsRound", () => {
    renderLiberal({
      1: { text: "40%", value: 40, count: 5 },
      2: { text: "20%", value: 20, count: 5 },
      3: { text: "90%", value: 90, count: 5 },
    });
    press("Liberal");
    expect(head("Liberal")).toHaveAttribute("aria-sort", "descending");
    expect(head("Player")).not.toHaveAttribute("aria-sort");
    expect(shownNames()).toEqual(["WWWWWWWWWW01", "Cy", "ann"]);
    press("Liberal");
    expect(head("Liberal")).toHaveAttribute("aria-sort", "ascending");
    expect(shownNames()).toEqual(["ann", "Cy", "WWWWWWWWWW01"]);
  });

  it("sortsByTheValueNeverTheCount", () => {
    renderLiberal({ 1: { text: "60%", value: 60, count: 2 }, 2: { text: "40%", value: 40, count: 9 } });
    press("Liberal");
    expect(liberalTexts().slice(0, 2)).toEqual(["60%", "40%"]);
    press("Liberal");
    expect(liberalTexts().slice(0, 2)).toEqual(["40%", "60%"]);
  });

  it("missingCellsGoLastEitherWay", () => {
    // ann's cell is a dash (null), and WWWWWWWWWW01 has none: both below Cy's, in name order.
    renderLiberal({ 1: { text: "60%", value: 60, count: 5 }, 2: { text: "—", value: null, count: 2 } });
    press("Liberal");
    expect(shownNames()).toEqual(["Cy", "ann", "WWWWWWWWWW01"]);
    press("Liberal");
    expect(head("Liberal")).toHaveAttribute("aria-sort", "ascending");
    expect(shownNames()).toEqual(["Cy", "ann", "WWWWWWWWWW01"]);
  });

  it("tiesKeepNameOrderEitherWay", () => {
    const same: SplitCell = { text: "50%", value: 50, count: 4 };
    renderLiberal({ 1: same, 2: same, 3: same });
    press("Liberal");
    expect(shownNames()).toEqual(["ann", "Cy", "WWWWWWWWWW01"]);
    press("Liberal");
    expect(shownNames()).toEqual(["ann", "Cy", "WWWWWWWWWW01"]);
  });

  it("zeroIsAValue", () => {
    renderLiberal({ 1: { text: "0", value: 0 }, 2: { text: "—", value: null }, 3: { text: "2", value: 2 } });
    press("Liberal");
    expect(liberalTexts()).toEqual(["2", "0", "—"]);
    press("Liberal");
    expect(head("Liberal")).toHaveAttribute("aria-sort", "ascending");
    expect(liberalTexts()).toEqual(["0", "2", "—"]);
  });

  it("sideHeadsKeepTheirClassSorted", () => {
    renderTable();
    press("Hitler");
    const hitler = head("Hitler");
    expect(hitler).toHaveClass("split-hitler");
    expect(hitler).toHaveAttribute("aria-sort", "descending");
    expect(within(hitler).getByRole("button", { name: "Hitler" })).toHaveClass("stats-sort", "is-sorted", "is-end");
  });

  it("aColumnKeyedNameIsRefused", () => {
    // React reports the error it rethrows, and jsdom the window's error event; keep both out of
    // the run's output.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handled = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", handled);
    try {
      expect(() =>
        render(<SplitTable title="Bad" columns={[{ key: "name", label: "Name" }]} rows={[]} names={names} />)
      ).toThrow('A split column cannot be keyed "name"');
    } finally {
      window.removeEventListener("error", handled);
      quiet.mockRestore();
    }
  });
});

describe("the cell builders", () => {
  it("aRatesCellIsItsShareAndTheWholePercentItShows", () => {
    expect(rateCell(rate(5, 8))).toEqual({ text: "63%", value: 63, count: 8 });
    expect(rateCell(rate(0, 5))).toEqual({ text: "0%", value: 0, count: 5 });
    // Another count beside it (a share's hits), never what it sorts by.
    expect(rateCell(rate(3, 5), 3)).toEqual({ text: "60%", value: 60, count: 3 });
    expect(rateCell(rate(0, 0), 0)).toEqual({ text: "—", value: null, count: 0 });
  });

  it("aRateBelowItsMinimumIsADashWithNoFigure", () => {
    expect(rateCell(rate(1, 2))).toEqual({ text: "—", value: null, count: 2 }); // below MIN_CHANCES
  });

  it("aCountsCellIsTheNumberWithNoCountBesideIt", () => {
    expect(countCell(7)).toEqual({ text: "7", value: 7 });
    expect(countCell(0)).toEqual({ text: "0", value: 0 });
    expect(countCell(0)).not.toHaveProperty("count");
  });
});
