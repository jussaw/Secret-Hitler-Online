import { describe, expect, it } from "vitest";
import type { GameRecord } from "../record";
import { makeRecord, makeSeats } from "../testRecords";
import {
  ENDING_PARAM,
  filterGames,
  gamesFilterSearch,
  isFiltered,
  NO_GAMES_FILTER,
  parseGamesFilter,
  type GamesFilter,
} from "./gamesFilter";

/** The ids of the games `search` keeps, in the order filterGames gives them. */
function kept(games: GameRecord[], search: string, timeZone = "UTC"): string[] {
  return filterGames(games, parseGamesFilter(search), timeZone).map((g) => g.id);
}

describe("gamesFilter", () => {
  it("reads and writes the address", () => {
    expect(gamesFilterSearch(NO_GAMES_FILTER)).toBe("");
    expect(parseGamesFilter("")).toEqual(NO_GAMES_FILTER);
    const every: GamesFilter = {
      players: [1, 3],
      from: "2026-10-01",
      to: "2026-11-14",
      size: 7,
      ending: "HITLER_ELECTED",
      cpu: "with",
      per: 50,
      page: 2,
    };
    const search =
      "?players=1,3&from=2026-10-01&to=2026-11-14&size=7&ending=hitler-elected&cpu=with&per=50&page=2";
    expect(gamesFilterSearch(every)).toBe(search);
    expect(parseGamesFilter(search)).toEqual(every);
    // The keys in any order read the same; written, they come out in the one order.
    expect(gamesFilterSearch(parseGamesFilter("?page=3&cpu=without&players=4"))).toBe(
      "?players=4&cpu=without&page=3"
    );
    expect(gamesFilterSearch({ ...NO_GAMES_FILTER, per: 100 })).toBe("?per=100");
    expect(parseGamesFilter("?per=20")).toEqual(NO_GAMES_FILTER);
  });

  it("junk falls back to the defaults", () => {
    expect(
      parseGamesFilter("?players=abc,3,3,-1,0&from=2026-02-30&to=2026-13-01&size=11&ending=draw&cpu=yes&per=7&page=0")
    ).toEqual({ ...NO_GAMES_FILTER, players: [3] });
    expect(parseGamesFilter("?page=-2").page).toBe(1);
    expect(parseGamesFilter("?page=x").page).toBe(1);
    expect(parseGamesFilter("?page=2.5").page).toBe(1);
    expect(parseGamesFilter("?players=5,2,,05,2").players).toEqual([2, 5]);
    expect(parseGamesFilter("?from=2026-1-01&to=26-01-01")).toEqual(NO_GAMES_FILTER);
    expect(parseGamesFilter("?from=2024-02-29&to=2025-02-29")).toEqual({ ...NO_GAMES_FILTER, from: "2024-02-29" });
    expect(parseGamesFilter("?size=4").size).toBeNull();
    expect(parseGamesFilter("?size=7.0").size).toBeNull();
    expect(parseGamesFilter("?size=10").size).toBe(10);
    expect(parseGamesFilter("?ending=UNFINISHED").ending).toBeNull();
  });

  it("knows when anything but the page is set", () => {
    expect(isFiltered(NO_GAMES_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_GAMES_FILTER, per: 100, page: 3 })).toBe(false);
    expect(isFiltered({ ...NO_GAMES_FILTER, players: [2] })).toBe(true);
    expect(isFiltered({ ...NO_GAMES_FILTER, from: "2026-01-01" })).toBe(true);
    expect(isFiltered({ ...NO_GAMES_FILTER, to: "2026-01-01" })).toBe(true);
    expect(isFiltered({ ...NO_GAMES_FILTER, size: 5 })).toBe(true);
    expect(isFiltered({ ...NO_GAMES_FILTER, ending: "UNFINISHED" })).toBe(true);
    expect(isFiltered({ ...NO_GAMES_FILTER, cpu: "without" })).toBe(true);
  });

  it("players match any of them", () => {
    const games = [
      makeRecord({ id: "a", endedAt: 3, seats: makeSeats(["LIBERAL", "FASCIST", "HITLER"], [1, 2, 3]) }),
      makeRecord({ id: "b", endedAt: 2, seats: makeSeats(["LIBERAL", "FASCIST", "HITLER"], [3, 4, null]) }),
      makeRecord({ id: "c", endedAt: 1, seats: makeSeats(["LIBERAL", "FASCIST", "HITLER"], [5, 6, 7]) }),
    ];
    expect(kept(games, "")).toEqual(["a", "b", "c"]);
    expect(kept(games, "?players=1")).toEqual(["a"]);
    expect(kept(games, "?players=3")).toEqual(["a", "b"]);
    expect(kept(games, "?players=2,6")).toEqual(["a", "c"]);
    expect(kept(games, "?players=99")).toEqual([]);
  });

  it("From and To are local days, both inclusive", () => {
    const at = (id: string, startedAt: number) => makeRecord({ id, startedAt, endedAt: startedAt + 60_000 });
    const games = [
      at("midnight", Date.UTC(2026, 10, 14, 0, 0)),
      at("late", Date.UTC(2026, 10, 14, 23, 59)),
      at("next", Date.UTC(2026, 10, 15, 0, 0)),
    ];
    expect(kept(games, "?to=2026-11-14")).toEqual(["late", "midnight"]);
    expect(kept(games, "?from=2026-11-15")).toEqual(["next"]);
    expect(kept(games, "?from=2026-11-14")).toEqual(["next", "late", "midnight"]);
    expect(kept(games, "?from=2026-11-14&to=2026-11-14")).toEqual(["late", "midnight"]);
    expect(kept(games, "?from=2026-11-15&to=2026-11-14")).toEqual([]);
    // 00:00 UTC on the 15th is 7 PM on the 14th in New York.
    expect(kept(games, "?to=2026-11-14", "America/New_York")).toEqual(["next", "late", "midnight"]);
    expect(kept(games, "?from=2026-11-15", "America/New_York")).toEqual([]);
  });

  it("size, ending and CPU", () => {
    const five = makeSeats(["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER"]);
    const seven = makeSeats(["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER", "LIBERAL", "FASCIST"]);
    const games = [
      makeRecord({ id: "lib", endedAt: 5, outcome: "LIBERAL_POLICIES", winner: "LIBERAL", seats: five }),
      makeRecord({ id: "exe", endedAt: 4, outcome: "HITLER_EXECUTED", winner: "LIBERAL", seats: seven }),
      makeRecord({ id: "fas", endedAt: 3, outcome: "FASCIST_POLICIES", winner: "FASCIST", seats: five, hasCpu: true }),
      makeRecord({ id: "ele", endedAt: 2, outcome: "HITLER_ELECTED", winner: "FASCIST", seats: seven }),
      makeRecord({ id: "unf", endedAt: 1, outcome: "UNFINISHED", winner: null, seats: seven, hasCpu: true }),
    ];
    expect(kept(games, "?size=5")).toEqual(["lib", "fas"]);
    expect(kept(games, "?size=7")).toEqual(["exe", "ele", "unf"]);
    expect(kept(games, "?size=10")).toEqual([]);
    expect(ENDING_PARAM).toEqual({
      LIBERAL_POLICIES: "liberal-policies",
      HITLER_EXECUTED: "hitler-executed",
      FASCIST_POLICIES: "fascist-policies",
      HITLER_ELECTED: "hitler-elected",
      UNFINISHED: "unfinished",
    });
    for (const game of games) {
      expect(kept(games, `?ending=${ENDING_PARAM[game.outcome]}`)).toEqual([game.id]);
    }
    expect(kept(games, "?cpu=without")).toEqual(["lib", "exe", "ele"]);
    expect(kept(games, "?cpu=with")).toEqual(["fas", "unf"]);
    expect(kept(games, "?size=7&cpu=with&ending=unfinished")).toEqual(["unf"]);
  });

  it("newest first", () => {
    const games = [
      makeRecord({ id: "b", endedAt: 100 }),
      makeRecord({ id: "a", endedAt: 300 }),
      makeRecord({ id: "c", endedAt: 300 }),
      makeRecord({ id: "d", endedAt: 200 }),
    ];
    // The page and its size choose a slice of the list; they never filter it.
    expect(kept(games, "?per=50&page=4")).toEqual(["c", "a", "d", "b"]);
    expect(games.map((g) => g.id), "the records' own order").toEqual(["b", "a", "c", "d"]);
  });
});
