import { describe, expect, it } from "vitest";
import { countedGames, DEFAULT_FILTER, humanSeats } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { formatLocalDateTime } from "./format";
import { formatRating } from "./numbers";
import {
  computeOverview,
  HOT_HAND_GAMES,
  HOT_HAND_WINS,
  LATEST_GAMES,
  playerOfTheMonth,
  RECENT_DAYS,
  RECENT_MS,
  ratingPointDetail,
  winStreaks,
} from "./overview";
import { parseStatsData, type GameRecord, type Player, type StatsData } from "./record";
import { game, generateData, match, seatsOf } from "./testGames";
import { overviewDay as d, overviewFixture } from "./testOverview";
import { buildStats } from "./useStats";

const fx = overviewFixture();
const overview = (data: StatsData = fx.data, now = fx.now, timeZone = "UTC", filter = DEFAULT_FILTER) =>
  computeOverview(buildStats(data, filter), now, timeZone);
const withGames = (extra: GameRecord[], players: Player[] = []): StatsData => ({
  players: [...fx.data.players, ...players],
  games: [...fx.data.games, ...extra],
});
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Every path in `value` (objects, arrays, maps and sets) that holds `NaN`, `Infinity` or `undefined`. */
function badValues(value: unknown, path = "result"): string[] {
  if (value === undefined) return [path];
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (value === null || typeof value !== "object") return [];
  if (value instanceof Map) {
    const out: string[] = [];
    value.forEach((v, k) => out.push(...badValues(v, `${path}.get(${String(k)})`)));
    return out;
  }
  if (value instanceof Set) return [];
  if (Array.isArray(value)) return value.reduce<string[]>((out, v, i) => out.concat(badValues(v, `${path}[${i}]`)), []);
  return Object.entries(value).reduce<string[]>((out, [k, v]) => out.concat(badValues(v, `${path}.${k}`)), []);
}

describe("the constants", () => {
  it("are the plan's", () => {
    expect([RECENT_DAYS, RECENT_MS, LATEST_GAMES, HOT_HAND_GAMES, HOT_HAND_WINS]).toEqual([7, 7 * 24 * HOUR, 10, 5, 3]);
  });
});

describe("computeOverview", () => {
  it("theFixtureDashboard", () => {
    const o = overview();
    expect(o.daysSinceLastGame).toBe(2);
    expect(o.lastGame?.id).toBe("g07");
    expect(o.winStreak).toEqual({ players: [1], value: 4 });
    expect(o.hotHand).toEqual({ players: [1], value: 4 });
    expect(o.playerOfMonth).toEqual({ players: [1], value: 4 });
    expect(o.headline.liberalWins).toBe(5);
    expect(o.headline.fascistWins).toBe(2);
  });

  it("theFixtureHeadline", () => {
    const { headline } = overview();
    const rows = <T>(list: { player: number; rank: number | null; value: T }[]) =>
      list.map((r) => [r.player, r.rank, r.value]);
    expect(rows(headline.games)).toEqual([
      [1, 1, 5],
      [9, 1, 5],
      [2, 3, 2],
      [3, 3, 2],
    ]);
    expect(rows(headline.wins)).toEqual([
      [1, 1, 4],
      [9, 2, 1],
      [2, 2, 1],
      [3, 2, 1],
    ]);
    expect(headline.winRate.map((r) => [r.player, r.rank])).toEqual([
      [1, 1],
      [9, 2],
      [2, null],
      [3, null],
    ]);
    expect(headline.winRate[0].value.value).toBe(0.8);
    const value = (list: { player: number; value: number }[], player: number) =>
      list.find((r) => r.player === player)?.value;
    expect([value(headline.currentStreak, 1), value(headline.currentStreak, 9)]).toEqual([4, 0]);
    expect([value(headline.longestStreak, 1), value(headline.longestStreak, 9)]).toEqual([4, 1]);
    // The count is each player's games.
    expect(headline.wins.map((r) => r.count)).toEqual([5, 5, 2, 2]);
  });

  it("powerRankingPutsProvisionalPlayersLast", () => {
    const ctx = buildStats(fx.data, DEFAULT_FILTER);
    const { powerRanking } = computeOverview(ctx, fx.now, "UTC");
    expect(powerRanking.map((r) => r.player)).toEqual([1, 9, 3, 2]);
    expect(powerRanking.map((r) => Math.round(r.rating))).toEqual([1543, 1459, 1500, 1498]);
    expect(powerRanking.map((r) => r.rank)).toEqual([1, 2, null, null]);
    expect(powerRanking.map((r) => r.provisional)).toEqual([false, false, true, true]);
    for (const row of powerRanking) {
      const elo = ctx.elo.ratings.get(row.player)!;
      expect(row.rating).toBe(elo.rating);
      expect(row.lastChange).toBe(elo.lastChange);
      expect(row.games).toBe(elo.games);
    }
  });

  it("provisionalPlayersTieOnTheirShownRating", () => {
    // Two provisional players who both show 1500 go by more games, then name, never by the
    // fraction the page does not show; so do two settled ones, who share a rank.
    const rating = (player: number, value: number, games: number) => ({
      player,
      rating: value,
      games,
      provisional: games < 5,
      lastChange: 0,
      peak: value,
    });
    const ctx = buildStats(fx.data, DEFAULT_FILTER);
    const elo = {
      ratings: new Map([
        [1, rating(1, 1500.4, 3)],
        [2, rating(2, 1499.6, 4)],
        [3, rating(3, 1500.2, 3)],
        [9, rating(9, 1600.4, 9)],
        [4, rating(4, 1599.6, 9)],
      ]),
      history: [],
      games: new Map(),
    };
    const names = new Map([...ctx.names, [4, "Al"]]);
    const { powerRanking } = computeOverview({ ...ctx, counted: [], elo, names }, fx.now, "UTC");
    expect(powerRanking.map((r) => [r.player, r.rank])).toEqual([
      [4, 1],
      [9, 1],
      [2, null],
      [1, null],
      [3, null],
    ]);
  });

  it("ratingHistoryCarriesAndDashes", () => {
    const { ratingHistory } = overview();
    expect(ratingHistory.map((line) => line.player)).toEqual([1, 2, 3, 9]);
    const ann = ratingHistory[0].points;
    expect(ann.map((p) => [p.game, p.provisional, p.change === null])).toEqual([
      [1, true, false],
      [2, true, false],
      [3, true, false],
      [4, true, false],
      [5, false, false],
      [6, false, true],
    ]);
    expect(ann[0].change).toBeCloseTo(ann[0].rating - 1500);
    expect(ann[1].change).toBeCloseTo(ann[1].rating - ann[0].rating);
    // Carried flat through the game she missed.
    expect(ann[5].rating).toBe(ann[4].rating);
    // Cy starts at the first game; Bo at the fifth.
    expect(ratingHistory[2].points[0].game).toBe(0);
    expect(ratingHistory[1].points[0].game).toBe(4);
  });

  it("ratingPointDetail", () => {
    const { ratingHistory } = overview();
    const ann = ratingHistory[0].points;
    const g07 = fx.data.games.find((g) => g.id === "g07")!;
    const g06 = fx.data.games.find((g) => g.id === "g06")!;
    const missed = ratingPointDetail(g07, "Ann", ann[5]);
    expect(missed).toEqual([
      "Ann",
      `${formatLocalDateTime(g07.startedAt)} · Liberals win · 5 Liberal policies`,
      `Did not play · ${formatRating(ann[5].rating)}`,
    ]);
    const played = ratingPointDetail(g06, "Ann", ann[4]);
    expect(played[2]).toMatch(/^\+\d+ → \d+$/);
    expect(played[2]).toBe(`+${Math.round(ann[4].change!)} → ${Math.round(ann[4].rating)}`);
    // In a zone given, at the game's start, as every date on the stats pages.
    expect(ratingPointDetail(g07, "Ann", ann[5], "UTC")[1]).toBe(
      "Fri 13 Nov 2026, 8:30 PM · Liberals win · 5 Liberal policies"
    );
  });

  it("streakTiesAndTheSevenDayEdge", () => {
    // Dee wins four in a row, like Ann: both lead, Ann (five games) first.
    const dee = [1, 2, 3, 4].map((i) => match(`dee${i}`, d(1, 10 + i), [4], [5]));
    const players = [
      { number: 4, name: "Dee" },
      { number: 5, name: "Eli" },
    ];
    expect(overview(withGames(dee, players)).winStreak).toEqual({ players: [1, 4], value: 4 });

    // Eve wins five in a row, her last starting exactly seven days before now: she leads.
    const eve = (lastStart: number) =>
      [4, 3, 2, 1, 0].map((back, i) =>
        game(`eve${i + 1}`, lastStart - back * HOUR + 30 * MINUTE, seatsOf([6, 7], ["LIBERAL", "FASCIST"]), "LIBERAL", {
          startedAt: lastStart - back * HOUR,
        })
      );
    const evePlayers = [
      { number: 6, name: "Eve" },
      { number: 7, name: "Fay" },
    ];
    expect(overview(withGames(eve(fx.now - RECENT_MS), evePlayers)).winStreak).toEqual({ players: [6], value: 5 });
    // A millisecond earlier, she is out of the window.
    expect(overview(withGames(eve(fx.now - RECENT_MS - 1), evePlayers)).winStreak).toEqual({ players: [1], value: 4 });
  });

  it("hotHandNeedsFiveGames", () => {
    const players = [1, 2, 5, 6, 7, 8, 9].map((number) => ({ number, name: `N${number}` }));
    const games = [
      // Player 1: 4 wins in 4 games, against player 5 (4 games).
      ...[1, 2, 3, 4].map((i) => match(`a${i}`, d(4, 10 + i), [1], [5])),
      // Player 2: 2 wins in 5 games, against a different player each loss.
      match("b1", d(3, 10), [2], [9]),
      match("b2", d(3, 11), [2], [9]),
      match("b3", d(3, 12), [6], [2]),
      match("b4", d(3, 13), [7], [2]),
      match("b5", d(3, 14), [8], [2]),
    ];
    const o = overview({ players, games });
    expect(o.hotHand).toBeNull();
    // A fifth game, lost, makes player 1 hot: 4 of 5.
    expect(overview({ players, games: [...games, match("a5", d(1), [5], [1])] }).hotHand).toEqual({
      players: [1],
      value: 4,
    });
  });

  it("aGameEndingAt2359SeenAt0001IsADayAgo", () => {
    const data: StatsData = { players: fx.data.players, games: [match("x", Date.UTC(2026, 10, 14, 23, 59), [1], [2])] };
    const now = Date.UTC(2026, 10, 15, 0, 1);
    expect(overview(data, now, "UTC").daysSinceLastGame).toBe(1);
    expect(overview(data, now, "America/New_York").daysSinceLastGame).toBe(0);
    // A game that ended after now (a clock ahead) is today, never a negative day.
    expect(overview(data, Date.UTC(2026, 10, 13, 12), "UTC").daysSinceLastGame).toBe(0);
  });

  it("latestGamesAreTheTenNewestCounted", () => {
    const games = Array.from({ length: 12 }, (_, i) => match(`g${String(i + 1).padStart(2, "0")}`, d(20 - i), [1], [2]));
    const ids = overview({ players: fx.data.players, games }).latestGames.map((g) => g.id);
    expect(ids).toEqual(["g12", "g11", "g10", "g09", "g08", "g07", "g06", "g05", "g04", "g03"]);
  });

  it("noCountedGames", () => {
    const o = overview(fx.data, fx.now, "UTC", { players: new Set(), cpu: false });
    expect(o).toEqual({
      daysSinceLastGame: null,
      lastGame: null,
      winStreak: null,
      hotHand: null,
      playerOfMonth: null,
      powerRanking: [],
      ratingHistory: [],
      headline: { games: [], wins: [], winRate: [], currentStreak: [], longestStreak: [], liberalWins: 0, fascistWins: 0 },
      latestGames: [],
    });
  });

  it("oneCountedGame", () => {
    // Cy and Zed share only g01.
    const o = overview(fx.data, fx.now, "UTC", { players: new Set([3, 9]), cpu: false });
    expect(o.ratingHistory.map((line) => [line.player, line.points.map((p) => p.game)])).toEqual([
      [3, [0]],
      [9, [0]],
    ]);
    expect(o.daysSinceLastGame).toBe(9);
    expect(o.lastGame?.id).toBe("g01");
    expect(o.powerRanking.map((r) => [r.player, r.rank])).toEqual([
      [3, null],
      [9, null],
    ]);
    expect(badValues(o)).toEqual([]);
  });

  it("theContractFixtureAddsUp", () => {
    const data = parseStatsData(fixture);
    const ctx = buildStats(data, DEFAULT_FILTER);
    const o = computeOverview(ctx, Date.now(), "UTC");
    const finishedHuman = data.games.filter(
      (g) => g.outcome !== "UNFINISHED" && g.winner !== null && !g.hasCpu && !g.seats.some((s) => s.cpu)
    );
    expect(finishedHuman.length).toBeGreaterThan(0);
    expect(data.games.some((g) => g.seats.some((s) => s.cpu))).toBe(true);
    expect(ctx.counted.map((g) => g.id).sort()).toEqual(finishedHuman.map((g) => g.id).sort());
    for (const g of finishedHuman) expect(ctx.elo.games.has(g.id)).toBe(true);
    for (const row of o.powerRanking) expect(Number.isFinite(row.rating)).toBe(true);
    for (const line of o.ratingHistory) for (const p of line.points) expect(Number.isFinite(p.rating)).toBe(true);
    expect(o.headline.liberalWins + o.headline.fascistWins).toBe(ctx.counted.length);
    const seats = countedGames(data.games, DEFAULT_FILTER).reduce((n, g) => n + humanSeats(g).length, 0);
    expect(o.headline.games.reduce((n, r) => n + r.value, 0)).toBe(seats);
    expect(badValues(o)).toEqual([]);
  });

  it("computesOverviewFor1000GamesWellUnderASecond", () => {
    const data = generateData(1000, 17);
    const start = performance.now();
    const o = computeOverview(buildStats(data, { players: null, cpu: true }), Date.UTC(2026, 10, 15), "UTC");
    const took = performance.now() - start;
    expect(o.latestGames).toHaveLength(LATEST_GAMES);
    expect(took).toBeLessThan(1000);
  });
});

describe("winStreaks", () => {
  it("winStreaksRunBothWays", () => {
    const results = "WWLWWLL";
    const games = results
      .split("")
      .map((r, i) => match(`p2-${i + 1}`, d(10 - i), r === "W" ? [2] : [8], r === "W" ? [8] : [2]));
    const s = winStreaks(games).get(2)!;
    expect(s).toEqual({
      games: 7,
      current: 0,
      longestWin: { player: 2, length: 2, firstGameId: "p2-4", lastGameId: "p2-5" },
      longestLoss: { player: 2, length: 2, firstGameId: "p2-6", lastGameId: "p2-7" },
    });
    // The other side of every game: the mirror image.
    expect(winStreaks(games).get(8)).toEqual({
      games: 7,
      current: 2,
      longestWin: { player: 8, length: 2, firstGameId: "p2-6", lastGameId: "p2-7" },
      longestLoss: { player: 8, length: 2, firstGameId: "p2-4", lastGameId: "p2-5" },
    });
  });

  it("aPlayerWhoNeverLostHasNoLosingRun", () => {
    const s = winStreaks([match("a", d(2), [1], [2]), match("b", d(1), [1], [2])]);
    expect(s.get(1)).toEqual({
      games: 2,
      current: 2,
      longestWin: { player: 1, length: 2, firstGameId: "a", lastGameId: "b" },
      longestLoss: null,
    });
    expect(s.get(2)).toMatchObject({ current: 0, longestWin: null, longestLoss: { length: 2 } });
  });

  it("aCpuSeatHasNoStreak", () => {
    const s = winStreaks([game("c", d(1), seatsOf([1, null], ["LIBERAL", "FASCIST"]), "LIBERAL")]);
    expect(Array.from(s.keys())).toEqual([1]);
  });
});

describe("playerOfTheMonth", () => {
  const now = fx.now;
  const november = (id: string, day: number, winner: number) => match(id, Date.UTC(2026, 10, day, 20, 30), [winner], [9]);
  const halloween = (id: string) => match(id, Date.UTC(2026, 9, 31, 23, 30) + 30 * MINUTE, [3], [9]);
  const base = [
    november("a1", 3, 1),
    november("a2", 4, 1),
    november("a3", 5, 1),
    november("b1", 3, 2),
    november("b2", 6, 2),
    november("b3", 7, 2),
    halloween("c1"),
    halloween("c2"),
    halloween("c3"),
  ].sort((a, b) => a.endedAt - b.endedAt || (a.id < b.id ? -1 : 1));

  it("playerOfTheMonthByStartInTheZone", () => {
    expect(playerOfTheMonth(base, now, "UTC")).toEqual({ players: [1, 2], value: 3 });
    // 23:30 UTC on 31 October is 00:30 on 1 November in Paris.
    expect(playerOfTheMonth(base, now, "Europe/Paris")).toEqual({ players: [1, 2, 3], value: 3 });
  });

  it("aWinLaterThisMonthThanNowCounts", () => {
    const later = [...base, november("b4", 20, 2)];
    expect(playerOfTheMonth(later, now, "UTC")).toEqual({ players: [2], value: 4 });
  });

  it("noHumanWinThisMonthIsNull", () => {
    const cpuWin = game("cpu", Date.UTC(2026, 10, 10, 20), seatsOf([null, 1], ["LIBERAL", "FASCIST"]), "LIBERAL", {});
    const october = match("oct", Date.UTC(2026, 9, 10, 20), [1], [2]);
    expect(playerOfTheMonth([october, cpuWin], now, "UTC")).toBeNull();
    expect(playerOfTheMonth([], now, "UTC")).toBeNull();
  });

  it("tiesGoByGamesThenTheLatestSeatsName", () => {
    const named = (record: GameRecord, names: Record<number, string>) => ({
      ...record,
      seats: record.seats.map((seat) =>
        seat.player !== null && names[seat.player] ? { ...seat, name: names[seat.player] } : seat
      ),
    });
    const games = [
      named(match("z", Date.UTC(2026, 10, 3, 20), [1], [9]), { 1: "Zoe" }),
      named(match("a", Date.UTC(2026, 10, 4, 20), [2], [9]), { 2: "Al" }),
    ];
    expect(playerOfTheMonth(games, now, "UTC")).toEqual({ players: [2, 1], value: 1 });
    // More counted games first, even a game from another month.
    const more = [match("old", Date.UTC(2026, 8, 1, 20), [9], [1]), ...games];
    expect(playerOfTheMonth(more, now, "UTC")).toEqual({ players: [1, 2], value: 1 });
  });
});
