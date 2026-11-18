import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { playerColumn, rankColumn, SortHeadRow, useTableSort, type HeadColumn } from "./SortHead";
import { RANK_ORDER } from "./sorting";

interface TestRow {
  player: number;
  name: string;
  games: number;
  rank: number | null;
}

type Key = "rank" | "name" | "games";

const COLUMNS: readonly HeadColumn<TestRow, Key>[] = [
  rankColumn<TestRow>((row) => row.rank),
  playerColumn<TestRow>((row) => row.name),
  { key: "games", label: "Games", className: "games", end: true, first: "descending", value: (row) => row.games },
];

/** Rows out of rank order, so the opening sort has something to do: Bo is unranked. */
const ROWS: readonly TestRow[] = [
  { player: 1, name: "Cy", games: 4, rank: 2 },
  { player: 3, name: "Bo", games: 2, rank: null },
  { player: 2, name: "Ann", games: 9, rank: 1 },
  { player: 4, name: "Di", games: 6, rank: 3 },
];

/** A small sortable table: the heads over the rows `useTableSort` gives, each name a link. */
function Harness(props: { rows: readonly TestRow[] }): JSX.Element {
  const { rows, sort, press } = useTableSort(props.rows, COLUMNS, RANK_ORDER);
  return (
    <table>
      <SortHeadRow columns={COLUMNS} sort={sort} onSort={press} />
      <tbody>
        {rows.map((row) => (
          <tr key={row.player}>
            <td>{row.rank ?? ""}</td>
            <td>
              <a href={`/players/${row.player}`}>{row.name}</a>
            </td>
            <td>{row.games}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The names down the table, in order. */
const shownNames = () => screen.getAllByRole("link").map((link) => link.textContent);
/** A head's button, by its accessible name. */
const head = (name: string) => screen.getByRole("button", { name });
/** The `aria-sort` of every column head that has one, by its accessible name's head. */
const sortedHeads = () =>
  Object.fromEntries(
    screen
      .getAllByRole("columnheader")
      .filter((th) => th.hasAttribute("aria-sort"))
      .map((th) => [within(th).getByRole("button").getAttribute("aria-label") ?? th.textContent, th.getAttribute("aria-sort")])
  );
/** The class Lucide gives the arrow in the head named `name`. */
const arrowOf = (name: string) => {
  const svg = head(name).querySelector("svg");
  expect(svg).not.toBeNull();
  return ["lucide-arrow-up-down", "lucide-arrow-up", "lucide-arrow-down"].find((c) => svg!.classList.contains(c));
};

describe("SortHead", () => {
  it("opensInTheOpeningOrderWithItsHeadMarked", () => {
    render(<Harness rows={ROWS} />);
    expect(shownNames()).toEqual(["Ann", "Cy", "Di", "Bo"]);
    expect(screen.getByRole("columnheader", { name: "Rank" })).toHaveAttribute("aria-sort", "ascending");
    expect(sortedHeads()).toEqual({ Rank: "ascending" });
    expect(head("Rank")).toHaveClass("stats-sort", "is-sorted");
    expect(head("Games")).toHaveClass("stats-sort");
    expect(head("Games")).not.toHaveClass("is-sorted");
  });

  it("aPressSortsAndASecondTurnsItRound", () => {
    render(<Harness rows={ROWS} />);
    fireEvent.click(head("Games"));
    expect(shownNames()).toEqual(["Ann", "Di", "Cy", "Bo"]);
    expect(sortedHeads()).toEqual({ Games: "descending" });
    fireEvent.click(head("Games"));
    expect(shownNames()).toEqual(["Bo", "Cy", "Di", "Ann"]);
    expect(sortedHeads()).toEqual({ Games: "ascending" });
    fireEvent.click(head("Player"));
    expect(shownNames()).toEqual(["Ann", "Bo", "Cy", "Di"]);
    expect(sortedHeads()).toEqual({ Player: "ascending" });
  });

  it("arrowsShowTheSort", () => {
    render(<Harness rows={ROWS} />);
    expect([arrowOf("Rank"), arrowOf("Player"), arrowOf("Games")]).toEqual([
      "lucide-arrow-up",
      "lucide-arrow-up-down",
      "lucide-arrow-up-down",
    ]);
    fireEvent.click(head("Games"));
    expect([arrowOf("Rank"), arrowOf("Player"), arrowOf("Games")]).toEqual([
      "lucide-arrow-up-down",
      "lucide-arrow-up-down",
      "lucide-arrow-down",
    ]);
    fireEvent.click(head("Games"));
    expect(arrowOf("Games")).toBe("lucide-arrow-up");
    expect(head("Games").querySelector("svg")).toHaveClass("stats-sort-arrow");
    expect(head("Games").querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("theRankHeadIsNamedRank", () => {
    render(<Harness rows={ROWS} />);
    const rank = screen.getByRole("columnheader", { name: "Rank" });
    expect(rank).toHaveAttribute("scope", "col");
    expect(rank).toHaveClass("ranked-rank");
    const button = within(rank).getByRole("button");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAccessibleName("Rank");
    expect(button.textContent).toBe("#");
    expect(screen.getByRole("columnheader", { name: "Player" })).toHaveClass("ranked-name");
  });

  it("anEndColumnPutsItsArrowFirst", () => {
    render(<Harness rows={ROWS} />);
    // The words are a bare text node beside the arrow, never in an element of their own.
    const games = head("Games");
    expect(games).toHaveClass("is-end");
    expect(Array.from(games.childNodes).map((node) => node.nodeName)).toEqual(["svg", "#text"]);
    expect(games.lastChild!.textContent).toBe("Games");
    const player = head("Player");
    expect(player).not.toHaveClass("is-end");
    expect(Array.from(player.childNodes).map((node) => node.nodeName)).toEqual(["#text", "svg"]);
    expect(player.firstChild!.textContent).toBe("Player");
    expect(Array.from(head("Rank").childNodes).map((node) => node.nodeName)).toEqual(["svg", "#text"]);
  });

  it("unrankedRowsStayLastUnderTheRankEitherWay", () => {
    render(<Harness rows={ROWS} />);
    expect(shownNames()).toEqual(["Ann", "Cy", "Di", "Bo"]);
    fireEvent.click(head("Rank"));
    expect(sortedHeads()).toEqual({ Rank: "descending" });
    expect(shownNames()).toEqual(["Di", "Cy", "Ann", "Bo"]);
  });

  it("aSortSurvivesNewRows", () => {
    const { rerender } = render(<Harness rows={ROWS} />);
    fireEvent.click(head("Games"));
    expect(shownNames()).toEqual(["Ann", "Di", "Cy", "Bo"]);
    // Cy leaves the rows and Ed joins them, as a filter chip or the CPU switch would do.
    const next = [...ROWS.filter((row) => row.name !== "Cy"), { player: 5, name: "Ed", games: 7, rank: 2 }];
    rerender(<Harness rows={next} />);
    expect(sortedHeads()).toEqual({ Games: "descending" });
    expect(shownNames()).toEqual(["Ann", "Ed", "Di", "Bo"]);
    expect(screen.getAllByRole("row")).toHaveLength(5);
  });

  it("theFocusStaysOnThePressedHead", () => {
    render(<Harness rows={ROWS} />);
    const games = head("Games");
    games.focus();
    fireEvent.click(games);
    expect(shownNames()).toEqual(["Ann", "Di", "Cy", "Bo"]);
    expect(head("Games")).toBe(games);
    expect(document.activeElement).toBe(games);
  });

  it("noLinkSitsInAHead", () => {
    const { container } = render(<Harness rows={ROWS} />);
    expect(container.querySelectorAll("td a").length).toBe(ROWS.length);
    expect(container.querySelectorAll("th a, button a")).toHaveLength(0);
  });
});
