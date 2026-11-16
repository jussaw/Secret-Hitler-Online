import { describe, expect, it } from "vitest";
import {
  addDays,
  computeActivity,
  LAST_12_MONTHS,
  countLabel,
  dayLabel,
  hourLabel,
  localHour,
  monthKey,
  monthLabel,
  sessionSummaries,
  WEEKS_SHOWN,
  weekdayLabel,
  weekdayOf,
  weekKey,
  weekLabel,
} from "./activity";
import { countedGames } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { localDayKey } from "./format";
import { parseStatsData, type GameRecord } from "./record";
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

describe("computeActivity: the heatmap, sessions, busiest times and gaps", () => {
  it("sessionsBusiestTimesAndGaps", () => {
    const a = computeActivity(NOVEMBER, NOW, "UTC");
    expect(a.sessions).toEqual({
      count: 3,
      average: 2,
      most: {
        games: 3,
        day: "Mon 2 Nov 2026",
        startedAt: Date.parse("2026-11-02T19:00:00Z"),
        endedAt: Date.parse("2026-11-02T23:00:00Z"),
      },
    });
    expect(a.busiest.day).toEqual({ key: "2026-11-02", label: "2 Nov", long: "Mon 2 Nov 2026", games: 3 });
    expect(a.busiest.week).toMatchObject({ key: "2026-11-02", long: "Week of 2 Nov 2026", games: 4 });
    expect(a.busiest.month).toMatchObject({ key: "2026-11", long: "November 2026", games: 6 });
    expect(a.longestGap).toEqual({ days: 7, from: "Sat 7 Nov 2026", to: "Sat 14 Nov 2026" });
    expect(a.daysSinceLast).toBe(5);
    expect(computeActivity(NOVEMBER, NOW, "America/New_York").daysSinceLast).toBe(6);
  });

  it("sessionSummariesInPlayOrder", () => {
    expect(sessionSummaries(NOVEMBER, "UTC").map((s) => [s.games, s.day])).toEqual([
      [3, "Mon 2 Nov 2026"],
      [1, "Sat 7 Nov 2026"],
      [2, "Sat 14 Nov 2026"],
    ]);
    expect(sessionSummaries(NOVEMBER, "Pacific/Auckland").map((s) => s.day)).toEqual([
      "Tue 3 Nov 2026",
      "Sun 8 Nov 2026",
      "Sun 15 Nov 2026",
    ]);
    expect(sessionSummaries([], "UTC")).toEqual([]);
  });

  it("theLast12MonthsEndOnTheLatestStartDay", () => {
    const [last, year] = computeActivity(NOVEMBER, NOW, "UTC").heatmaps;
    expect(last).toMatchObject({
      id: LAST_12_MONTHS,
      label: "Last 12 months",
      busiest: 3,
      busiestDay: "Mon 2 Nov 2026",
      games: 6,
      activeDays: 3,
    });
    expect([last.days.length, last.days[0].key, last.days[364].key]).toEqual([365, "2025-11-15", "2026-11-14"]);
    expect(last.days[364]).toMatchObject({ label: "14 Nov", long: "Sat 14 Nov 2026" });
    const shade = (k: string) => last.days.find((d) => d.key === k)!.shade;
    expect(["2026-11-02", "2026-11-14", "2026-11-07", "2026-11-08"].map(shade)).toEqual([4, 3, 2, 0]);
    expect(year).toMatchObject({ id: "2026", label: "2026" });
    expect([year.days.length, year.days[0].key, year.days[364].key]).toEqual([365, "2026-01-01", "2026-12-31"]);
  });

  it("aGameCountsOnTheDayItStarted", () => {
    const [last] = computeActivity(NOVEMBER, NOW, "UTC").heatmaps;
    expect(last.days.find((d) => d.key === "2026-11-14")!.games).toBe(2);
    expect(last.days.find((d) => d.key === "2026-11-15")).toBeUndefined();
  });

  it("tiesGoToTheLaterOne", () => {
    const at = (id: string, start: string) => game(id, start, 30, [1, 2, 3, 4, 5]);
    const a = computeActivity(
      [
        at("a", "2026-11-02T19:00:00Z"),
        at("b", "2026-11-02T20:00:00Z"),
        at("c", "2026-11-04T19:00:00Z"),
        at("d", "2026-11-04T20:00:00Z"),
        at("e", "2026-11-06T19:00:00Z"),
      ],
      NOW,
      "UTC"
    );
    expect(a.busiest.day!.key).toBe("2026-11-04");
    expect(a.sessions.most!.day).toBe("Wed 4 Nov 2026");
    expect(a.longestGap).toEqual({ days: 2, from: "Wed 4 Nov 2026", to: "Fri 6 Nov 2026" });
    expect(a.heatmaps[0].busiestDay).toBe("Wed 4 Nov 2026");
  });

  it("aClockBehindTheLastGameGivesZeroDays", () => {
    expect(computeActivity(NOVEMBER, Date.parse("2026-11-14T12:00:00Z"), "UTC").daysSinceLast).toBe(0);
  });

  it("shadesAreQuartersOfTheBusiestDay", () => {
    const games: GameRecord[] = [];
    [8, 1, 2, 4, 6].forEach((count, d) => {
      for (let h = 0; h < count; h++) {
        games.push(game(`s${d}-${h}`, `2026-06-0${d + 1}T${String(h).padStart(2, "0")}:00:00Z`, 10, [1, 2, 3, 4, 5]));
      }
    });
    const year = computeActivity(games, NOW, "UTC").heatmaps.find((h) => h.id === "2026")!;
    const june = ["01", "02", "03", "04", "05", "06"].map((d) => year.days.find((day) => day.key === `2026-06-${d}`)!.shade);
    expect(june).toEqual([4, 1, 1, 2, 3, 0]);
    expect(year).toMatchObject({ busiest: 8, busiestDay: "Mon 1 Jun 2026", games: 21, activeDays: 5 });
  });

  it("eachYearWithGamesHasItsOwnView", () => {
    const heatmaps = computeActivity(onDays("2024-02-29", "2026-01-10"), NOW, "UTC").heatmaps;
    expect(heatmaps.map((h) => h.id)).toEqual([LAST_12_MONTHS, "2026", "2024"]);
    expect(heatmaps[2].days).toHaveLength(366);
    expect(heatmaps[0].days[0].key).toBe("2025-01-11");
    expect(heatmaps[0]).toMatchObject({ games: 1, activeDays: 1 });
  });

  it("theNewYearFollowsTheZone", () => {
    const games = [game("n", "2026-01-01T04:30:00Z", 30, [1, 2, 3, 4, 5])];
    expect(computeActivity(games, NOW, "UTC").heatmaps.map((h) => h.id)).toEqual([LAST_12_MONTHS, "2026"]);
    expect(computeActivity(games, NOW, "America/New_York").heatmaps.map((h) => h.id)).toEqual([LAST_12_MONTHS, "2025"]);
  });

  it("oneSessionHasNoGap", () => {
    const a = computeActivity(NOVEMBER.slice(0, 3), NOW, "UTC");
    expect(a.sessions).toMatchObject({ count: 1, average: 3 });
    expect(a.longestGap).toBeNull();
  });

  it("noGames", () => {
    expect(computeActivity([], NOW, "UTC")).toEqual({
      byPlayer: new Map(),
      periods: { week: [], month: [] },
      heatmaps: [],
      byWeekday: [0, 0, 0, 0, 0, 0, 0],
      byHour: Array(24).fill(0),
      sessions: { count: 0, average: null, most: null },
      busiest: { day: null, week: null, month: null },
      longestGap: null,
      daysSinceLast: null,
    });
  });

  it("onTheContractFixture", () => {
    const counted = countedGames(parseStatsData(JSON.parse(JSON.stringify(fixture))).games, { players: null, cpu: true });
    expect(counted.length).toBeGreaterThan(0);
    const a = computeActivity(counted, NOW, "UTC");
    const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
    const months = a.periods.month;
    expect([sum(a.byWeekday), sum(a.byHour), sum(months.map((p) => p.games))]).toEqual(Array(3).fill(counted.length));
    expect(months[months.length - 1].cumulative).toBe(counted.length);
    expect(sum(a.heatmaps.slice(1).map((h) => h.games))).toBe(counted.length);
    expect(a.sessions.average! * a.sessions.count).toBeCloseTo(counted.length);
  });
});
