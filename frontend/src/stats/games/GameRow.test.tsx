import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GameRecord } from "../record";
import { makeRecord, makeSeats } from "../testRecords";
import GameRow from "./GameRow";

const SEVEN = makeSeats(["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER", "LIBERAL", "FASCIST"]);

function renderRow(record: GameRecord): HTMLLIElement {
  const { container } = render(
    <ol>
      <GameRow record={record} />
    </ol>
  );
  return container.querySelector("li.games-row")!;
}

describe("GameRow", () => {
  it("shows a finished game", () => {
    const row = renderRow(makeRecord({ seats: SEVEN, rounds: 11 }));
    const link = screen.getByRole("link", { name: "Sat 14 Nov 2026, 9:42 PM · Liberals win · 5 Liberal policies" });
    expect(link).toHaveAttribute("href", "/stats/games/game-1");
    expect(link).toHaveClass("games-row-link");
    expect(row).toHaveTextContent("9:42 PM · 38 min");
    expect(row).toHaveTextContent("7 seats");
    expect(row).toHaveTextContent("11 rounds");
    expect(screen.getByText("Liberals")).toHaveClass("stats-liberal");
    expect(row.querySelector(".games-row-seats")).toHaveTextContent(/^P1 · P2 · P3 · P4 · P5 · P6 · P7$/);
    const names = Array.from(row.querySelectorAll(".games-row-seats .player-name"));
    expect(names.map((n) => n.textContent)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
    expect(names[4]).toHaveClass("stats-hitler");
    expect(names[0]).toHaveClass("stats-liberal");
    expect(names[2]).toHaveClass("stats-fascist");
    expect(row).not.toHaveTextContent("CPU");
  });

  it("tags a CPU game and reads an unfinished one", () => {
    const cpu = renderRow(
      makeRecord({
        id: "bots",
        outcome: "HITLER_ELECTED",
        winner: "FASCIST",
        hasCpu: true,
        seats: makeSeats(["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER"], [1, 2, null, 4, null]),
      })
    );
    expect(cpu.querySelector(".games-row-link")).toHaveTextContent("CPU");
    expect(cpu.querySelector(".games-row-link")).toHaveAccessibleName(
      "Sat 14 Nov 2026, 9:42 PM · Fascists win · Hitler elected · with Bots"
    );
    // A CPU seat's name is plain text; a player's is a link to their page.
    const seatLinks = Array.from(cpu.querySelectorAll(".games-row-seats a.player-link"));
    expect(seatLinks.map((a) => a.textContent)).toEqual(["P1", "P2", "P4"]);
    expect(screen.getByText("Fascists")).toHaveClass("stats-fascist");
    expect(cpu.querySelector(".games-row-seats")).toHaveTextContent(/^P1 · P2 · Bot 1 · P4 · Bot 2$/);
    cleanup();

    const unfinished = renderRow(
      makeRecord({
        id: "closed",
        outcome: "UNFINISHED",
        winner: null,
        rounds: 6,
        liberalPolicies: 4,
        fascistPolicies: 3,
      })
    );
    const result = unfinished.querySelector(".games-row-result")!;
    expect(result).toHaveTextContent(/^Unfinished after round 6 · 4 L, 3 F$/);
    expect(result.querySelector(".stats-liberal, .stats-fascist")).toBeNull();
    expect(unfinished).not.toHaveTextContent("CPU");
    expect(unfinished).toHaveTextContent("6 rounds");
  });

  it("one link to the game, and no name inside it; each name a link of its own", () => {
    const row = renderRow(makeRecord({ seats: SEVEN }));
    const links = row.querySelectorAll("a.games-row-link");
    expect(links.length).toBe(1);
    expect(links[0]).toHaveTextContent("Sat 14 Nov 2026");
    expect(links[0]).toHaveTextContent("Liberals win · 5 Liberal policies");
    expect(links[0].querySelector(".player-name")).toBeNull();
    expect(links[0]).not.toHaveTextContent("9:42 PM");
    // The seats sit above the link's stretched area, so the names are links of their own (Phase 22A).
    expect(row.querySelector(".games-row-seats")!.closest("a")).toBeNull();
    const names = Array.from(row.querySelectorAll(".games-row-seats a.player-link"));
    expect(names.map((a) => a.getAttribute("href"))).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `/stats/players/${n}`));
    expect(row.querySelectorAll("a a")).toHaveLength(0);
  });
});
