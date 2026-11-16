import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { outcomeLabel } from "../format";
import type { GameRecord } from "../record";
import { rounds } from "../rounds";
import { makeData, makeRecord } from "../testRecords";
import GamePage from "./GamePage";
import { ev, fiveSeatGame, showcaseGame } from "./sampleGames";

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

  it("a block per round, in order, after the note", () => {
    const record = showcaseGame();
    const { container } = open([record], record.id);
    const blocks = Array.from(container.querySelectorAll("ol.game-rounds > li > .round-block"));
    expect(blocks.map((b) => b.querySelector("h2")!.textContent)).toEqual(
      rounds(record).map((x) => `Round ${x.r}`)
    );
    expect(blocks.length).toBe(record.rounds);
    expect(container.querySelector(".game-page")!.lastElementChild).toBe(container.querySelector("ol.game-rounds"));
  });

  it("a lobby closed during a nomination ends with who had yet to nominate", () => {
    const record = fiveSeatGame(
      [
        ev.nominate(1, 4_000, 0, 1),
        ...[0, 1, 2, 3, 4].map((seat) => ev.vote(1, 5_000 + seat * 100, seat, true)),
        ev.election(1, 6_000, true, 5, 0),
        ev.draw(1, 6_000, 0, "LFF"), ev.discard(1, 9_000, 0, 1, "F"),
        ev.enact(1, 12_000, "L", "chancellor", 1, 1, 0),
        ev.endTerm(1, 15_000, 0, "president"),
        ev.end(2, 615_000, "UNFINISHED"),
      ],
      { id: ID, outcome: "UNFINISHED", winner: null, liberalPolicies: 1, fascistPolicies: 0 }
    );
    const { container } = open([record], ID);
    const blocks = container.querySelectorAll(".round-block");
    expect(blocks).toHaveLength(2);
    const lastBlock = blocks[1];
    expect(lastBlock.textContent).toBe("Round 2P2 had yet to nominate");
    const page = container.querySelector(".game-page")!;
    expect(page.lastElementChild).toHaveTextContent("Unfinished: the lobby closed");
    expect(page.lastElementChild!.previousElementSibling).toBe(container.querySelector("ol.game-rounds"));
  });
});

