import { describe, expect, it } from "vitest";
import { rate } from "../counting";
import type { PlayerListRow } from "../player";
import { NAME_ORDER, noMatchLine, pressHead, searchPlayers, sortPlayers, type PlayersSort } from "./playersOrder";

const DAY = 24 * 60 * 60 * 1000;
/** 15 Nov 2026, 12:00 UTC. */
const NOON = Date.UTC(2026, 10, 15, 12);

/** A row of PLAYERS: 6 games, 3 wins, 1500 settled, last played at NOON, unless `o` says otherwise. */
function row(player: number, name: string, o: Partial<PlayerListRow> & { wins?: number } = {}): PlayerListRow {
  const games = o.games ?? 6;
  return {
    player,
    name,
    games,
    winRate: o.winRate ?? rate(o.wins ?? 3, games, 5),
    rating: o.rating ?? 1500,
    provisional: o.provisional ?? false,
    lastPlayed: o.lastPlayed ?? NOON,
  };
}

const names = (rows: readonly PlayerListRow[]) => rows.map((r) => r.name);
const sorted = (rows: PlayerListRow[], sort: PlayersSort, timeZone = "UTC") => names(sortPlayers(rows, sort, timeZone));

describe("pressHead", () => {
  it("aFirstPressSortsNamesAToZAndTheRestMostOrLatestFirst", () => {
    const games: PlayersSort = { column: "games", direction: "descending" };
    expect(pressHead(games, "name")).toEqual({ column: "name", direction: "ascending" });
    expect(pressHead(NAME_ORDER, "games")).toEqual({ column: "games", direction: "descending" });
    expect(pressHead(NAME_ORDER, "winRate")).toEqual({ column: "winRate", direction: "descending" });
    expect(pressHead(NAME_ORDER, "rating")).toEqual({ column: "rating", direction: "descending" });
    expect(pressHead(NAME_ORDER, "lastPlayed")).toEqual({ column: "lastPlayed", direction: "descending" });
  });

  it("aSecondPressTurnsTheOrderRound", () => {
    expect(NAME_ORDER).toEqual({ column: "name", direction: "ascending" });
    expect(pressHead(NAME_ORDER, "name")).toEqual({ column: "name", direction: "descending" });
    const elo = pressHead(NAME_ORDER, "rating");
    expect(pressHead(elo, "rating")).toEqual({ column: "rating", direction: "ascending" });
    expect(pressHead(pressHead(elo, "rating"), "rating")).toEqual(elo);
  });
});

describe("sortPlayers", () => {
  it("namesGoAToZIgnoringCaseAndZToAWhenTurnedRoundTiesByNumber", () => {
    const rows = [row(4, "bo"), row(1, "Cy"), row(3, "Ann"), row(2, "ann")];
    expect(sorted(rows, NAME_ORDER)).toEqual(["ann", "Ann", "bo", "Cy"]);
    expect(sortPlayers(rows, NAME_ORDER, "UTC").map((r) => r.player)).toEqual([2, 3, 4, 1]);
    expect(sortPlayers(rows, { column: "name", direction: "descending" }, "UTC").map((r) => r.player)).toEqual([1, 4, 2, 3]);
  });

  it("gamesGoMostFirstThenFewestFirstWithTiesByNameEitherWay", () => {
    const rows = [row(1, "Di", { games: 7 }), row(2, "Bo", { games: 9 }), row(3, "Cy", { games: 7 }), row(4, "Ann", { games: 5 })];
    expect(sorted(rows, { column: "games", direction: "descending" })).toEqual(["Bo", "Cy", "Di", "Ann"]);
    expect(sorted(rows, { column: "games", direction: "ascending" })).toEqual(["Ann", "Cy", "Di", "Bo"]);
  });

  it("winRatesCompareAsShownAndARateBelowItsMinimumGoesBelowEveryRate", () => {
    const rows = [
      row(1, "Ed", { winRate: rate(1, 4, 5) }), // — (4)
      row(2, "Di", { winRate: rate(11, 21, 5) }), // 52.4%, shown 52%
      row(3, "Cy", { winRate: rate(13, 25, 5) }), // 52%
      row(4, "Bo", { winRate: rate(0, 2, 5) }), // — (2)
      row(5, "Ann", { winRate: rate(1, 5, 5) }), // 20%
    ];
    expect(sorted(rows, { column: "winRate", direction: "descending" })).toEqual(["Cy", "Di", "Ann", "Bo", "Ed"]);
    expect(sorted(rows, { column: "winRate", direction: "ascending" })).toEqual(["Ann", "Cy", "Di", "Bo", "Ed"]);
  });

  it("ratingsCompareRoundedAndProvisionalRowsTakeTheirPlace", () => {
    const rows = [
      row(1, "Cy", { rating: 1540.4 }),
      row(2, "Bo", { rating: 1539.6 }),
      row(3, "Fay", { rating: 1700, provisional: true }),
      row(4, "Ann", { rating: 1480 }),
    ];
    expect(sorted(rows, { column: "rating", direction: "descending" })).toEqual(["Fay", "Bo", "Cy", "Ann"]);
    expect(sorted(rows, { column: "rating", direction: "ascending" })).toEqual(["Ann", "Bo", "Cy", "Fay"]);
  });

  it("lastPlayedGoesByLocalDayLatestFirst", () => {
    const rows = [
      row(1, "Di", { lastPlayed: NOON - 3 * DAY }),
      row(2, "Cy", { lastPlayed: Date.UTC(2026, 10, 15, 1) }),
      row(3, "Bo", { lastPlayed: Date.UTC(2026, 10, 15, 23) }),
      row(4, "Ann", { lastPlayed: Date.UTC(2026, 10, 14, 23) }),
    ];
    // In UTC, Bo and Cy played the same day: a tie, by name.
    expect(sorted(rows, { column: "lastPlayed", direction: "descending" })).toEqual(["Bo", "Cy", "Ann", "Di"]);
    expect(sorted(rows, { column: "lastPlayed", direction: "ascending" })).toEqual(["Di", "Ann", "Bo", "Cy"]);
    // In Auckland (UTC+13), Ann's game and Cy's fall on 15 Nov and Bo's on the 16th.
    expect(sorted(rows, { column: "lastPlayed", direction: "descending" }, "Pacific/Auckland")).toEqual(["Bo", "Ann", "Cy", "Di"]);
  });

  it("leavesItsInputAsItWas", () => {
    const rows = [row(2, "Bo", { games: 9 }), row(1, "Ann")];
    sortPlayers(rows, { column: "games", direction: "ascending" }, "UTC");
    expect(names(rows)).toEqual(["Bo", "Ann"]);
  });
});

describe("searchPlayers", () => {
  const rows = [row(1, "Ann"), row(2, "Joanna"), row(3, "Bo"), row(7, "Player 7")];

  it("keepsTheRowsWhoseNameContainsTheSearchIgnoringCase", () => {
    expect(names(searchPlayers(rows, "ann"))).toEqual(["Ann", "Joanna"]);
    expect(names(searchPlayers(rows, "ANNA"))).toEqual(["Joanna"]);
    expect(names(searchPlayers(rows, "player 7"))).toEqual(["Player 7"]);
    expect(names(searchPlayers(rows, "x"))).toEqual([]);
  });

  it("anEmptySearchKeepsEveryRowAndSpacesAtEitherEndCountForNothing", () => {
    expect(searchPlayers(rows, "")).toEqual(rows);
    expect(searchPlayers(rows, "   ")).toEqual(rows);
    expect(names(searchPlayers(rows, "  bo "))).toEqual(["Bo"]);
  });

  it("saysWhatWasSearchedWhenNothingMatches", () => {
    expect(noMatchLine("  zz ")).toBe("No players match “zz”.");
  });
});
