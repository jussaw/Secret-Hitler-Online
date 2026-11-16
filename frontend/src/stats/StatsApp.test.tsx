import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStatsDataForTests, STATS_LOAD_ERROR } from "./api";
import { formatLocalDateTime, outcomeLabel } from "./format";
import StatsApp from "./StatsApp";
import { makeData, makeRecord } from "./testRecords";

const HOUR = 60 * 60 * 1000;
const start = new Date(2026, 10, 1, 20, 0).getTime();
/** 25 games, g01 to g25, an hour apart, oldest first. */
const games = Array.from({ length: 25 }, (_, i) =>
  makeRecord({
    id: `g${String(i + 1).padStart(2, "0")}`,
    startedAt: start + i * HOUR,
    endedAt: start + i * HOUR + 30 * 60_000,
    ...(i % 2 === 1 ? { outcome: "HITLER_ELECTED" as const, winner: "FASCIST" as const } : {}),
  })
);
const data = makeData(games);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(...answers: Response[]) {
  const fn = vi.fn();
  for (const answer of answers) fn.mockResolvedValueOnce(answer);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function openAt(path: string) {
  history.replaceState(null, "", path);
  return render(<StatsApp />);
}

const nav = () => within(screen.getByRole("navigation", { name: "Stats pages" }));
/** The newest game's link among the latest games, once they are shown. */
const newestLink = () =>
  screen.findByRole("link", { name: `${formatLocalDateTime(games[24].startedAt)} · ${outcomeLabel(games[24])}` });

describe("StatsApp", () => {
  beforeEach(() => {
    resetStatsDataForTests();
    vi.stubGlobal("scrollTo", vi.fn());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("the header and a loading line until the games come", async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (answer = r)))
    );
    openAt("/stats");
    expect(screen.getByRole("banner")).toHaveTextContent("SECRET-HITLER");
    expect(screen.getByRole("status")).toHaveTextContent("Loading the games…");
    await act(async () => answer(json(data)));
    expect(await screen.findByText("LATEST GAMES")).toBeInTheDocument();
    expect(screen.queryByText("Loading the games…")).toBeNull();
  });

  it("a game from the latest games, and back", async () => {
    stubFetch(json(data));
    openAt("/stats");
    const newest = await newestLink();
    expect(newest).toHaveAttribute("href", "/stats/games/g25");
    fireEvent.click(newest);
    expect(location.pathname).toBe("/stats/games/g25");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(outcomeLabel(games[24]));
    act(() => history.back());
    await waitFor(() => expect(location.pathname).toBe("/stats"));
    expect(await screen.findByText("LATEST GAMES")).toBeInTheDocument();
  });

  it("the games are fetched once", async () => {
    const fetch = stubFetch(json(data));
    openAt("/stats");
    fireEvent.click(await newestLink());
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    fireEvent.click(nav().getByRole("link", { name: "GAMES" }));
    expect(await screen.findByText("Coming in a later update.")).toBeInTheDocument();
    fireEvent.click(nav().getByRole("link", { name: "PLAYERS" }));
    expect(location.pathname).toBe("/stats/players");
    fireEvent.click(nav().getByRole("link", { name: "STATS" }));
    expect(await screen.findByText("LATEST GAMES")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("an error line when the games cannot be loaded", async () => {
    stubFetch(json({}, 503));
    openAt("/stats");
    expect(await screen.findByRole("alert")).toHaveTextContent(STATS_LOAD_ERROR);
    expect(screen.getByRole("banner")).toHaveTextContent("SECRET-HITLER");
    expect(screen.queryByText("LATEST GAMES")).toBeNull();
  });

  it("a short page for an address that names nothing", async () => {
    for (const path of ["/stats/nowhere", "/stats/players/07"]) {
      resetStatsDataForTests();
      stubFetch(json(data));
      const { unmount } = openAt(path);
      expect(await screen.findByText("This page was not found."), path).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to the stats" })).toHaveAttribute("href", "/stats");
      unmount();
    }
  });

  it("the page title follows the page", async () => {
    stubFetch(json(data));
    openAt("/stats");
    await screen.findByText("LATEST GAMES");
    expect(document.title).toBe("Stats · Secret Hitler Online");
    fireEvent.click(await newestLink());
    await waitFor(() => expect(document.title).toBe("Game · Secret Hitler Online"));
    act(() => {
      history.pushState(null, "", "/stats/nowhere");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(document.title).toBe("Not found · Secret Hitler Online"));
  });
});
