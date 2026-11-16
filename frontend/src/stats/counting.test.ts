import { describe, expect, it } from "vitest";
import {
  compareByEnd,
  compareNames,
  countedGames,
  DEFAULT_FILTER,
  filterSearch,
  humanSeats,
  localDaysBetween,
  MIN_CHANCES,
  MIN_GAMES,
  parseFilter,
  rankRows,
  rate,
  seatWon,
  SESSION_GAP_MS,
  sessions,
  togglePlayer,
} from "./counting";
import type { GameRecord } from "./record";
import { game, ROLES, seatsOf } from "./testGames";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 14, 20, 0);
const ids = (gs: GameRecord[]) => gs.map((g) => g.id);

describe("the constants", () => {
  it("are the spec's", () => {
    expect(MIN_GAMES).toBe(5);
    expect(MIN_CHANCES).toBe(5);
    expect(SESSION_GAP_MS).toBe(3 * H);
    expect(DEFAULT_FILTER).toEqual({ players: null, cpu: false });
    expect(Object.isFrozen(DEFAULT_FILTER)).toBe(true);
  });
});

describe("the filter in the address", () => {
  it("readsPlayersAndCpu", () => {
    expect(parseFilter("?players=1,3,4&cpu=1")).toEqual({ players: new Set([1, 3, 4]), cpu: true });
  });
  it("everyPlayerAndNoCpuIsNoParameter", () => {
    expect(parseFilter("")).toEqual(DEFAULT_FILTER);
    expect(filterSearch(DEFAULT_FILTER)).toBe("");
  });
  it("roundTrips", () => {
    for (const s of ["?players=1,3,4&cpu=1", "?players=2", "?cpu=1", "?players="]) expect(filterSearch(parseFilter(s))).toBe(s);
    expect(filterSearch({ players: new Set([4, 1, 3]), cpu: true })).toBe("?players=1,3,4&cpu=1");
  });
  it("dropsWhatIsNotAPlayerNumber", () => {
    // Review Focus 1: a shared link with junk in it parses without throwing.
    expect(parseFilter("?players=3,abc,,-2,1.5,0, 7,3").players).toEqual(new Set([3, 7]));
    expect(parseFilter("?players=1%2C3&page=2").players).toEqual(new Set([1, 3]));
    expect(parseFilter("?players=99").players).toEqual(new Set([99]));
    expect(parseFilter("?players=abc").players).toEqual(new Set());
    expect(parseFilter("?players=99999999999999999999").players).toEqual(new Set());
    expect(parseFilter("?cpu=yes").cpu).toBe(false);
    expect(parseFilter("?cpu=").cpu).toBe(false);
  });
  it("togglePlayerGoesBackToEveryone", () => {
    const off = togglePlayer({ players: null, cpu: true }, 2, [1, 2, 3]);
    expect(off).toEqual({ players: new Set([1, 3]), cpu: true });
    expect(togglePlayer(off, 2, [1, 2, 3])).toEqual({ players: null, cpu: true });
  });
  it("togglePlayerNeverChangesTheFilterItIsGiven", () => {
    const filter = { players: new Set([1, 3]), cpu: false };
    togglePlayer(filter, 3, [1, 2, 3]);
    expect(filter.players).toEqual(new Set([1, 3]));
  });
});

describe("countedGames", () => {
  const a = game("a", T0 + 2 * H, seatsOf([1, 2, 3, 4, 5]), "LIBERAL");
  const u = game("u", T0 + 3 * H, seatsOf([1, 2, 3, 4, 5]), null);
  const c = game("c", T0 + H, seatsOf([1, 2, 3, null, null]), "FASCIST");
  const o = game("o", T0 + 4 * H, seatsOf([1, 2, 3, 4, 6]), "LIBERAL");

  it("neverCountsUnfinished", () => {
    expect(ids(countedGames([a, u], DEFAULT_FILTER))).toEqual(["a"]);
    expect(ids(countedGames([a, u], { players: null, cpu: true }))).toEqual(["a"]);
  });
  it("cpuGamesOnlyWithTheToggle", () => {
    expect(ids(countedGames([a, u, c], DEFAULT_FILTER))).toEqual(["a"]);
    expect(ids(countedGames([a, u, c], { players: null, cpu: true }))).toEqual(["c", "a"]);
  });
  it("everyHumanSeatMustBeOn", () => {
    expect(ids(countedGames([a, u, c, o], { players: new Set([1, 2, 3, 4, 5]), cpu: true }))).toEqual(["c", "a"]);
  });
  it("cpuSeatsNeedNoChip", () => {
    expect(ids(countedGames([c], { players: new Set([1, 2, 3]), cpu: true }))).toEqual(["c"]);
  });
  it("ordersByEndedAtThenId", () => {
    const b = game("b", a.endedAt, seatsOf([1, 2, 3, 4, 5]), "FASCIST");
    const input = [b, a, c];
    expect(ids(countedGames(input, { players: null, cpu: true }))).toEqual(["c", "a", "b"]);
    expect(ids(input), "a sorted copy").toEqual(["b", "a", "c"]);
  });
  it("anEmptySelectionCountsNothing", () => {
    expect(countedGames([a, c, o], { players: new Set(), cpu: true })).toEqual([]);
  });
});

describe("compareByEnd", () => {
  it("ordersByEndedAtThenIdByCodeUnits", () => {
    const seats = seatsOf([1, 2, 3, 4, 5]);
    const late = game("a", T0 + H, seats, "LIBERAL");
    const b = game("b", T0, seats, "LIBERAL");
    const upper = game("B", T0, seats, "LIBERAL");
    expect([late, b, upper].sort(compareByEnd).map((g) => g.id)).toEqual(["B", "b", "a"]);
    expect(compareByEnd(b, b)).toBe(0);
  });
});

describe("rate", () => {
  it("is null below its minimum", () => {
    expect(rate(3, 4)).toEqual({ hits: 3, chances: 4, value: null });
    expect(rate(3, 5).value).toBe(0.6);
    expect(rate(0, 0, 0).value).toBeNull();
    expect(rate(1, 2, 2).value).toBe(0.5);
  });
});

describe("rankRows", () => {
  const names = new Map([
    [1, "Cy"],
    [2, "ann"],
    [3, "Bo"],
    [4, "Dee"],
    [5, "Eve"],
  ]);
  const desc = (a: number, b: number) => b - a;

  it("tiesShareARankThenMoreGamesThenName", () => {
    const rows = rankRows(
      [
        { player: 1, value: 10, count: 6 },
        { player: 2, value: 12, count: 5 },
        { player: 3, value: 10, count: 8 },
        { player: 4, value: 10, count: 6 },
        { player: 5, value: 9, count: 7 },
      ],
      desc,
      names
    );
    expect(rows.map((r) => [r.player, r.rank])).toEqual([
      [2, 1],
      [3, 2],
      [1, 2],
      [4, 2],
      [5, 5],
    ]);
  });
  it("belowTheMinimumIsUnrankedAtTheBottom", () => {
    const rows = rankRows(
      [
        { player: 1, value: 99, count: 4 },
        { player: 2, value: 1, count: 5 },
        { player: 3, value: 50, count: 4 },
        { player: 4, value: 0, count: 2 },
      ],
      desc,
      names
    );
    expect(rows.map((r) => [r.player, r.rank])).toEqual([
      [2, 1],
      [3, null],
      [1, null],
      [4, null],
    ]);
  });
  it("namesIgnoreCase", () => {
    const rows = rankRows(
      [
        { player: 3, value: 1, count: 5 },
        { player: 2, value: 1, count: 5 },
      ],
      desc,
      names
    );
    expect(rows.map((r) => r.player)).toEqual([2, 3]); // "ann" before "Bo"
  });
  it("takesItsOwnMinimum", () => {
    const rows = rankRows([{ player: 1, value: 1, count: 2 }], desc, names, 2);
    expect(rows).toEqual([{ player: 1, rank: 1, value: 1, count: 2 }]);
  });
});

describe("compareNames", () => {
  it("is alphabetical, ignoring case", () => {
    expect(compareNames("ann", "Bo")).toBeLessThan(0);
    expect(compareNames("Bo", "ann")).toBeGreaterThan(0);
    expect(compareNames("ANN", "ann")).toBe(0);
  });
});

describe("seats", () => {
  it("humanSeats", () => {
    const x = game("x", T0, seatsOf([4, null, 2, null, 9]), "LIBERAL");
    expect(humanSeats(x)).toEqual([
      { seat: 0, player: 4 },
      { seat: 2, player: 2 },
      { seat: 4, player: 9 },
    ]);
    expect([x.seats[1].name, x.seats[3].name]).toEqual(["Bot 2", "Bot 4"]);
    expect(x.seats.map((s) => s.role)).toEqual(ROLES[5]);
    expect(x.hasCpu).toBe(true);
  });
  it("seatWon", () => {
    const won = game("w", T0, seatsOf([1, 2, 3, 4, 5]), "LIBERAL");
    expect(seatWon(won, 0)).toBe(true);
    expect(seatWon(won, 4)).toBe(false); // Hitler
    const lost = game("f", T0, seatsOf([1, 2, 3, 4, 5]), "FASCIST");
    expect(seatWon(lost, 4)).toBe(true);
    const unfinished = game("u", T0, seatsOf([1, 2, 3, 4, 5]), null);
    for (let seat = 0; seat < 5; seat++) expect(seatWon(unfinished, seat)).toBe(false);
  });
});

describe("sessions", () => {
  const seats = seatsOf([1, 2, 3, 4, 5]);
  const at = (hour: number, minute = 0) => Date.UTC(2026, 10, 14, hour, minute);

  it("splitAtThreeHours", () => {
    const g1 = game("g1", at(20, 30), seats, "LIBERAL");
    const g2Start = g1.endedAt + SESSION_GAP_MS - 1;
    const g2 = game("g2", g2Start + 30 * 60_000, seats, "LIBERAL");
    const g3 = game("g3", g2.endedAt + SESSION_GAP_MS + 30 * 60_000, seats, "FASCIST");
    expect(g2.startedAt).toBe(g2Start);
    expect(g3.startedAt).toBe(g2.endedAt + SESSION_GAP_MS);
    expect(sessions([g3, g1, g2]).map(ids)).toEqual([["g1", "g2"], ["g3"]]);
  });
  it("overlappingLobbies", () => {
    const gA = game("gA", at(21, 30), seats, "LIBERAL", { startedAt: at(20) });
    const gB = game("gB", at(20, 45), seats, "LIBERAL", { startedAt: at(20, 15) });
    const gC = game("gC", at(24, 15), seats, "LIBERAL", { startedAt: at(23, 45) });
    expect(sessions([gC, gB, gA]).map(ids)).toEqual([["gA", "gB", "gC"]]);
  });
  it("none", () => {
    expect(sessions([])).toEqual([]);
  });
});

describe("localDaysBetween", () => {
  it("localDaysBetweenInTheZoneGiven", () => {
    // Review Focus 4: a game ending at 23:59 seen at 00:01 is a day ago in that zone only.
    expect(localDaysBetween(Date.UTC(2026, 10, 14, 23, 59), Date.UTC(2026, 10, 15, 0, 1), "UTC")).toBe(1);
    expect(localDaysBetween(Date.UTC(2026, 10, 14, 23, 59), Date.UTC(2026, 10, 15, 0, 1), "America/New_York")).toBe(0);
    expect(localDaysBetween(Date.UTC(2026, 10, 14, 22, 59), Date.UTC(2026, 10, 14, 23, 1), "Europe/Paris")).toBe(1);
    expect(localDaysBetween(Date.UTC(2026, 10, 14, 22, 59), Date.UTC(2026, 10, 14, 23, 1), "UTC")).toBe(0);
  });
  it("countsWholeDaysAcrossDst", () => {
    expect(localDaysBetween(Date.UTC(2026, 2, 1, 17), Date.UTC(2026, 3, 5, 16), "America/New_York")).toBe(35);
    expect(localDaysBetween(Date.UTC(2026, 9, 20, 10), Date.UTC(2026, 10, 10, 11), "Europe/Paris")).toBe(21);
  });
});
