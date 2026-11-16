import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStatsData } from "./api";
import { countedGames, parseFilter } from "./counting";
import { replayElo } from "./elo";
import type { GameRecord, StatsData } from "./record";
import { useLocation } from "./routes";
import { generateData } from "./testGames";
import { buildStats, STATS_CACHE_SIZE, useStats } from "./useStats";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), useStatsData: vi.fn() }));
vi.mock("./routes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./routes")>()),
  useLocation: vi.fn(),
}));

const ids = (gs: GameRecord[]) => gs.map((g) => g.id);

let data: StatsData | null;
let search: string;

beforeEach(() => {
  data = generateData(60, 1);
  search = "";
  vi.mocked(useStatsData).mockImplementation(() => ({ data, error: null }));
  vi.mocked(useLocation).mockImplementation(() => ({ pathname: "/stats", search }));
});

/** The context a component gets at `at`, with the records `data`. */
function statsAt(at: string) {
  search = at;
  return renderHook(() => useStats()).result.current;
}

describe("useStats", () => {
  it("isNullUntilTheRecordsArrive", () => {
    data = null;
    expect(statsAt("?cpu=1")).toBeNull();
  });

  it("buildsTheContextFromTheAddress", () => {
    const stats = statsAt("?cpu=1")!;
    const filter = parseFilter("?cpu=1");
    expect(stats.data).toBe(data);
    expect(stats.filter).toEqual(filter);
    expect(ids(stats.counted)).toEqual(ids(countedGames(data!.games, filter)));
    expect(stats.counted.length).toBeGreaterThan(0);
    expect(stats.elo.ratings.size).toBe(replayElo(stats.counted).ratings.size);
    expect(stats.names.get(1)).toBe("Seat01Player");
  });

  it("memoizedPerDataAndFilter", () => {
    const first = statsAt("?players=1,3&cpu=1");
    const second = statsAt("?cpu=1&players=3,1");
    expect(second).toBe(first);
  });

  it("aNewFilterOrNewRecordsGiveANewContext", () => {
    const first = statsAt("?players=1,3&cpu=1");
    expect(statsAt("?cpu=1")).not.toBe(first);
    expect(statsAt("?players=1,3&cpu=1"), "back to the first filter").toBe(first);
    data = { ...data! };
    expect(statsAt("?players=1,3&cpu=1"), "new records").not.toBe(first);
  });

  it("forgetsTheOldestPastTheCacheSize", () => {
    const first = statsAt("?players=1");
    for (let i = 2; i < STATS_CACHE_SIZE + 2; i++) statsAt(`?players=${i}`);
    expect(statsAt("?players=1")).not.toBe(first);
  });

  it("keepsTheMostRecentlyUsed", () => {
    const first = statsAt("?players=1");
    for (let i = 2; i < STATS_CACHE_SIZE + 2; i++) {
      statsAt(`?players=${i}`);
      statsAt("?players=1");
    }
    expect(statsAt("?players=1")).toBe(first);
  });

  it("followsTheAddressOnARerender", () => {
    search = "";
    const { result, rerender } = renderHook(() => useStats());
    const before = result.current!;
    search = "?cpu=1";
    rerender();
    expect(result.current).not.toBe(before);
    expect(result.current!.filter.cpu).toBe(true);
  });

  it("anEmptySelectionBuildsAnEmptyContext", () => {
    // Review Focus 2: every chip off.
    const stats = statsAt("?players=")!;
    expect(stats.counted).toEqual([]);
    expect(stats.elo.ratings.size).toBe(0);
    expect(stats.elo.history).toEqual([]);
    expect(stats.names.size).toBe(10);
  });
});

describe("buildStats", () => {
  it("counts, rates and names", () => {
    const d = generateData(30, 7, 6);
    const filter = parseFilter("");
    const stats = buildStats(d, filter);
    expect(stats.filter).toBe(filter);
    expect(ids(stats.counted)).toEqual(ids(countedGames(d.games, filter)));
    expect(stats.elo).toEqual(replayElo(stats.counted));
    expect(Array.from(stats.names.entries())).toEqual(d.players.map((p) => [p.number, p.name]));
  });
});

describe("generateData (a test builder)", () => {
  it("is the same for a seed and differs between seeds", () => {
    expect(generateData(60, 1)).toEqual(generateData(60, 1));
    expect(generateData(60, 1)).not.toEqual(generateData(60, 2));
  });

  it("makes the games the plan describes", () => {
    const d = generateData(300, 3);
    expect(d.players.map((p) => p.name).slice(0, 2)).toEqual(["Seat01Player", "Seat02Player"]);
    expect(d.players).toHaveLength(10);
    for (const p of d.players) expect(p.name).toHaveLength(12);
    expect(d.games.map((g) => g.id).slice(0, 2)).toEqual(["g0001", "g0002"]);
    for (let i = 1; i < d.games.length; i++) expect(d.games[i].endedAt).toBeGreaterThan(d.games[i - 1].endedAt);
    const sizes = new Set(d.games.map((g) => g.seats.length));
    expect([...sizes].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
    const cpu = d.games.filter((g) => g.hasCpu).length;
    const unfinished = d.games.filter((g) => g.outcome === "UNFINISHED").length;
    expect(cpu).toBeGreaterThan(300 / 14);
    expect(cpu).toBeLessThan(300 / 3.5);
    expect(unfinished).toBeGreaterThan(0);
    expect(unfinished).toBeLessThan(300 / 10);
    for (const g of d.games) {
      const people = g.seats.filter((s) => !s.cpu).map((s) => s.player);
      expect(new Set(people).size, `${g.id} seats a player once`).toBe(people.length);
      expect(g.seats.filter((s) => s.role === "HITLER")).toHaveLength(1);
    }
  });

  it("seats no more players than it has", () => {
    const d = generateData(40, 5, 6);
    for (const g of d.games) for (const s of g.seats) if (s.player !== null) expect(s.player).toBeLessThanOrEqual(6);
  });
});
