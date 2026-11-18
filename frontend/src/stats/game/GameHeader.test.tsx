import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatDuration, formatLocalDateTime, outcomeLabel, plural } from "../format";
import { sampleData } from "../players/testStats";
import { asFormatTwo, makeRecord } from "../testRecords";
import { gameEloChange } from "./gameElo";
import GameHeader from "./GameHeader";
import { fiveSeatGame } from "./sampleGames";

describe("GameHeader", () => {
  it("the result, its first word in the winners' colour", () => {
    const liberal = makeRecord();
    const { container, unmount } = render(<GameHeader record={liberal} />);
    expect(container.querySelector("header.stats-card.game-header")).not.toBeNull();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(outcomeLabel(liberal));
    expect(heading.querySelector(".stats-liberal")).toHaveTextContent(/^Liberals$/);
    expect(heading.querySelector(".stats-fascist")).toBeNull();
    unmount();

    render(<GameHeader record={makeRecord({ outcome: "HITLER_ELECTED", winner: "FASCIST" })} />);
    const fascist = screen.getByRole("heading", { level: 1 });
    expect(fascist).toHaveTextContent("Fascists win · Hitler elected");
    expect(fascist.querySelector(".stats-fascist")).toHaveTextContent(/^Fascists$/);
  });

  it("an unfinished game's result is plain", () => {
    const record = makeRecord({ outcome: "UNFINISHED", winner: null, rounds: 6 });
    render(<GameHeader record={record} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(outcomeLabel(record));
    expect(heading.querySelector(".stats-liberal, .stats-fascist")).toBeNull();
  });

  it("the start, length, rounds and board", () => {
    const record = makeRecord();
    const { container, unmount } = render(<GameHeader record={record} />);
    const facts = container.querySelector("p.game-facts")!;
    expect(facts.textContent).toBe(
      `${formatLocalDateTime(record.startedAt)} · ${formatDuration(38 * 60_000)} · ${plural(9, "round")} · board 5 L, 2 F`
    );
    expect(facts.textContent).toMatch(/ · 9 rounds · board 5 L, 2 F$/);
    unmount();

    const { container: one } = render(<GameHeader record={makeRecord({ rounds: 1 })} />);
    expect(one.querySelector("p.game-facts")!.textContent).toContain(" · 1 round · ");
  });

  it("names the bots' level for a game with bots", () => {
    const facts = (record: Parameters<typeof GameHeader>[0]["record"]) => {
      const { container, unmount } = render(<GameHeader record={record} />);
      const text = container.querySelector("p.game-facts")!.textContent!;
      unmount();
      return text;
    };
    expect(facts(asFormatTwo(fiveSeatGame([]), "HARD"))).toMatch(/ · board 5 L, 2 F · Hard bots$/);
    expect(facts(fiveSeatGame([]))).toMatch(/ · board 5 L, 2 F$/);
    expect(facts(makeRecord())).not.toMatch(/bots/i);
  });

  it("the seats in turn order with their roles", () => {
    const { container } = render(<GameHeader record={fiveSeatGame([])} />);
    const seats = container.querySelector("ol.game-seats")!;
    expect(screen.getByRole("list", { name: "Seats in order:" })).toBe(seats);
    expect(Array.from(seats.children, (li) => li.textContent)).toEqual(["P1", "P2", "P3", "P4 (Hitler)", "Bot 1"]);
    const names = Array.from(seats.querySelectorAll(".player-name"));
    expect(names.map((n) => n.textContent)).toEqual(["P1", "P2", "P3", "P4", "Bot 1"]);
    expect(names[2]).toHaveClass("stats-fascist");
    expect(names[3]).toHaveClass("stats-hitler");
    expect(names[0]).toHaveClass("stats-liberal");
  });

  it("aCountedGameShowsItsEloChange", () => {
    const data = sampleData();
    const g1 = data.games.find((g) => g.id === "g1")!;
    const { container } = render(<GameHeader record={g1} elo={gameEloChange(data, "g1")} />);
    const line = container.querySelector("p.game-elo")!;
    expect(line.textContent).toBe("Elo: Liberals +16 · Fascists −16");
    expect(line.previousElementSibling).toHaveClass("game-facts");
  });

  it("noEloNoLine", () => {
    const record = makeRecord();
    const { container, unmount } = render(<GameHeader record={record} elo={null} />);
    expect(Array.from(container.querySelectorAll("p")).some((p) => p.textContent!.startsWith("Elo:"))).toBe(false);
    unmount();
    const { container: none } = render(<GameHeader record={record} />);
    expect(Array.from(none.querySelectorAll("p")).some((p) => p.textContent!.startsWith("Elo:"))).toBe(false);
  });

  it("seatsLinkToPlayers", () => {
    const data = sampleData();
    const { unmount } = render(<GameHeader record={data.games.find((g) => g.id === "g1")!} />);
    expect(screen.getByRole("link", { name: "Ann" })).toHaveAttribute("href", "/players/1");
    unmount();
    const { container } = render(<GameHeader record={data.games.find((g) => g.id === "cpu")!} />);
    const bot = Array.from(container.querySelectorAll(".game-seats .player-name")).find((n) => n.textContent === "Bot 1")!;
    expect(bot.tagName).toBe("SPAN");
    expect(screen.queryByRole("link", { name: "Bot 1" })).toBeNull();
  });
});
