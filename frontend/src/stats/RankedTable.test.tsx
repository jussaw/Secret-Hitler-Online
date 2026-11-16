import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rankRows } from "./counting";
import { formatPercent } from "./numbers";
import { RankedTable } from "./RankedTable";

const names = new Map([
  [1, "Ann"],
  [2, "Bo"],
  [3, "Cy"],
]);
const desc = (a: number, b: number) => b - a;

/** Each body row's cells, as text. */
function cells(): string[][] {
  return screen.getAllByRole("row").map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent ?? ""));
}

describe("RankedTable", () => {
  it("rankedRows", () => {
    render(<RankedTable rows={rankRows([{ player: 1, value: 0.62, count: 28 }], desc, names)} format={formatPercent} names={names} />);
    expect(cells()).toEqual([["1.", "Ann", "62%", ""]]);
    expect(screen.getByText("Ann")).toHaveClass("player-name");
  });

  it("tiedRowsShareTheirRank", () => {
    const rows = rankRows(
      [
        { player: 1, value: 0.7, count: 9 },
        { player: 2, value: 0.6, count: 8 },
        { player: 3, value: 0.6, count: 6 },
      ],
      desc,
      names
    );
    render(<RankedTable rows={rows} format={formatPercent} names={names} />);
    expect(cells().map((row) => row[0])).toEqual(["1.", "2.", "2."]);
  });

  it("belowTheMinimum", () => {
    const rows = rankRows(
      [
        { player: 1, value: 0.62, count: 28 },
        { player: 2, value: 0.9, count: 3 },
      ],
      desc,
      names
    );
    render(<RankedTable rows={rows} format={formatPercent} names={names} />);
    expect(cells()).toEqual([
      ["1.", "Ann", "62%", ""],
      ["", "Bo", "—", "3 games"],
    ]);
  });

  it("showCountAddsTheCount", () => {
    render(
      <RankedTable rows={rankRows([{ player: 1, value: 0.62, count: 28 }], desc, names)} format={formatPercent} names={names} showCount />
    );
    expect(cells()).toEqual([["1.", "Ann", "62%", "28 games"]]);
  });

  it("countLabel", () => {
    render(
      <RankedTable
        rows={rankRows([{ player: 2, value: 0.5, count: 3 }], desc, names)}
        format={formatPercent}
        names={names}
        countLabel={(n) => `${n} chances`}
      />
    );
    expect(cells()).toEqual([["", "Bo", "—", "3 chances"]]);
  });

  it("anUnknownPlayerIsNamedByNumber", () => {
    render(<RankedTable rows={rankRows([{ player: 9, value: 1, count: 1 }], desc, names)} format={formatPercent} names={names} />);
    expect(cells()).toEqual([["", "Player 9", "—", "1 game"]]);
  });
});
