import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { outcomeLabel } from "../format";
import type { GameRecord } from "../record";
import { makeData, makeRecord } from "../testRecords";
import GamePage from "./GamePage";
import { ev, fiveSeatGame } from "./sampleGames";

const ID = "d7809e81-4b1c-4f0a-9c3e-2a5b6c7d8e9f";

/** Renders the page of `id` over `games`. */
function open(games: GameRecord[], id: string) {
  return render(<GamePage data={makeData(games)} route={{ page: "game", id }} />);
}

describe("GamePage", () => {
  it("a known game shows its header", () => {
    const record = makeRecord({ id: ID });
    const { container } = open([makeRecord({ id: "other" }), record], ID);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(outcomeLabel(record));
    expect(container.querySelector("header.game-header")).not.toBeNull();
    expect(screen.queryByText("This game was not found.")).toBeNull();
  });

  it.each([
    ["an unknown id", "nope"],
    ["a prefix of a real id", ID.slice(0, 8)],
    ["the id in capitals", ID.toUpperCase()],
    ["a decoded escape", "…"],
  ])("%s is not found", (_what, id) => {
    open([makeRecord({ id: ID })], id);
    expect(screen.getByText("This game was not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All games" })).toHaveAttribute("href", "/stats/games");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("says when the first rounds were not recorded", () => {
    const late = fiveSeatGame([ev.restored(3, 0), ev.nominate(3, 4_000, 2, 3), ev.end(3, 600_000, "UNFINISHED")], {
      id: ID, complete: false, outcome: "UNFINISHED", winner: null,
    });
    const { container, unmount } = open([late], ID);
    const note = screen.getByText("The first rounds of this game were not recorded.");
    expect(note).toHaveClass("game-note");
    expect(container.querySelector("header.game-header")!.nextElementSibling).toBe(note);
    unmount();

    open([makeRecord({ id: ID })], ID);
    expect(screen.queryByText("The first rounds of this game were not recorded.")).toBeNull();
  });

  it("an unfinished game ends with the lobby closing", () => {
    const { container, unmount } = open([makeRecord({ id: ID, outcome: "UNFINISHED", winner: null })], ID);
    const line = screen.getByText("Unfinished: the lobby closed");
    expect(line).toHaveClass("game-note");
    expect(container.querySelector(".game-page")!.lastElementChild).toBe(line);
    unmount();

    open([makeRecord({ id: ID })], ID);
    expect(screen.queryByText("Unfinished: the lobby closed")).toBeNull();
  });

  it("a late record with no round played says only what it knows", () => {
    const record = fiveSeatGame([ev.restored(3, 0), ev.end(3, 600_000, "UNFINISHED")], {
      id: ID, complete: false, outcome: "UNFINISHED", winner: null,
    });
    const { container } = open([record], ID);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(outcomeLabel(record));
    expect(screen.getByText("The first rounds of this game were not recorded.")).toBeInTheDocument();
    expect(screen.getByText("Unfinished: the lobby closed")).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it("a finished game with no rounds shows its header alone", () => {
    const { container } = open([makeRecord({ id: ID })], ID);
    const page = container.querySelector(".game-page")!;
    expect(Array.from(page.children, (child) => child.tagName.toLowerCase())).toEqual(["header"]);
  });
});
