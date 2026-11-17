import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRecord, Role } from "../record";
import { makeData, makeRecord, makeSeats } from "../testRecords";
import GamesPage from "./GamesPage";

const FIVE: Role[] = ["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER"];
const SEVEN: Role[] = ["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER", "LIBERAL", "FASCIST"];
const HOUR = 60 * 60 * 1000;
const START = new Date(2026, 9, 1, 12, 0).getTime();

/**
 * Game `i` of 45, `g01` to `g45`, an hour apart: every third has seven seats, every fourth a CPU
 * seat at the end, every tenth is unfinished; the seats go round players 1 to 8.
 */
function game(i: number): GameRecord {
  const roles = i % 3 === 0 ? SEVEN : FIVE;
  const players: (number | null)[] = roles.map((_, s) => ((i + s) % 8) + 1);
  const cpu = i % 4 === 0;
  if (cpu) players[players.length - 1] = null;
  const startedAt = START + i * HOUR;
  return makeRecord({
    id: `g${String(i).padStart(2, "0")}`,
    startedAt,
    endedAt: startedAt + 30 * 60_000,
    seats: makeSeats(roles, players),
    hasCpu: cpu,
    ...(i % 10 === 0 ? { outcome: "UNFINISHED", winner: null, rounds: 6 } : {}),
  });
}

const DATA = makeData(Array.from({ length: 45 }, (_, i) => game(i + 1)));

/** Renders GAMES at `/games<search>`, in place of anything rendered before. */
function open(search = "", data = DATA) {
  cleanup();
  history.pushState(null, "", `/games${search}`);
  return render(<GamesPage data={data} route={{ page: "games" }} />);
}

/** The ids of the rows shown, in order, from their links. */
function rowIds(): string[] {
  return Array.from(document.querySelectorAll(".games-row-link"), (a) => a.getAttribute("href")!.split("/").pop()!);
}

const ids = (from: number, to: number) => {
  const out: string[] = [];
  for (let i = from; from <= to ? i <= to : i >= to; i += from <= to ? 1 : -1) out.push(`g${String(i).padStart(2, "0")}`);
  return out;
};

const address = () => location.pathname + location.search;

describe("GamesPage", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("twenty newest first", () => {
    open();
    expect(rowIds()).toEqual(ids(45, 26));
    expect(screen.getByText("45 games recorded · showing 1–20")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveAttribute("role", "list"); // kept by Safari without bullets
    const pages = screen.getByRole("navigation", { name: "Pages" });
    // On the first page Previous is a disabled link: no address to go to.
    const previous = within(pages).getByRole("link", { name: "‹ Previous" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(previous).not.toHaveAttribute("href");
    expect(previous.tagName).toBe("SPAN");
    expect(within(pages).getByRole("link", { name: "Next ›" })).toHaveAttribute("href", "/games?page=2");
    expect(within(pages).getByText("1")).toHaveAttribute("aria-current", "page");
    expect(within(pages).getByRole("link", { name: "2" })).toHaveAttribute("href", "/games?page=2");
    expect(within(pages).getByRole("link", { name: "3" })).toHaveAttribute("href", "/games?page=3");
  });

  it("the last page", () => {
    open("?page=3");
    expect(rowIds()).toEqual(ids(5, 1));
    expect(screen.getByText("45 games recorded · showing 41–45")).toBeInTheDocument();
    const pages = screen.getByRole("navigation", { name: "Pages" });
    const next = within(pages).getByRole("link", { name: "Next ›" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("href");
    expect(within(pages).getByRole("link", { name: "‹ Previous" })).toHaveAttribute("href", "/games?page=2");
    expect(within(pages).getByRole("link", { name: "1" })).toHaveAttribute("href", "/games");
  });

  it("a page past the last shows the last", () => {
    open("?page=99");
    expect(rowIds()).toEqual(ids(5, 1));
    expect(screen.getByText("45 games recorded · showing 41–45")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Pages" })).getByText("3")).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("50 a page", () => {
    open();
    const per = screen.getByRole("combobox", { name: "Games a page" });
    expect(within(per).getAllByRole("option").map((o) => o.textContent)).toEqual(["20 a page", "50 a page", "100 a page"]);
    fireEvent.change(per, { target: { value: "50" } });
    expect(address()).toBe("/games?per=50");
    expect(rowIds()).toEqual(ids(45, 1));
    expect(screen.getByText("45 games recorded · showing 1–45")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Games a page" })).toHaveValue("50");
  });

  it("adding and removing a player", () => {
    open();
    const add = screen.getByRole("combobox", { name: "Add a player" });
    const options = within(add).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Add a player", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
    fireEvent.change(add, { target: { value: "3" } });
    expect(address()).toBe("/games?players=3");
    expect(screen.getByRole("combobox", { name: "Add a player" })).toHaveValue("");
    expect(within(screen.getByRole("combobox", { name: "Add a player" })).queryByText("P3")).toBeNull();
    for (const id of rowIds()) {
      const record = DATA.games.find((g) => g.id === id)!;
      expect(record.seats.some((s) => s.player === 3), `${id} seats player 3`).toBe(true);
    }
    fireEvent.change(screen.getByRole("combobox", { name: "Add a player" }), { target: { value: "1" } });
    expect(address()).toBe("/games?players=1,3");
    fireEvent.click(screen.getByRole("button", { name: "Remove P1" }));
    expect(address()).toBe("/games?players=3");
    fireEvent.click(screen.getByRole("button", { name: "Remove P3" }));
    expect(address()).toBe("/games");
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });

  it("every filter goes back to page 1", () => {
    open("?page=2");
    fireEvent.change(screen.getByRole("combobox", { name: "Seats" }), { target: { value: "7" } });
    expect(address()).toBe("/games?size=7");
    expect(screen.getByRole("combobox", { name: "Seats" })).toHaveValue("7");
    expect(screen.getByText("45 games recorded · 15 match · showing 1–15")).toBeInTheDocument();

    open("?size=7&page=2");
    fireEvent.change(screen.getByRole("combobox", { name: "Ending" }), { target: { value: "unfinished" } });
    expect(address()).toBe("/games?size=7&ending=unfinished");
  });

  it("dates, ending and Bots", () => {
    open();
    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    // Leaving a field puts its day in the address at once.
    fireEvent.change(from, { target: { value: "2026-10-02" } });
    fireEvent.blur(from);
    expect(address()).toBe("/games?from=2026-10-02");
    expect(screen.getByLabelText("To")).toHaveAttribute("min", "2026-10-02");
    fireEvent.change(to, { target: { value: "2026-10-02" } });
    fireEvent.keyDown(to, { key: "Enter" });
    expect(address()).toBe("/games?from=2026-10-02&to=2026-10-02");
    expect(screen.getByLabelText("From")).toHaveAttribute("max", "2026-10-02");
    expect(screen.getByText("45 games recorded · 24 match · showing 1–20")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText("From"));
    expect(address()).toBe("/games?to=2026-10-02");

    open();
    const ending = screen.getByRole("combobox", { name: "Ending" });
    expect(within(ending).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Any ending",
      "Liberal policies",
      "Hitler executed",
      "Fascist policies",
      "Hitler elected",
      "Unfinished",
    ]);
    fireEvent.change(ending, { target: { value: "unfinished" } });
    expect(address()).toBe("/games?ending=unfinished");
    expect(rowIds()).toEqual(["g40", "g30", "g20", "g10"]);

    const cpu = screen.getByRole("combobox", { name: "Bots" });
    expect(within(cpu).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "With or without Bots",
      "Without Bots",
      "With Bots",
    ]);
    fireEvent.change(cpu, { target: { value: "with" } });
    expect(address()).toBe("/games?ending=unfinished&cpu=with");
    expect(rowIds()).toEqual(["g40", "g20"]);

    const seats = screen.getByRole("combobox", { name: "Seats" });
    expect(within(seats).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Any size",
      "5 seats",
      "6 seats",
      "7 seats",
      "8 seats",
      "9 seats",
      "10 seats",
    ]);
  });

  it("a day typed part by part is one step back", () => {
    vi.useFakeTimers();
    try {
      open();
      const pushes = vi.spyOn(history, "pushState");
      const from = screen.getByLabelText("From");
      // A date field reports each part as it is typed: the 1st, then the 14th, then a year being typed.
      for (const day of ["2026-10-01", "2026-10-14", "0002-10-14", "0020-10-14", "2025-10-14"]) {
        fireEvent.change(from, { target: { value: day } });
        act(() => vi.advanceTimersByTime(200));
      }
      expect(pushes).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1000));
      expect(pushes).toHaveBeenCalledTimes(1);
      expect(address()).toBe("/games?from=2025-10-14");
      expect(screen.getByLabelText("From")).toHaveValue("2025-10-14");

      // A year left half typed is not put in the address, and leaving the field shows the address's day.
      fireEvent.change(from, { target: { value: "0202-10-14" } });
      act(() => vi.advanceTimersByTime(2000));
      expect(pushes).toHaveBeenCalledTimes(1);
      fireEvent.blur(from);
      expect(screen.getByLabelText("From")).toHaveValue("2025-10-14");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Clear filters keeps the page size", () => {
    open("?size=7&per=50&page=2");
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/games?per=50");
  });

  it("an unknown player in the address is ignored", () => {
    open("?players=99");
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(screen.getByText("45 games recorded · showing 1–20")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Add a player" }), { target: { value: "2" } });
    expect(address()).toBe("/games?players=2");
  });

  it("junk in the address reads as the defaults", () => {
    open("?players=abc,-1&from=2026-02-30&size=11&ending=draw&cpu=yes&per=7&page=x");
    expect(rowIds()).toEqual(ids(45, 26));
    expect(screen.getByText("45 games recorded · showing 1–20")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Seats" })).toHaveValue("");
    expect(screen.getByLabelText("From")).toHaveValue("");
  });

  it("nothing matches", () => {
    open("?size=10");
    expect(screen.getByText("No games match these filters.")).toBeInTheDocument();
    expect(screen.getByText("45 games recorded · none match")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
    const clear = screen.getByRole("link", { name: "Clear filters" });
    expect(clear).toHaveAttribute("href", "/games");
    fireEvent.click(clear);
    expect(address()).toBe("/games");
    expect(rowIds()).toEqual(ids(45, 26));
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });

  it("no games at all", () => {
    open("", makeData([]));
    expect(screen.getByText("No games recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("No games match these filters.")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });

  it("a new page brings the list into view, a filter keeps the scroll", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    open();
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Next ›" }));
    expect(address()).toBe("/games?page=2");
    expect(rowIds()).toEqual(ids(25, 6));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).not.toHaveBeenCalled();

    scrollIntoView.mockClear();
    fireEvent.change(screen.getByRole("combobox", { name: "Seats" }), { target: { value: "7" } });
    expect(address()).toBe("/games?size=7");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
