import { describe, expect, it } from "vitest";
import { rate } from "./counting";
import { awardTrophies, TROPHIES, trophyHolders, type TrophyFacts, type TrophyId } from "./trophies";

/** A player past no threshold but the 8-game minimum, with `overrides` on top. */
function base(overrides: Partial<TrophyFacts> = {}): TrophyFacts {
  return {
    games: 8,
    rating: 1500,
    provisional: false,
    longestWinStreak: 0,
    opponents: [],
    hitlerExecutions: 0,
    wonAsElectedHitler: 0,
    fascistGivenOneOfEach: rate(0, 0),
    liberalAccuracy: rate(0, 0),
    fffAsLiberalPresident: 0,
    liberalVoteAccuracy: rate(0, 0),
    survival: rate(0, 8),
    ...overrides,
  };
}

/** The ids player 1 holds with `facts`, of `total` counted games in all. */
function idsOf(facts: TrophyFacts, total = 100, speedDemon: number | null = null): TrophyId[] {
  return awardTrophies(new Map([[1, facts]]), total, speedDemon).get(1)!.map((t) => t.id);
}

const opponent = (games: number, wins: number, losses: number) => ({ games, wins, losses });

type Case = [TrophyId, string, Partial<TrophyFacts>, number?];

const holds: Case[] = [
  ["regular", "20 games", { games: 20 }],
  ["regular", "21 games", { games: 21 }],
  ["everPresent", "8 of 16", { games: 8 }, 16],
  ["everPresent", "9 of 16", { games: 9 }, 16],
  ["onFire", "a streak of 3", { longestWinStreak: 3 }],
  ["onFire", "a streak of 4", { longestWinStreak: 4 }],
  ["onTheRise", "1549.5", { rating: 1549.5 }],
  ["onTheRise", "1599", { rating: 1599 }],
  ["elite", "1599.5", { rating: 1599.5 }],
  ["elite", "1650", { rating: 1650 }],
  ["onTheRise", "1650 (Elite too)", { rating: 1650 }],
  ["dominantRivalry", "9 games 7–2", { opponents: [opponent(9, 7, 2)] }],
  ["dominantRivalry", "12 games 10–2", { opponents: [opponent(12, 10, 2)] }],
  ["familiarFoe", "10 games", { opponents: [opponent(10, 5, 5)] }],
  ["familiarFoe", "11 games", { opponents: [opponent(11, 5, 6)] }],
  ["hitlerHunter", "1 with 1 game", { games: 1, hitlerExecutions: 1 }],
  ["hitlerHunter", "2", { hitlerExecutions: 2 }],
  ["chancellorHitler", "1 with 1 game", { games: 1, wonAsElectedHitler: 1 }],
  ["deepCover", "2 of 4", { fascistGivenOneOfEach: rate(2, 4) }],
  ["deepCover", "3 of 4", { fascistGivenOneOfEach: rate(3, 4) }],
  ["honestBroker", "10 of 10", { liberalAccuracy: rate(10, 10) }],
  ["honestBroker", "11 of 11", { liberalAccuracy: rate(11, 11) }],
  ["cursedHands", "3 FFF", { fffAsLiberalPresident: 3 }],
  ["cursedHands", "4 FFF", { fffAsLiberalPresident: 4 }],
  ["sharpEye", "23 of 30", { liberalVoteAccuracy: rate(23, 30) }],
  ["sharpEye", "30 of 40", { liberalVoteAccuracy: rate(30, 40) }],
  ["survivor", "9 of 10", { games: 10, survival: rate(9, 10) }],
  ["survivor", "10 of 11", { games: 11, survival: rate(10, 11) }],
];

const doesNot: Case[] = [
  ["regular", "19 games", { games: 19 }],
  ["everPresent", "8 of 17", { games: 8 }, 17],
  ["everPresent", "7 of 10", { games: 7 }, 10],
  ["onFire", "a streak of 2", { longestWinStreak: 2 }],
  ["onFire", "a streak of 3 with 7 games", { games: 7, longestWinStreak: 3 }],
  ["onTheRise", "1549.4", { rating: 1549.4 }],
  ["onTheRise", "1560 provisional", { rating: 1560, provisional: true }],
  ["onTheRise", "1560 with 7 games", { rating: 1560, games: 7 }],
  ["elite", "1599.4", { rating: 1599.4 }],
  ["dominantRivalry", "8 games 6–2", { opponents: [opponent(8, 6, 2)] }],
  ["dominantRivalry", "7 games 6–1", { opponents: [opponent(7, 6, 1)] }],
  ["dominantRivalry", "two opponents of 9 games 6–3", { opponents: [opponent(9, 6, 3), opponent(9, 6, 3)] }],
  ["familiarFoe", "9 games", { opponents: [opponent(9, 5, 4)] }],
  ["hitlerHunter", "none", { hitlerExecutions: 0 }],
  ["chancellorHitler", "none", { wonAsElectedHitler: 0 }],
  ["deepCover", "1 of 4", { fascistGivenOneOfEach: rate(1, 4) }],
  ["deepCover", "2 of 3", { fascistGivenOneOfEach: rate(2, 3) }],
  ["deepCover", "2 of 4 with 7 games", { games: 7, fascistGivenOneOfEach: rate(2, 4) }],
  ["honestBroker", "9 of 10", { liberalAccuracy: rate(9, 10) }],
  ["honestBroker", "9 of 9", { liberalAccuracy: rate(9, 9) }],
  ["cursedHands", "2 FFF", { fffAsLiberalPresident: 2 }],
  ["sharpEye", "22 of 30", { liberalVoteAccuracy: rate(22, 30) }],
  ["sharpEye", "22 of 29", { liberalVoteAccuracy: rate(22, 29) }],
  ["survivor", "8 of 10", { games: 10, survival: rate(8, 10) }],
  ["survivor", "9 of 9", { games: 9, survival: rate(9, 9) }],
];

describe("awardTrophies", () => {
  it.each(holds)("%s holds at %s", (id, _label, overrides, total) => {
    expect(idsOf(base(overrides), total ?? 100)).toContain(id);
  });

  it.each(doesNot)("%s does not hold at %s", (id, _label, overrides, total) => {
    expect(idsOf(base(overrides), total ?? 100)).not.toContain(id);
  });

  it("belowTheMinimumOnlyTwoHold", () => {
    const everything = base({
      games: 7,
      rating: 1700,
      longestWinStreak: 7,
      opponents: [opponent(7, 7, 0)],
      hitlerExecutions: 1,
      wonAsElectedHitler: 1,
      fascistGivenOneOfEach: rate(4, 4),
      liberalAccuracy: rate(7, 7),
      fffAsLiberalPresident: 7,
      liberalVoteAccuracy: rate(7, 7),
      survival: rate(7, 7),
    });
    expect(idsOf(everything, 10)).toEqual(["hitlerHunter", "chancellorHitler"]);
  });

  it("aPlayersTrophiesFollowTheTable", () => {
    const facts = base({ games: 20, rating: 1620, survival: rate(19, 20) });
    expect(idsOf(facts)).toEqual(["regular", "onTheRise", "elite", "survivor"]);
  });

  it("speedDemonIsTimingsHolder", () => {
    const facts = new Map([
      [1, base({ games: 30 })],
      [2, base({ games: 1 })],
    ]);
    const held = awardTrophies(facts, 100, 2);
    expect(held.get(1)!.map((t) => t.id)).not.toContain("speedDemon");
    expect(held.get(2)!.map((t) => t.id)).toEqual(["speedDemon"]);

    const none = awardTrophies(facts, 100, null);
    expect(Array.from(none.values()).flat().map((t) => t.id)).not.toContain("speedDemon");

    const unknown = awardTrophies(facts, 100, 9);
    expect(Array.from(unknown.values()).flat().map((t) => t.id)).not.toContain("speedDemon");
    expect(unknown.has(9)).toBe(false);
    expect(Array.from(unknown.keys())).toEqual([1, 2]);
  });

  it("gives every player a list, empty when they hold none", () => {
    expect(awardTrophies(new Map([[4, base()]]), 100, null).get(4)).toEqual([]);
  });
});

describe("TROPHIES", () => {
  it("theTableIsTheSpecs", () => {
    expect(TROPHIES.map((t) => t.label)).toEqual([
      "Regular",
      "Ever-Present",
      "On Fire",
      "On the Rise",
      "Elite",
      "Dominant Rivalry",
      "Familiar Foe",
      "Hitler Hunter",
      "Chancellor Hitler",
      "Deep Cover",
      "Honest Broker",
      "Cursed Hands",
      "Sharp Eye",
      "Survivor",
      "Speed Demon",
    ]);
    expect(TROPHIES[0].rule).toBe("At least 20 counted games");
    expect(TROPHIES.find((t) => t.id === "everPresent")!.rule).toBe(
      "In at least half of all counted games (with the usual 8 of their own)"
    );
    expect(TROPHIES.find((t) => t.id === "speedDemon")!.rule).toBe(
      "The fastest average vote of everyone with 30 or more timed votes (one holder; ties go to more votes, then the name)"
    );
    expect(TROPHIES.map((t) => t.rule)).toEqual([
      "At least 20 counted games",
      "In at least half of all counted games (with the usual 8 of their own)",
      "A win streak of 3 or more, ever",
      "Elo at least 1550, not provisional",
      "Elo at least 1600, not provisional",
      "At least 5 more wins than losses against one opponent, over 8 or more games on opposite sides",
      "At least 10 games on opposite sides with one player",
      "Executed Hitler at least once (no minimum)",
      "Won as Hitler by being elected chancellor (no minimum)",
      "As a Fascist (not Hitler) chancellor given one of each, enacted the Liberal at least half the time, over 4 or more chances",
      "Liberal accuracy of 100% over 10 or more mixed hands",
      "Drew FFF at least 3 times as a Liberal president",
      "Liberal vote accuracy of at least 75% over 30 or more votes as a Liberal",
      "Alive at the end of at least 90% of 10 or more games",
      "The fastest average vote of everyone with 30 or more timed votes (one holder; ties go to more votes, then the name)",
    ]);
  });
});

describe("trophyHolders", () => {
  it("holdersAreListedPerTrophy", () => {
    const regular = TROPHIES.find((t) => t.id === "regular")!;
    const elite = TROPHIES.find((t) => t.id === "elite")!;
    const held = new Map([
      [1, [regular]],
      [2, [regular, elite]],
    ]);
    const names = new Map([
      [1, "Bo"],
      [2, "Ann"],
    ]);
    const holders = trophyHolders(held, names);
    expect(holders.map((h) => h.trophy)).toEqual([...TROPHIES]);
    expect(holders.find((h) => h.trophy.id === "regular")!.players).toEqual([2, 1]);
    expect(holders.find((h) => h.trophy.id === "elite")!.players).toEqual([2]);
    expect(holders.filter((h) => h.trophy.id !== "regular" && h.trophy.id !== "elite").every((h) => h.players.length === 0)).toBe(
      true
    );
  });
});
