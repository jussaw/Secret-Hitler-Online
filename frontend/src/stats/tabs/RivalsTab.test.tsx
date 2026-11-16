import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_GAMES } from "../StatCard";
import { beats, nominated, played, repeat, statsOf, together } from "../testRivals";
import { RivalsTab } from "./RivalsTab";

const TITLES = [
  "Best duo",
  "Best Fascist duo",
  "Closest rivalry",
  "Most lopsided rivalry",
  "Teammates",
  "Opponents",
  "People",
  "Who trusts whom",
];

/**
 * Ann and Bo 4 of 5 together; Ann 3–2 Cy on opposite sides, and one game together. Every one has
 * CPU seats, so the tests count them with the CPU toggle on.
 */
const GAMES = [
  ...repeat(4, () => together(1, 2, "LIBERAL", true)),
  together(1, 2, "LIBERAL", false),
  ...repeat(3, () => beats(1, 3)),
  ...repeat(2, () => beats(3, 1)),
  together(1, 3, "LIBERAL", true),
];

/** The cells' texts of the row whose header reads `name`, in the region `label`. */
function rowCells(label: string, name: string): HTMLElement[] {
  const region = screen.getByRole("region", { name: label });
  const row = within(region)
    .getAllByRole("row")
    .find((r) => within(r).queryByRole("rowheader")?.textContent === name);
  if (!row) throw new Error(`no row ${name} in ${label}`);
  return within(row).getAllByRole("cell");
}
const texts = (cells: HTMLElement[]) => cells.map((c) => c.textContent);

describe("RivalsTab", () => {
  it("shows every card", () => {
    render(<RivalsTab stats={statsOf(GAMES, true)} />);
    for (const title of TITLES) expect(screen.getByRole("region", { name: title })).toBeInTheDocument();
    const cards = Array.from(document.querySelectorAll("section")).map((s) => s.querySelector("h3")!.textContent);
    expect(cards).toEqual(TITLES);
  });

  it("shows the best duo and the rivalries", () => {
    render(<RivalsTab stats={statsOf(GAMES, true)} />);
    expect(screen.getByText("80% · won 4 of 5").previousElementSibling).toHaveTextContent("Ann & Bo");
    expect(Array.from(document.querySelectorAll(".rivals-headline"), (h) => h.textContent)).toEqual([
      "Ann & Bo",
      "Ann 3–2 Cy",
      "Ann 3–2 Cy",
    ]);
    expect(within(screen.getByRole("region", { name: "Closest rivalry" })).getByText("5 games")).toHaveClass("rivals-figure");
    expect(screen.getByText("No pair has 5 games together on the Fascist side yet.")).toBeInTheDocument();
  });

  it("puts the winner of a rivalry first, and an even one by name", () => {
    render(<RivalsTab stats={statsOf([...repeat(3, () => beats(4, 2)), ...repeat(3, () => beats(2, 4)), ...repeat(5, () => beats(5, 3))], true)} />);
    const headline = (title: string) => within(screen.getByRole("region", { name: title })).getByText(/–/).textContent;
    expect(headline("Closest rivalry")).toBe("Bo 3–3 Di");
    expect(headline("Most lopsided rivalry")).toBe("Ed 5–0 Cy");
  });

  it("reads the opponents matrix as row against column", () => {
    render(<RivalsTab stats={statsOf(GAMES, true)} />);
    const ann = rowCells("Opponents table", "Ann");
    expect(texts(ann)).toEqual(["", "", "3–2"]);
    expect(ann[2]).toHaveAttribute("title", "Ann against Cy: won 3, lost 2");
    expect(ann[2]).toHaveClass("is-ahead");
    const cy = rowCells("Opponents table", "Cy");
    expect(texts(cy)).toEqual(["2–3", "", ""]);
    expect(cy[0]).toHaveClass("is-behind");
  });

  it("shows a dash for teammates under 5 games together", () => {
    render(<RivalsTab stats={statsOf(GAMES, true)} />);
    const ann = rowCells("Teammates table", "Ann");
    expect(texts(ann)).toEqual(["", "80%5", "—1"]);
    expect(ann[1]).toHaveAttribute("title", "Ann and Bo: won 4 of 5 together");
  });

  it("lists each player's people", () => {
    render(<RivalsTab stats={statsOf(GAMES, true)} />);
    const region = screen.getByRole("region", { name: "People table" });
    expect(within(region).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Player",
      "Most played with",
      "Nemesis",
      "Favourite opponent",
    ]);
    expect(texts(rowCells("People table", "Ann"))).toEqual(["Cy · 6 games", "Cy · lost 2", "Cy · won 3"]);
    expect(texts(rowCells("People table", "Bo"))).toEqual(["Ann · 5 games", "—", "—"]);
    expect(texts(rowCells("People table", "Cy"))).toEqual(["Ann · 6 games", "Ann · lost 3", "Ann · won 2"]);
  });

  it("counts who nominated whom", () => {
    const game = played([[1, "LIBERAL"], [2, "LIBERAL"], [3, "FASCIST"], [null, "LIBERAL"], [null, "HITLER"]], "LIBERAL", [
      ...nominated(1, 0, 1, true),
      ...nominated(2, 1, 0, false),
      ...nominated(3, 0, 1, false),
    ]);
    render(<RivalsTab stats={statsOf([game], true)} />);
    const ann = rowCells("Who trusts whom table", "Ann");
    expect(texts(ann)).toEqual(["", "2", ""]);
    expect(ann[1]).toHaveAttribute("title", "Ann nominated Bo 2 times");
    const bo = rowCells("Who trusts whom table", "Bo");
    expect(texts(bo)).toEqual(["1", "", ""]);
    expect(bo[0]).toHaveAttribute("title", "Bo nominated Ann once");
  });

  it("says so without counted games", () => {
    render(<RivalsTab stats={statsOf([])} />);
    for (const title of TITLES) expect(screen.getByRole("region", { name: title })).toHaveTextContent(NO_GAMES);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a lone player gets notes, not tables", () => {
    render(
      <RivalsTab
        stats={statsOf(
          [played([[1, "LIBERAL"], [null, "LIBERAL"], [null, "LIBERAL"], [null, "FASCIST"], [null, "HITLER"]], "LIBERAL")],
          true
        )}
      />
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByText("No two players have shared a game yet.")).toHaveLength(4);
    expect(screen.getAllByText("No pair has 5 games on the same side yet.")).toHaveLength(1);
    expect(screen.getAllByText("No pair has 5 games on opposite sides yet.")).toHaveLength(2);
  });

  it("says so where no two players were on a side, or nominated each other", () => {
    const { unmount } = render(<RivalsTab stats={statsOf([beats(1, 2)], true)} />);
    expect(screen.getByRole("region", { name: "Teammates" })).toHaveTextContent("No two players have been on the same side yet.");
    expect(screen.getByRole("region", { name: "Who trusts whom" })).toHaveTextContent("No player has nominated another yet.");
    expect(screen.getByRole("region", { name: "Opponents table" })).toBeInTheDocument();
    unmount();
    render(<RivalsTab stats={statsOf([together(1, 2, "FASCIST", true)], true)} />);
    expect(screen.getByRole("region", { name: "Opponents" })).toHaveTextContent("No two players have been on opposite sides yet.");
    expect(screen.getByRole("region", { name: "Teammates table" })).toBeInTheDocument();
  });

  it("shows no CPU seat in any table", () => {
    render(<RivalsTab stats={statsOf(GAMES, true)} />);
    for (const label of ["Teammates table", "Opponents table", "People table"]) {
      const region = screen.getByRole("region", { name: label });
      expect(region).not.toHaveTextContent(/Bot/);
      expect(within(region).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Ann", "Bo", "Cy"]);
    }
  });
});
