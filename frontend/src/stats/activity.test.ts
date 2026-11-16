import { describe, expect, it } from "vitest";
import {
  addDays,
  computeActivity,
  countLabel,
  dayLabel,
  hourLabel,
  localHour,
  monthKey,
  monthLabel,
  WEEKS_SHOWN,
  weekdayLabel,
  weekdayOf,
  weekKey,
  weekLabel,
} from "./activity";
import { localDayKey } from "./format";
import type { GameRecord } from "./record";
import { makeRecord, makeSeats } from "./testRecords";

/**
 * A finished five-seat game (three Liberals, a Fascist and Hitler) held by `players`, null a CPU
 * seat, started at `start` and `minutes` long, won by the Liberals, with no events.
 */
function game(id: string, start: string, minutes: number, players: (number | null)[]): GameRecord {
  const startedAt = Date.parse(start);
  return makeRecord({
    id,
    startedAt,
    endedAt: startedAt + minutes * 60_000,
    seats: makeSeats(["LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "HITLER"], players),
    hasCpu: players.includes(null),
    events: [],
  });
}

const NOVEMBER = [
  game("g1", "2026-11-02T19:00:00Z", 40, [1, 2, 3, 4, 5]),
  game("g2", "2026-11-02T20:00:00Z", 40, [1, 2, 3, 4, 5]),
  game("g3", "2026-11-02T22:30:00Z", 30, [1, 2, 3, 4, 6]),
  game("g4", "2026-11-07T18:00:00Z", 45, [1, 2, 3, 5, 6]),
  game("g5", "2026-11-14T21:00:00Z", 60, [2, 3, 4, 5, 6]),
  game("g6", "2026-11-14T23:30:00Z", 60, [1, 2, 3, 4, 5]), // ends 00:30 on Sunday
];
const NOW = Date.parse("2026-11-20T12:00:00Z");

/** Games at 20:00 UTC on each day key, an hour long, players 1 to 5. */
const onDays = (...days: string[]) => days.map((day, i) => game(`d${i}`, `${day}T20:00:00Z`, 60, [1, 2, 3, 4, 5]));

describe("the local calendar", () => {
  it("theHourAndTheDayFollowTheGivenZone", () => {
    const t = Date.parse("2026-11-13T23:30:00Z");
    const at = (zone: string) => [localDayKey(t, zone), localHour(t, zone)];
    expect([at("UTC"), at("Pacific/Auckland"), at("America/Los_Angeles")]).toEqual([
      ["2026-11-13", 23],
      ["2026-11-14", 12],
      ["2026-11-13", 15],
    ]);
    expect([weekdayOf("2026-11-13"), weekdayOf("2026-11-14")]).toEqual([4, 5]);
  });

  it("keysAndLabels", () => {
    expect([weekKey("2026-11-14"), monthKey("2026-11-14")]).toEqual(["2026-11-09", "2026-11"]);
    expect(dayLabel("2026-11-14")).toEqual({ key: "2026-11-14", label: "14 Nov", long: "Sat 14 Nov 2026" });
    expect(weekLabel("2026-11-09")).toEqual({ key: "2026-11-09", label: "9 Nov", long: "Week of 9 Nov 2026" });
    expect(monthLabel("2026-11")).toEqual({ key: "2026-11", label: "Nov 2026", long: "November 2026" });
  });

  it("weekdayAndHourLabels", () => {
    expect([0, 6].map(weekdayLabel)).toEqual([
      { key: "0", label: "Mon", long: "Monday" },
      { key: "6", label: "Sun", long: "Sunday" },
    ]);
    expect([0, 21, 23].map(hourLabel)).toEqual([
      { key: "0", label: "00", long: "00:00 to 01:00" },
      { key: "21", label: "21", long: "21:00 to 22:00" },
      { key: "23", label: "23", long: "23:00 to 00:00" },
    ]);
  });

  it("aWeekRunsMondayToSundayAcrossANewYear", () => {
    expect([weekKey("2025-12-31"), weekKey("2026-01-04"), weekKey("2026-01-05")]).toEqual([
      "2025-12-29",
      "2025-12-29",
      "2026-01-05",
    ]);
  });

  it("calendarArithmetic", () => {
    expect(addDays("2026-11-14", -364)).toBe("2025-11-15");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(countLabel(1, ["loss", "losses"])).toBe("1 loss");
    expect(countLabel(0, ["game", "games"])).toBe("0 games");
    expect(countLabel(2, ["game", "games"])).toBe("2 games");
  });
});

describe("computeActivity: games over time", () => {
  it("countsPlayersWeeksMonthsWeekdaysAndHours", () => {
    const a = computeActivity(NOVEMBER, NOW, "UTC");
    expect(a.byPlayer.get(2)).toEqual({ games: 6, share: 1, lastEndedAt: Date.parse("2026-11-15T00:30:00Z") });
    expect(a.byPlayer.get(6)).toMatchObject({ games: 3, share: 0.5 });
    expect(a.periods.week.map((p) => [p.key, p.games, p.cumulative])).toEqual([
      ["2026-11-02", 4, 4],
      ["2026-11-09", 2, 6],
    ]);
    expect(Object.fromEntries(a.periods.week[0].byPlayer)).toEqual({ 1: 4, 2: 4, 3: 4, 4: 3, 5: 3, 6: 2 });
    expect(Object.fromEntries(a.periods.week[1].byPlayer)).toEqual({ 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1 });
    expect(a.periods.week[1]).toMatchObject({ label: "9 Nov", long: "Week of 9 Nov 2026" });
    expect(a.periods.month.map((p) => [p.key, p.games, p.cumulative])).toEqual([["2026-11", 6, 6]]);
    expect(a.periods.month[0]).toMatchObject({ label: "Nov 2026", long: "November 2026" });
    expect(a.byWeekday).toEqual([3, 0, 0, 0, 0, 3, 0]);
    expect(a.byHour.flatMap((n, h) => (n ? [h] : []))).toEqual([18, 19, 20, 21, 22, 23]);
  });

  it("theViewersZoneMovesDaysAndHours", () => {
    const a = computeActivity(NOVEMBER, NOW, "Pacific/Auckland");
    expect(a.byWeekday).toEqual([0, 3, 0, 0, 0, 0, 3]);
    expect(a.byHour.flatMap((n, h) => (n ? [[h, n]] : []))).toEqual([
      [7, 1],
      [8, 1],
      [9, 1],
      [10, 1],
      [11, 1],
      [12, 1],
    ]);
  });

  it("aDaylightSavingChangeMovesNoHourOrDay", () => {
    // Clocks in New York go forward at 07:00 UTC on 8 March 2026: 01:30 EST, then 03:30 EDT.
    const games = [
      game("a", "2026-03-08T06:30:00Z", 30, [1, 2, 3, 4, 5]),
      game("b", "2026-03-08T07:30:00Z", 30, [1, 2, 3, 4, 5]),
    ];
    const a = computeActivity(games, NOW, "America/New_York");
    expect([a.byHour[1], a.byHour[2], a.byHour[3]]).toEqual([1, 0, 1]);
    expect(a.byWeekday[6]).toBe(2);
    expect(a.periods.week.map((p) => p.key)).toEqual(["2026-03-02"]);
  });

  it("emptyPeriodsAreZeroBars", () => {
    const weeks = computeActivity(onDays("2026-10-21", "2026-11-12"), NOW, "UTC").periods.week;
    expect(weeks.map((p) => [p.key, p.games])).toEqual([
      ["2026-10-19", 1],
      ["2026-10-26", 0],
      ["2026-11-02", 0],
      ["2026-11-09", 1],
    ]);
    expect(weeks[1].byPlayer.size).toBe(0);
    const months = computeActivity(onDays("2025-12-15", "2026-02-10"), NOW, "UTC").periods.month;
    expect(months.map((p) => [p.key, p.games, p.cumulative])).toEqual([
      ["2025-12", 1, 1],
      ["2026-01", 0, 1],
      ["2026-02", 1, 2],
    ]);
  });

  it("weeksStopAtFiftyTwo", () => {
    const a = computeActivity(onDays("2025-01-06", "2026-11-09"), NOW, "UTC");
    const weeks = a.periods.week;
    expect(WEEKS_SHOWN).toBe(52);
    expect(weeks).toHaveLength(52);
    expect(weeks[0]).toMatchObject({ key: "2025-11-17", games: 0, cumulative: 1 });
    expect(weeks[weeks.length - 1]).toMatchObject({ key: "2026-11-09", cumulative: 2 });
    expect(a.periods.month).toHaveLength(23);
  });

  it("cpuSeatsAreNoPlayer", () => {
    const a = computeActivity([game("c", "2026-11-02T19:00:00Z", 40, [1, 2, null, null, null])], NOW, "UTC");
    expect(Array.from(a.byPlayer.keys())).toEqual([1, 2]);
    expect(Array.from(a.periods.week[0].byPlayer.keys())).toEqual([1, 2]);
  });

  it("playersAreInNumberOrder", () => {
    const a = computeActivity([game("o", "2026-11-02T19:00:00Z", 40, [5, 3, 9, 1, 2])], NOW, "UTC");
    expect(Array.from(a.byPlayer.keys())).toEqual([1, 2, 3, 5, 9]);
  });
});
