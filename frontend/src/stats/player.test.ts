import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { computeOverview } from "./overview";
import { computePlayer, computePlayersList, withoutPlayerFilter, type PlayerStats } from "./player";
import { SAMPLE_NOW, sampleData, TZ, withRatings } from "./players/testStats";
import { parseStatsData } from "./record";
import { computeRivals } from "./rivals";
import { buildStats } from "./useStats";

const data = sampleData();
const ctx = buildStats(data, DEFAULT_FILTER);
const game = (id: string) => data.games.find((g) => g.id === id)!;
const ann = () => computePlayer(ctx, 1, SAMPLE_NOW);
const pair = (r: { hits: number; chances: number }) => [r.hits, r.chances];

describe("computePlayer", () => {
  it("annsCountsAndDates", () => {
    const p = ann();
    expect(p.player).toBe(1);
    expect(p.name).toBe("Ann");
    expect(p.games).toBe(6);
    expect(p.firstPlayed).toBe(game("g1").startedAt);
    expect(p.lastPlayed).toBe(game("g6").endedAt);
    expect(p.cpuNotCounted).toBe(1);
    expect(p.allGames).toBe(8);
  });

  it("annsRolesWinsAndStreaks", () => {
    const p = ann();
    expect([p.roles.liberal, p.roles.fascist, p.roles.hitler]).toEqual([4, 1, 1]);
    expect(p.roles.expectedLiberal).toBeCloseTo(0.6);
    expect(p.roles.luck).toBeCloseTo(4 / 6 - 0.6);
    expect(pair(p.winRate.overall)).toEqual([5, 6]);
    expect(p.winRate.overall.value).toBeCloseTo(5 / 6);
    expect(pair(p.winRate.liberal)).toEqual([3, 4]);
    expect(p.winRate.liberal.value).toBeNull();
    expect(pair(p.winRate.fascist)).toEqual([1, 1]);
    expect(pair(p.winRate.hitler)).toEqual([1, 1]);
    expect(p.winRate.bySeats).toHaveLength(1);
    expect(p.winRate.bySeats[0].seats).toBe(5);
    expect(pair(p.winRate.bySeats[0].rate)).toEqual([5, 6]);
    expect(p.streaks).toEqual({ current: 1, longestWin: 4, longestLoss: 1 });
  });

  it("annsCardsVotesAndPowers", () => {
    const p = ann();
    expect(p.cards.hands).toEqual([2, 1, 0, 0]);
    expect(pair(p.cards.liberalAccuracy)).toEqual([1, 1]);
    expect(pair(p.cards.oneOfEach.FASCIST)).toEqual([1, 1]);
    expect(p.cards.forced).toEqual({ president: 2, chancellor: 0 });
    expect(pair(p.votes.ja)).toEqual([4, 4]);
    expect(pair(p.votes.liberalAccuracy)).toEqual([3, 3]);
    expect(p.powers.executions).toBe(1);
    expect(p.powers.hitlerExecutions).toBe(1);
    expect(p.powers.investigations).toBe(0);
    expect(p.powers.foundFascist).toBe(0);
    expect(pair(p.powers.survival)).toEqual([5, 6]);
  });

  it("annsTiming", () => {
    expect(ann().timing).toEqual({ nominate: 10000, vote: 2000, discard: 1000, chancellor: 2000, power: 3000, endTerm: 1000 });
  });

  it("mostPlayedWithBreaksTiesByName", () => {
    expect(ann().people.mostPlayedWith).toEqual({ player: 2, name: "Bo", games: 6 });
  });

  it("peopleComeFromRivals", () => {
    const theirs = computeRivals(ctx.counted, ctx.names).byPlayer.get(1)!;
    const { people } = ann();
    const named = <T extends { player: number }>(x: T | null) => (x === null ? null : { ...x, name: ctx.names.get(x.player)! });
    expect(people.bestTeammate).toEqual(named(theirs.bestTeammate));
    expect(people.nemesis).toEqual(named(theirs.nemesis));
    expect(people.favouriteOpponent).toEqual(named(theirs.favouriteOpponent));
    expect(people.nemesis).not.toBeNull();
    expect(people.favouriteOpponent).not.toBeNull();
  });

  it("annsElo", () => {
    const { elo } = ann();
    expect(elo).not.toBeNull();
    expect(elo!.provisional).toBe(false);
    expect(typeof elo!.rank).toBe("number");
    expect(elo!.rating).toBe(ctx.elo.ratings.get(1)!.rating);
    expect(elo!.peak).toBe(ctx.elo.ratings.get(1)!.peak);
    expect(elo!.history).toHaveLength(7);
    expect(elo!.history[0]).toEqual({ x: 0, y: 1500, dashed: true });
    expect(elo!.history.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(elo!.history.map((p) => p.dashed)).toEqual([true, true, true, true, true, false, false]);
    expect(elo!.history[6].y).toBeCloseTo(ctx.elo.ratings.get(1)!.rating);
  });

  it("ranks as the power ranking does: settled players by rounded rating, provisional ones unranked", () => {
    const rated = withRatings(ctx, {
      1: { rating: 1540, games: 6 },
      2: { rating: 1560, games: 6 },
      3: { rating: 1520, games: 6 },
      4: { rating: 1540.4, games: 6 },
      5: { rating: 1560, games: 5 },
      6: { rating: 1700, games: 1 },
    });
    // With no player filter, computePlayer reads the context's own ratings. Bo and Ed tie at 1560.
    expect(computePlayer(rated, 2, SAMPLE_NOW).elo!.rank).toBe(1);
    expect(computePlayer(rated, 5, SAMPLE_NOW).elo!.rank).toBe(1);
    expect(computePlayer(rated, 1, SAMPLE_NOW).elo!.rank).toBe(3);
    expect(computePlayer(rated, 4, SAMPLE_NOW).elo!.rank).toBe(3);
    expect(computePlayer(rated, 3, SAMPLE_NOW).elo!.rank).toBe(5);
    expect(computePlayer(rated, 6, SAMPLE_NOW).elo!.rank).toBeNull();
  });

  it("annsLatestGames", () => {
    const { latest } = ann();
    expect(latest.map((g) => g.id)).toEqual(["unf", "g6", "cpu", "g5", "g4"]);
    expect(latest.map((g) => g.result)).toEqual(["unfinished", "won", "won", "lost", "won"]);
    expect(latest.map((g) => g.cpu)).toEqual([false, false, true, false, false]);
    expect(latest[0]).toEqual({
      id: "unf",
      endedAt: game("unf").endedAt,
      role: "LIBERAL",
      result: "unfinished",
      outcome: "UNFINISHED",
      cpu: false,
    });
  });

  it("annsTrophies", () => {
    expect(ann().trophies.map((t) => t.id)).toEqual(["hitlerHunter", "chancellorHitler"]);
  });

  it("theToggleCountsCpuGames", () => {
    const p = computePlayer(buildStats(data, { players: null, cpu: true }), 1, SAMPLE_NOW);
    expect(p.games).toBe(7);
    expect(p.cpuNotCounted).toBe(0);
    expect(pair(p.winRate.overall)).toEqual([6, 7]);
    expect(p.streaks.current).toBe(2);
    expect(p.allGames).toBe(8);
  });

  it("thePlayerFilterIsIgnored", () => {
    const filtered = buildStats(data, { players: new Set([2, 3]), cpu: false });
    expect(computePlayer(filtered, 1, SAMPLE_NOW)).toEqual(ann());
  });

  it("aPlayerWithOnlyCpuGamesHasZeroes", () => {
    const gus: PlayerStats = computePlayer(ctx, 7, SAMPLE_NOW);
    expect(gus.name).toBe("Gus");
    expect(gus.games).toBe(0);
    expect(gus.firstPlayed).toBeNull();
    expect(gus.lastPlayed).toBeNull();
    expect(gus.elo).toBeNull();
    expect(gus.cpuNotCounted).toBe(1);
    expect(gus.allGames).toBe(1);
    expect(gus.latest.map((g) => g.id)).toEqual(["cpu"]);
    expect(gus.trophies).toEqual([]);
    const rates = [
      gus.winRate.overall,
      gus.winRate.liberal,
      gus.winRate.fascist,
      gus.winRate.hitler,
      gus.cards.liberalAccuracy,
      gus.cards.deepCover,
      gus.cards.oneOfEach.LIBERAL,
      gus.cards.oneOfEach.FASCIST,
      gus.cards.oneOfEach.HITLER,
      gus.votes.ja,
      gus.votes.liberalAccuracy,
      gus.votes.fascistLoyalty,
      gus.powers.survival,
    ];
    for (const r of rates) expect(r).toEqual({ hits: 0, chances: 0, value: null });
    expect(gus.winRate.bySeats).toEqual([]);
    expect(gus.roles).toEqual({ liberal: 0, fascist: 0, hitler: 0, expectedLiberal: null, luck: null });
    expect(gus.streaks).toEqual({ current: 0, longestWin: 0, longestLoss: 0 });
    expect(gus.cards.hands).toEqual([0, 0, 0, 0]);
    expect(gus.people).toEqual({ mostPlayedWith: null, bestTeammate: null, nemesis: null, favouriteOpponent: null });
    expect(Object.values(gus.timing).every((ms) => ms === null)).toBe(true);
  });

  it("anUnknownNumberHasNothing", () => {
    const p = computePlayer(ctx, 99, SAMPLE_NOW);
    expect(p.games).toBe(0);
    expect(p.allGames).toBe(0);
    expect(p.latest).toEqual([]);
    expect(p.name).toBe("Player 99");
  });

  it("withoutPlayerFilterKeepsAContextWithNone", () => {
    expect(withoutPlayerFilter(ctx)).toBe(ctx);
    const filtered = buildStats(data, { players: new Set([1]), cpu: true });
    const without = withoutPlayerFilter(filtered);
    expect(without.filter).toEqual({ players: null, cpu: true });
    expect(without.data).toBe(data);
  });
});

describe("computePlayersList", () => {
  it("sortsByEloWithProvisionalLast", () => {
    const rated = withRatings(ctx, {
      1: { rating: 1540, games: 6 },
      2: { rating: 1560, games: 6 },
      3: { rating: 1520, games: 6 },
      4: { rating: 1500, games: 6 },
      5: { rating: 1560, games: 5 },
      6: { rating: 1700, games: 1 },
    });
    const rows = computePlayersList(rated);
    expect(rows.map((r) => r.name)).toEqual(["Bo", "Ed", "Ann", "Cy", "Di", "Fay"]);
    expect(rows.filter((r) => r.provisional).map((r) => r.name)).toEqual(["Fay"]);
  });

  it("listRowsHoldGamesWinRateAndLastPlayed", () => {
    const rows = computePlayersList(ctx);
    const annRow = rows.find((r) => r.player === 1)!;
    expect(annRow.games).toBe(6);
    expect(pair(annRow.winRate)).toEqual([5, 6]);
    expect(annRow.lastPlayed).toBe(game("g6").endedAt);
    expect(annRow.rating).toBe(ctx.elo.ratings.get(1)!.rating);
    const fay = rows.find((r) => r.player === 6)!;
    expect(fay.winRate.value).toBeNull();
    expect(fay.provisional).toBe(true);
    expect(rows.some((r) => r.player === 7)).toBe(false);
  });

  it("theListUsesTheFilter", () => {
    const rows = computePlayersList(buildStats(data, { players: new Set([1, 2, 3, 4, 5]), cpu: false }));
    expect(rows.some((r) => r.player === 6)).toBe(false);
    expect(rows.find((r) => r.player === 1)!.games).toBe(5);
  });
});

describe("the power ranking", () => {
  it("PLAYERS and a player's rank follow OVERVIEW's power ranking", () => {
    const tied = withRatings(ctx, {
      1: { rating: 1540, games: 6 },
      2: { rating: 1560, games: 6 },
      3: { rating: 1520, games: 6 },
      4: { rating: 1540.4, games: 6 },
      5: { rating: 1560, games: 5 },
      6: { rating: 1700, games: 1 },
    });
    // Bo and Ed tie settled at 1560, Cy and Di tie provisional at 1520: each tie goes to more games.
    const provisionalTie = withRatings(ctx, {
      1: { rating: 1540, games: 6 },
      2: { rating: 1560, games: 6 },
      3: { rating: 1520.2, games: 3 },
      4: { rating: 1519.8, games: 4 },
      5: { rating: 1560, games: 5 },
      6: { rating: 1700, games: 1 },
    });
    const fixtureCtx = buildStats(parseStatsData(JSON.parse(JSON.stringify(fixture))), DEFAULT_FILTER);
    for (const stats of [ctx, tied, provisionalTie, fixtureCtx]) {
      const overview = computeOverview(stats, SAMPLE_NOW, TZ).powerRanking;
      expect(computePlayersList(stats).map((row) => row.player)).toEqual(overview.map((row) => row.player));
      for (const row of overview) expect(computePlayer(stats, row.player, SAMPLE_NOW, TZ).elo!.rank, `player ${row.player}`).toBe(row.rank);
    }
  });
});

