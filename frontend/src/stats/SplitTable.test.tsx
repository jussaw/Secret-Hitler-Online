import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SplitTable, type SplitCell, type SplitColumn } from "./SplitTable";

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
const full: Record<string, SplitCell> = { LIBERAL: { text: "60%", count: 5 }, FASCIST: { text: "—", count: 2 }, HITLER: { text: "0%", count: 0 } };

function renderTable(rows: { player: number; cells: Record<string, SplitCell> }[] = [
  { player: 1, cells: full },
  { player: 3, cells: full },
  { player: 2, cells: full },
]) {
  render(<SplitTable title="Ja rate" columns={columns} rows={rows} names={names} />);
}

/** The body rows, each as its cells. */
const bodyRows = () => screen.getAllByRole("row").slice(1);

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
    renderTable([{ player: 1, cells: { ...full, HITLER: { text: "3" } } }]);
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
    renderTable([{ player: 1, cells: { LIBERAL: { text: "60%", count: 5 } } }]);
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
});
