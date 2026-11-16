import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerMatrix } from "./PlayerMatrix";

const NAMES = new Map([
  [1, "Ann"],
  [2, "Bo"],
  [3, "Cy"],
]);

describe("PlayerMatrix", () => {
  it("draws a row and a column per player in its card's scroll region, the diagonal blank", () => {
    render(
      <PlayerMatrix
        title="Opponents"
        players={[1, 2, 3]}
        names={NAMES}
        cell={(r, c) => (r === 3 ? null : { text: `${r}:${c}`, sub: "x", title: `t${r}${c}`, tone: r < c ? "ahead" : "behind" })}
      />
    );
    const region = screen.getByRole("region", { name: "Opponents table" });
    expect(within(region).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Ann", "Bo", "Cy"]);
    expect(within(region).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Ann", "Bo", "Cy"]);
    const rows = within(region).getAllByRole("row");
    const ann = within(rows[1]).getAllByRole("cell");
    expect(ann.map((c) => c.textContent)).toEqual(["", "1:2x", "1:3x"]);
    expect(ann[0]).toHaveClass("is-self");
    expect(ann[1]).toHaveAttribute("title", "t12");
    expect(ann[1]).toHaveClass("is-ahead");
    expect(within(rows[2]).getAllByRole("cell")[0]).toHaveClass("is-behind");
    expect(within(rows[3]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["", "", ""]);
  });

  it("puts each name in a box that lets a long one wrap", () => {
    render(<PlayerMatrix title="Opponents" players={[1, 2]} names={NAMES} cell={() => null} />);
    const heads = [...screen.getAllByRole("columnheader"), ...screen.getAllByRole("rowheader")];
    for (const head of heads) {
      expect(head.firstElementChild).toHaveClass("player-matrix-name");
      expect(head.querySelector(".player-matrix-name > .player-name")).not.toBeNull();
    }
  });

  it("never asks for the diagonal, and shows a cell's sub on its own", () => {
    const asked: [number, number][] = [];
    render(
      <PlayerMatrix
        title="Teammates"
        players={[2, 1]}
        names={NAMES}
        cell={(r, c) => {
          asked.push([r, c]);
          return { text: "80%", sub: "5", title: "" };
        }}
      />
    );
    expect(asked).toEqual([
      [2, 1],
      [1, 2],
    ]);
    const table = within(screen.getByRole("region", { name: "Teammates table" })).getByRole("table");
    expect(table).toHaveClass("player-matrix");
    const cell = within(within(table).getAllByRole("row")[1]).getAllByRole("cell")[1];
    expect(cell.querySelector(".player-matrix-sub")).toHaveTextContent("5");
    expect(cell).not.toHaveClass("is-ahead");
    expect(cell).not.toHaveClass("is-behind");
  });
});
