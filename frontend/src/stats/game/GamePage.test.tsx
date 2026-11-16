import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeData, makeRecord } from "../testRecords";
import GamePage from "./GamePage";

describe("GamePage", () => {
  it("the game's line and its seats", () => {
    const data = makeData([makeRecord()]);
    const { container } = render(<GamePage data={data} route={{ page: "game", id: "game-1" }} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Liberals win · 5 Liberal policies");
    expect(heading.querySelector(".stats-liberal")).toHaveTextContent("Liberals");
    expect(screen.getByText("Sat 14 Nov 2026, 9:42 PM · 38 min · 9 rounds")).toBeInTheDocument();
    const seats = container.querySelector(".game-seats")!;
    expect(seats.textContent).toBe("Seats in order: P1 · P2 · P3 · P4 · P5");
    expect(Array.from(seats.querySelectorAll(".player-name"), (n) => n.className)).toEqual([
      "player-name stats-liberal",
      "player-name stats-liberal",
      "player-name stats-fascist",
      "player-name stats-liberal",
      "player-name stats-hitler",
    ]);
  });

  it("colours a Fascist win and leaves an unfinished game plain", () => {
    const fascist = makeRecord({ id: "f", outcome: "HITLER_ELECTED", winner: "FASCIST" });
    const unfinished = makeRecord({ id: "u", outcome: "UNFINISHED", winner: null, rounds: 6 });
    const data = makeData([fascist, unfinished]);
    const { unmount } = render(<GamePage data={data} route={{ page: "game", id: "f" }} />);
    expect(screen.getByRole("heading", { level: 1 }).querySelector(".stats-fascist")).toHaveTextContent("Fascists");
    unmount();
    render(<GamePage data={data} route={{ page: "game", id: "u" }} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Unfinished after round 6 · 5 L, 2 F");
    expect(heading.querySelector(".stats-liberal, .stats-fascist")).toBeNull();
  });

  it("an unknown game", () => {
    render(<GamePage data={makeData([makeRecord()])} route={{ page: "game", id: "nope" }} />);
    expect(screen.getByText("This game was not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All games" })).toHaveAttribute("href", "/stats/games");
  });
});
