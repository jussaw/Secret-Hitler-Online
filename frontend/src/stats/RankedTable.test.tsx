import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rankRows } from "./counting";
import { formatPercent, wholePercent } from "./numbers";
import { countNouns, RankedTable } from "./RankedTable";

const names = new Map([
  [1, "Ann"],
  [2, "Bo"],
  [3, "Cy"],
]);
const desc = (a: number, b: number) => b - a;

/** The body's rows (the head row left out). */
const bodyRows = () => screen.getAllByRole("row").filter((row) => row.closest("tbody") !== null);

/** A cell's text but for the count's line under the name, which only the stacked query shows. */
function cellText(cell: HTMLElement): string {
  return Array.from(cell.childNodes)
    .filter((node) => !(node instanceof HTMLElement && node.classList.contains("ranked-count-under")))
    .map((node) => node.textContent ?? "")
    .join("");
}

/** Each body row's cells, as text. */
function cells(): string[][] {
  return bodyRows().map((row) => within(row).getAllByRole("cell").map(cellText));
}

/** Each body row's line under the name ("28 games"), null for a row with none. */
const underLines = () => bodyRows().map((row) => row.querySelector(".ranked-count-under")?.textContent ?? null);

/** The names down the table, in order. */
const shownNames = () => cells().map((row) => row[1]);
/** Each body row's name and rank, as "Ann 2.". */
const namesAndRanks = () => cells().map((row) => `${row[1]} ${row[0]}`.trim());
/** A head's button, by its accessible name. */
const head = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.click(head(name));

/** A win-rate table, its count column under "Games" when `countHead` is given. */
function renderRates(rows: { player: number; value: number; count: number }[], countHead?: string) {
  return render(
    <RankedTable
      rows={rankRows(rows, desc, names)}
      format={formatPercent}
      names={names}
      valueHead="Win rate"
      sortValue={wholePercent}
      countHead={countHead}
    />
  );
}

/** Ann ranked 1st, Cy 2nd, and Bo below the minimum (3 games), unranked. */
const WITH_UNRANKED = [
  { player: 1, value: 0.62, count: 28 },
  { player: 2, value: 0.9, count: 3 },
  { player: 3, value: 0.4, count: 10 },
];

describe("RankedTable", () => {
  it("rankedRows", () => {
    renderRates([{ player: 1, value: 0.62, count: 28 }]);
    expect(cells()).toEqual([["1.", "Ann", "62%"]]);
    expect(screen.getByText("Ann")).toHaveClass("player-name");
  });

  it("tiedRowsShareTheirRank", () => {
    renderRates([
      { player: 1, value: 0.7, count: 9 },
      { player: 2, value: 0.6, count: 8 },
      { player: 3, value: 0.6, count: 6 },
    ]);
    expect(cells().map((row) => row[0])).toEqual(["1.", "2.", "2."]);
  });

  it("belowTheMinimum", () => {
    renderRates(
      [
        { player: 1, value: 0.62, count: 28 },
        { player: 2, value: 0.9, count: 3 },
      ],
      "Games"
    );
    expect(cells()).toEqual([
      ["1.", "Ann", "62%", "28"],
      ["", "Bo", "—", "3"],
    ]);
  });

  it("anUnknownPlayerIsNamedByNumber", () => {
    renderRates([{ player: 9, value: 1, count: 1 }], "Games");
    expect(cells()).toEqual([["", "Player 9", "—", "1"]]);
  });

  it("headsNameEachColumn", () => {
    renderRates(WITH_UNRANKED, "Games");
    const heads = screen.getAllByRole("columnheader");
    expect(heads.map((th) => th.textContent)).toEqual(["#", "Player", "Win rate", "Games"]);
    for (const name of ["Rank", "Player", "Win rate", "Games"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
      expect(head(name)).toHaveAttribute("type", "button");
    }
    expect(heads.map((th) => th.getAttribute("scope"))).toEqual(["col", "col", "col", "col"]);
  });

  it("withoutACountHeadThereAreThreeColumns", () => {
    renderRates(WITH_UNRANKED);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["#", "Player", "Win rate"]);
    expect(cells().map((row) => row.length)).toEqual([3, 3, 3]);
  });

  it("aCountHeadShowsTheCountOnEveryRow", () => {
    renderRates(WITH_UNRANKED, "Games");
    expect(cells()).toEqual([
      ["1.", "Ann", "62%", "28"],
      ["2.", "Cy", "40%", "10"],
      ["", "Bo", "—", "3"],
    ]);
  });

  it("aCountHeadPutsTheCountUnderTheNameToo", () => {
    // Shown only where the stacked query matches (RankedTable.css), in place of the count column
    // and its head.
    renderRates(WITH_UNRANKED, "Games");
    expect(underLines()).toEqual(["28 games", "10 games", "3 games"]);
    const under = bodyRows()[0].querySelector(".ranked-count-under")!;
    expect(under.tagName).toBe("SPAN");
    expect(under.closest("td")).toHaveClass("ranked-name");
    expect(under.previousElementSibling).toHaveClass("player-name");
    expect(screen.getByRole("table")).toHaveClass("ranked-table", "has-count");
  });

  it("theLineUnderTheNameSaysEachCountHeadsNoun", () => {
    // Every count head the cards use, for one and for many.
    const lines: Record<string, [string, string]> = {
      Games: ["1 game", "2 games"],
      Terms: ["1 term", "2 terms"],
      Hands: ["1 hand", "2 hands"],
      Nominations: ["1 nomination", "2 nominations"],
      Elections: ["1 election", "2 elections"],
      Votes: ["1 vote", "2 votes"],
      Checks: ["1 check", "2 checks"],
    };
    for (const [countHead, [one, many]] of Object.entries(lines)) {
      expect(countNouns(countHead)).toEqual([one.slice(2), many.slice(2)]);
      const { unmount } = renderRates(
        [
          { player: 1, value: 0.5, count: 1 },
          { player: 2, value: 0.4, count: 2 },
        ],
        countHead
      );
      // Both below the minimum, so unranked, the larger count first.
      expect(underLines(), countHead).toEqual([many, one]);
      unmount();
    }
  });

  it("withoutACountHeadThereIsNoLineUnderTheName", () => {
    renderRates(WITH_UNRANKED);
    expect(underLines()).toEqual([null, null, null]);
    expect(document.querySelector(".ranked-count-under")).toBeNull();
    expect(screen.getByRole("table")).not.toHaveClass("has-count");
  });

  it("theLineUnderTheNameFollowsItsRowThroughASort", () => {
    renderRates(WITH_UNRANKED, "Games");
    press("Player");
    expect(cells().map((row) => row[1])).toEqual(["Ann", "Bo", "Cy"]);
    expect(underLines()).toEqual(["28 games", "3 games", "10 games"]);
  });

  it("opensInRankOrder", () => {
    const rows = rankRows(WITH_UNRANKED, desc, names);
    renderRates(WITH_UNRANKED, "Games");
    expect(shownNames()).toEqual(rows.map((row) => names.get(row.player)));
    expect(shownNames()).toEqual(["Ann", "Cy", "Bo"]);
    expect(screen.getByRole("columnheader", { name: "Rank" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getAllByRole("columnheader").filter((th) => th.hasAttribute("aria-sort"))).toHaveLength(1);
  });

  it("aSortKeepsEveryRowsRank", () => {
    renderRates([
      { player: 3, value: 0.9, count: 9 },
      { player: 1, value: 0.7, count: 8 },
      { player: 2, value: 0.6, count: 6 },
    ]);
    expect(namesAndRanks()).toEqual(["Cy 1.", "Ann 2.", "Bo 3."]);
    press("Player");
    expect(namesAndRanks()).toEqual(["Ann 2.", "Bo 3.", "Cy 1."]);
    expect(screen.getByRole("columnheader", { name: "Player" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Rank" })).not.toHaveAttribute("aria-sort");
    press("Player");
    expect(namesAndRanks()).toEqual(["Cy 1.", "Bo 3.", "Ann 2."]);
  });

  it("unrankedRowsGoLastUnderTheValueEitherWay", () => {
    renderRates(WITH_UNRANKED, "Games");
    press("Win rate");
    expect(screen.getByRole("columnheader", { name: "Win rate" })).toHaveAttribute("aria-sort", "descending");
    expect(shownNames()).toEqual(["Ann", "Cy", "Bo"]);
    press("Win rate");
    expect(screen.getByRole("columnheader", { name: "Win rate" })).toHaveAttribute("aria-sort", "ascending");
    expect(shownNames()).toEqual(["Cy", "Ann", "Bo"]);
  });

  it("aNameSortMixesUnrankedRowsIn", () => {
    renderRates(WITH_UNRANKED, "Games");
    press("Player");
    expect(namesAndRanks()).toEqual(["Ann 1.", "Bo", "Cy 2."]);
  });

  it("aCountSortCanPutUnrankedRowsFirst", () => {
    renderRates(WITH_UNRANKED, "Games");
    press("Games");
    expect(screen.getByRole("columnheader", { name: "Games" })).toHaveAttribute("aria-sort", "descending");
    expect(shownNames()).toEqual(["Ann", "Cy", "Bo"]);
    press("Games");
    expect(screen.getByRole("columnheader", { name: "Games" })).toHaveAttribute("aria-sort", "ascending");
    expect(cells()).toEqual([
      ["", "Bo", "—", "3"],
      ["2.", "Cy", "40%", "10"],
      ["1.", "Ann", "62%", "28"],
    ]);
  });

  it("theValueSortsByItsShownFigure", () => {
    // Ann ranks above Bo on the raw values, but both show "52%": under the value, a tie either way.
    renderRates([
      { player: 2, value: 0.52, count: 9 },
      { player: 1, value: 0.524, count: 8 },
      { player: 3, value: 0.3, count: 7 },
    ]);
    expect(cells()).toEqual([
      ["1.", "Ann", "52%"],
      ["2.", "Bo", "52%"],
      ["3.", "Cy", "30%"],
    ]);
    press("Win rate");
    expect(shownNames()).toEqual(["Ann", "Bo", "Cy"]);
    press("Win rate");
    expect(shownNames()).toEqual(["Cy", "Ann", "Bo"]);
  });

  it("allUnrankedSortedByValue", () => {
    // Every row below the minimum: rankRows gives them by count, then name.
    renderRates(
      [
        { player: 1, value: 0.9, count: 3 },
        { player: 2, value: 0.1, count: 4 },
        { player: 3, value: 0.5, count: 2 },
      ],
      "Games"
    );
    expect(shownNames()).toEqual(["Bo", "Ann", "Cy"]);
    press("Win rate");
    expect(shownNames()).toEqual(["Bo", "Ann", "Cy"]);
    press("Win rate");
    expect(shownNames()).toEqual(["Bo", "Ann", "Cy"]);
    expect(cells().map((row) => row[2])).toEqual(["—", "—", "—"]);
  });

  it("aLeftStandingValuePutsItsArrowLast", () => {
    const rows = rankRows([{ player: 1, value: 3, count: 4 }], desc, names, 0);
    const { unmount } = render(
      <RankedTable rows={rows} format={String} names={names} valueHead="Investigations" sortValue={(n) => n} valueEnd={false} />
    );
    const left = head("Investigations");
    expect(left.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(left.firstChild?.textContent).toBe("Investigations");
    expect(left.lastChild?.nodeName.toLowerCase()).toBe("svg");
    expect(left).not.toHaveClass("is-end");
    unmount();

    // By default the value stands at the right, its arrow before its words.
    render(<RankedTable rows={rows} format={String} names={names} valueHead="Times" sortValue={(n) => n} />);
    const right = head("Times");
    expect(right.firstChild?.nodeName.toLowerCase()).toBe("svg");
    expect(right.lastChild?.textContent).toBe("Times");
    expect(right).toHaveClass("is-end");
  });
});
