import { describe, expect, it } from "vitest";
import { computeActivity } from "./activity";
import { countedGames, DEFAULT_FILTER } from "./counting";
import { replayElo, type EloResult, type GameElo, type PlayerRating } from "./elo";
import fixture from "./fixtures/recorded-games.json";
import { winStreaks } from "./overview";
import { parseStatsData, type GameRecord, type Role, type Side } from "./record";
import { computeRecords, streakHolders, TOP_SESSIONS } from "./records";
import { makeRecord, makeSeats } from "./testRecords";
import { computeTiming } from "./timing";

/** A side's roles for `n` seats: Liberals, or the Fascist side with Hitler in its first seat. */
function rolesOf(side: Side, n: number): Role[] {
  return Array.from({ length: n }, (_, i): Role => (side === "LIBERAL" ? "LIBERAL" : i === 0 ? "HITLER" : "FASCIST"));
}

/**
 * A finished 30-minute game started at `start` and won by `side`: `winners` seated on it and
 * `losers` on the other side, then CPU seats up to five, on the winning side when `winners` is
 * empty and on the losing side otherwise.
 */
function played(id: string, start: string, winners: number[], losers: number[] = [], side: Side = "LIBERAL"): GameRecord {
  const other: Side = side === "LIBERAL" ? "FASCIST" : "LIBERAL";
  const cpus: null[] = Array(Math.max(0, 5 - winners.length - losers.length)).fill(null);
  const winning: (number | null)[] = winners.length === 0 ? cpus : winners;
  const losing: (number | null)[] = winners.length === 0 ? losers : [...losers, ...cpus];
  const startedAt = Date.parse(start);
  return makeRecord({
    id,
    startedAt,
    endedAt: startedAt + 30 * 60_000,
    outcome: side === "LIBERAL" ? "LIBERAL_POLICIES" : "FASCIST_POLICIES",
    winner: side,
    hasCpu: cpus.length > 0,
    seats: makeSeats([...rolesOf(side, winning.length), ...rolesOf(other, losing.length)], [...winning, ...losing]),
  });
}

const NO_ELO: EloResult = { ratings: new Map(), history: [], games: new Map() };
const NOW = Date.parse("2026-11-20T12:00:00Z");
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** An October evening, 20:00 UTC on day `d`. */
const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}T20:00:00Z`;
/** `player`'s results in a row, one game a day from October `from`: W a win, L a loss. */
const run = (player: number, results: string, from: number) =>
  results
    .split("")
    .map((r, i) => played(`p${player}-${i + 1}`, day(from + i), r === "W" ? [player] : [], r === "W" ? [] : [player]));

const MONTHS = [
  played("aug", "2026-08-10T20:00:00Z", [2]),
  played("o1", "2026-10-12T20:00:00Z", [3]),
  played("o2", "2026-10-13T20:00:00Z", [3]),
  played("o3", "2026-10-14T20:00:00Z", [1]),
  ...[2, 3, 4, 5].map((d) => played(`n${d}`, `2026-11-0${d}T20:00:00Z`, [1, 2])),
  played("n6", "2026-11-06T20:00:00Z", [3]),
];

describe("computeRecords", () => {
  it("streaks", () => {
    const counted = [...run(1, "WWLWWWLLLW", 1), ...run(3, "WWW", 20)];
    const r = computeRecords(counted, NO_ELO, NOW, "UTC");
    expect(r.byPlayer.get(1)).toMatchObject({
      games: 10,
      current: 1,
      longestWin: {
        player: 1,
        length: 3,
        firstGameId: "p1-4",
        lastGameId: "p1-6",
        from: "Sun 4 Oct 2026",
        to: "Tue 6 Oct 2026",
      },
      longestLoss: { length: 3, firstGameId: "p1-7", lastGameId: "p1-9" },
    });
    expect(r.longestWin).toMatchObject({ player: 3, length: 3 }); // the later end
    expect(r.longestLoss).toMatchObject({ player: 1, length: 3 });
    for (const [n, s] of winStreaks(counted)) {
      expect(r.byPlayer.get(n)!.longestWin?.length ?? 0).toBe(s.longestWin?.length ?? 0);
      expect(r.byPlayer.get(n)!.longestLoss?.lastGameId).toBe(s.longestLoss?.lastGameId);
    }
  });

  it("playerOfTheMonthAndItsHistory", () => {
    // Review Focus 4: a month just begun with no games has no holder, and last month is history.
    const r = computeRecords(MONTHS, NO_ELO, NOW, "UTC");
    expect(r.playerOfTheMonth).toMatchObject({ key: "2026-11", label: "Nov 2026", long: "November 2026", wins: 4 });
    expect(sorted(r.playerOfTheMonth.players)).toEqual([1, 2]);
    expect(r.monthHistory.map((m) => [m.key, sorted(m.players), m.wins])).toEqual([
      ["2026-10", [3], 2],
      ["2026-08", [2], 1],
    ]);
    const dec = computeRecords(MONTHS, NO_ELO, Date.parse("2026-12-02T12:00:00Z"), "UTC");
    expect(dec.playerOfTheMonth).toMatchObject({ key: "2026-12", players: [], wins: 0 });
    expect(dec.monthHistory[0]).toMatchObject({ key: "2026-11", wins: 4 });
  });

  it("aLosingRunMakesTheCurrentStreakNegative", () => {
    const losing = computeRecords(run(2, "WWLWWLL", 1), NO_ELO, NOW, "UTC").byPlayer.get(2)!;
    expect(losing.current).toBe(-2);
    expect(losing.longestLoss).toMatchObject({ length: 2, lastGameId: "p2-7" });
    const back = computeRecords([...run(2, "WWL", 1), ...run(2, "W", 4)], NO_ELO, NOW, "UTC").byPlayer.get(2)!;
    expect(back.current).toBe(1);
  });

  it("theLongestEverTakesTheLaterTie", () => {
    // Review Focus 3: two equally long streaks, the one that ended later holds the record.
    expect(computeRecords([...run(1, "WW", 1), ...run(3, "WW", 10)], NO_ELO, NOW, "UTC").longestWin!.player).toBe(3);
    expect(computeRecords([...run(1, "LL", 1), ...run(3, "LL", 10)], NO_ELO, NOW, "UTC").longestLoss!.player).toBe(3);
    // The later end, not the higher number: the lower-numbered player's streak ending later wins too.
    expect(computeRecords([...run(3, "WW", 1), ...run(1, "WW", 10)], NO_ELO, NOW, "UTC").longestWin!.player).toBe(1);
    expect(computeRecords([...run(3, "LL", 1), ...run(1, "LL", 10)], NO_ELO, NOW, "UTC").longestLoss!.player).toBe(1);
  });

  it("streakHoldersAreEveryPlayerTiedAtTheSameEnd", () => {
    // 1 and 2 won o1 to o3 together, 3 won three in a row ending at o2: only the later end ties.
    const counted = [
      played("o0", day(1), [3]),
      played("o1", day(2), [1, 2, 3]),
      played("o2", day(3), [1, 2, 3]),
      played("o3", day(4), [1, 2], [3]),
      played("o4", day(5), [4], [1, 2]),
    ];
    const r = computeRecords(counted, NO_ELO, NOW, "UTC");
    expect(r.longestWin).toMatchObject({ length: 3, lastGameId: "o3" });
    expect(streakHolders(r, "longestWin")).toEqual([1, 2]);
    expect(streakHolders(r, "longestLoss")).toEqual([1, 2]); // 3's loss, o3, ended earlier
    expect(streakHolders(computeRecords([], NO_ELO, NOW, "UTC"), "longestWin")).toEqual([]);
  });

  it("bestWeekAndMonthTakeTheLaterTie", () => {
    const starts = ["10-05T20", "10-07T19", "10-07T20", "11-02T20", "11-04T19", "11-04T20", "11-10T20"];
    const counted = starts.map((s, i) => played(`w${i + 1}`, `2026-${s}:00:00Z`, [1]));
    const p = computeRecords(counted, NO_ELO, NOW, "UTC").byPlayer.get(1)!;
    expect(p.bestWeek).toMatchObject({ key: "2026-11-02", long: "Week of 2 Nov 2026", wins: 3 });
    expect(p.bestMonth).toMatchObject({ key: "2026-11", long: "November 2026", wins: 4 });
  });

  it("aWinCountsInTheMonthItStarted", () => {
    // Review Focus 1: a win from 23:30 on October's last day counts in the month it started, in the zone.
    const counted = [played("late", "2026-10-31T23:30:00Z", [4])];
    expect(computeRecords(counted, NO_ELO, NOW, "UTC").monthHistory.map((m) => [m.key, m.players])).toEqual([["2026-10", [4]]]);
    const paris = computeRecords(counted, NO_ELO, NOW, "Europe/Paris"); // 00:30 on 1 November
    expect(paris.playerOfTheMonth.players).toEqual([4]);
    expect(paris.monthHistory).toEqual([]);
  });

  it("cpuOnlyWinsNameNoPlayerOfTheMonth", () => {
    // Review Focus 2 and 5: CPU seats alone won, so no one is October's player of the month, and
    // the humans who lost it start a losing streak and have no longest win.
    const r = computeRecords([played("c", "2026-10-12T20:00:00Z", [], [1, 2], "FASCIST")], NO_ELO, NOW, "UTC");
    expect(r.monthHistory).toEqual([]);
    expect(r.byPlayer.get(1)).toMatchObject({ current: -1, longestLoss: { length: 1 }, longestWin: null });
  });

  it("topSessions", () => {
    const nights = [
      played("a1", "2026-11-02T10:00:00Z", [1]),
      played("a2", "2026-11-02T11:00:00Z", [1]),
      played("a3", "2026-11-02T12:00:00Z", [1]),
      played("b1", "2026-11-07T20:00:00Z", [1]),
      played("c1", "2026-11-14T20:00:00Z", [1]),
      played("c2", "2026-11-14T21:00:00Z", [1]),
    ];
    expect(computeRecords(nights, NO_ELO, NOW, "UTC").topSessions.map((s) => [s.games, s.day])).toEqual([
      [3, "Mon 2 Nov 2026"],
      [2, "Sat 14 Nov 2026"],
      [1, "Sat 7 Nov 2026"],
    ]);
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => played(`d${d}`, `2026-11-0${d}T20:00:00Z`, [1]));
    const top = computeRecords(week, NO_ELO, NOW, "UTC").topSessions;
    expect(top).toHaveLength(TOP_SESSIONS);
    expect(top.map((s) => s.day)).toEqual(["Sat 7 Nov 2026", "Fri 6 Nov 2026", "Thu 5 Nov 2026", "Wed 4 Nov 2026", "Tue 3 Nov 2026"]);
  });

  it("noGames", () => {
    const r = computeRecords([], NO_ELO, NOW, "UTC");
    expect(r.byPlayer.size).toBe(0);
    expect(r.longestWin).toBeNull();
    expect(r.longestLoss).toBeNull();
    expect(r.playerOfTheMonth).toMatchObject({ key: "2026-11", players: [], wins: 0 });
    expect(r.monthHistory).toEqual([]);
    expect(r.topSessions).toEqual([]);
  });
});

/**
 * An `EloResult` from `[expectedLiberal, liberalChange]` by game ID and a peak by player (each
 * player's rating that peak, over 6 games, not provisional), with no history.
 */
function eloOf(games: Record<string, [number, number]>, peaks: Record<number, number>): EloResult {
  const out: EloResult = { ratings: new Map<number, PlayerRating>(), history: [], games: new Map<string, GameElo>() };
  for (const [gameId, [expectedLiberal, liberalChange]] of Object.entries(games)) {
    out.games.set(gameId, { gameId, expectedLiberal, handicap: 0, liberalChange });
  }
  for (const [n, peak] of Object.entries(peaks)) {
    const player = Number(n);
    out.ratings.set(player, { player, rating: peak, games: 6, provisional: false, lastChange: 0, peak });
  }
  return out;
}

const RATED = [
  played("a", "2026-11-01T20:00:00Z", [1, 2, 3], [4, 5]),
  played("b", "2026-11-02T20:00:00Z", [4, 5], [1, 2, 3], "FASCIST"),
  played("c", "2026-11-03T20:00:00Z", [1, 2, 3], [4, 5]),
  played("d", "2026-11-04T20:00:00Z", [1, 2, 3], [4, 5]),
  played("e", "2026-11-05T20:00:00Z", [], [1, 2, 3], "FASCIST"), // won by CPU seats alone
];
const RATED_ELO = eloOf(
  { a: [0.5, 16], b: [0.75, -24], c: [0.625, 12], d: [0.25, 24], e: [0.875, -28] },
  { 1: 1561.4, 2: 1530, 3: 1561.2 }
);

/** The contract fixture's records, a fresh copy. */
const fixtureGames = () => parseStatsData(JSON.parse(JSON.stringify(fixture))).games;

describe("computeRecords' rating records", () => {
  it("ratingRecords", () => {
    const r = computeRecords(RATED.slice(0, 3), RATED_ELO, NOW, "UTC");
    expect(r.highestPeak).toEqual({ players: [1, 3], rating: 1561 });
    expect(r.biggestUpset).toMatchObject({
      gameId: "b",
      winner: "FASCIST",
      chance: 0.25,
      change: 24,
      winners: [4, 5],
      losers: [1, 2, 3],
    });
    expect(r.biggestUpset!.endedAt).toBe(RATED[1].endedAt);
  });

  it("anUpsetTieGoesToTheLaterGame", () => {
    expect(computeRecords(RATED.slice(0, 4), RATED_ELO, NOW, "UTC").biggestUpset).toEqual({
      gameId: "d",
      endedAt: RATED[3].endedAt,
      winner: "LIBERAL",
      chance: 0.25,
      change: 24,
      winners: [1, 2, 3],
      losers: [4, 5],
    });
  });

  it("aWinByCpuSeatsAloneIsNoUpset", () => {
    // Review Focus 2: e's winners had a 0.125 chance, but no person won it.
    expect(computeRecords(RATED, RATED_ELO, NOW, "UTC").biggestUpset).toMatchObject({ gameId: "d", chance: 0.25 });
  });

  it("noRatingRecordsWithoutGames", () => {
    const r = computeRecords([], { ratings: new Map(), history: [], games: new Map() }, NOW, "UTC");
    expect(r.highestPeak).toBeNull();
    expect(r.biggestUpset).toBeNull();
  });

  it("onTheContractFixture", () => {
    // DEFAULT_FILTER leaves out the fixture's games with CPU seats, where a CPU-won swing is no upset.
    const counted = countedGames(fixtureGames(), DEFAULT_FILTER);
    const elo = replayElo(counted);
    const r = computeRecords(counted, elo, NOW, "UTC");
    // A side moves together, so with no CPU seats the upset is also the biggest swing.
    expect(r.biggestUpset!.change).toBeCloseTo(Math.max(...counted.map((g) => Math.abs(elo.games.get(g.id)!.liberalChange))));
    expect(r.highestPeak!.rating).toBe(Math.round(Math.max(...Array.from(elo.ratings.values()).map((p) => p.peak))));
    r.byPlayer.forEach((p) =>
      expect(Math.max(Math.abs(p.current), p.longestWin ? p.longestWin.length : 0, p.bestMonth ? p.bestMonth.wins : 0)).toBeLessThanOrEqual(
        p.games
      )
    );
  });

});

describe("computeRecords' speed", () => {
  it("theRecordsOf1000MonthsUnderASecond", () => {
    // The spec's "well under a second", however many months the games span: a game a month.
    const games = Array.from({ length: 1000 }, (_, i) => {
      const start = new Date(Date.UTC(1950, i, 10, 20)).toISOString();
      return played(`m${i}`, start, [(i % 5) + 1], [((i + 1) % 5) + 1, ((i + 2) % 5) + 1]);
    });
    const now = games[games.length - 1].endedAt + 60 * 60 * 1000;
    const start = performance.now();
    const r = computeRecords(games, NO_ELO, now, "UTC");
    expect(performance.now() - start).toBeLessThan(1000);
    expect(r.monthHistory).toHaveLength(999);
    expect(r.monthHistory[0]).toMatchObject({ key: "2033-03", players: [4], wins: 1 }); // m998
  });

  it("theStatsModulesOn1000GamesUnderASecond", () => {
    // The spec: computing the stats for 1,000 games takes well under a second.
    const base = fixtureGames();
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const games: GameRecord[] = [];
    for (let copy = 0; games.length < 1000; copy++) {
      for (const g of base) {
        if (games.length === 1000) break;
        games.push({ ...g, id: `${g.id}-${copy}`, startedAt: g.startedAt + copy * WEEK, endedAt: g.endedAt + copy * WEEK });
      }
    }
    const counted = countedGames(games, { players: null, cpu: true });
    const elo = replayElo(counted);
    const now = counted[counted.length - 1].endedAt + 60 * 60 * 1000;
    const start = performance.now();
    computeActivity(counted, now, "UTC");
    computeTiming(counted);
    const r = computeRecords(counted, elo, now, "UTC");
    expect(performance.now() - start).toBeLessThan(1000);
    expect(r.monthHistory.length).toBeGreaterThan(3);
  });
});
