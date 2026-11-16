import { describe, expect, it } from "vitest";
import { countedGames, DEFAULT_FILTER } from "../counting";
import { replayElo } from "../elo";
import { sampleData } from "../players/testStats";
import { defaultElo, gameEloChange } from "./gameElo";

describe("gameElo", () => {
  it("theFirstFiveSeatGameMovesSixteen", () => {
    const change = gameEloChange(sampleData(), "g1");
    expect(change).not.toBeNull();
    expect(change!.gameId).toBe("g1");
    expect(change!.liberalChange).toBeCloseTo(16);
  });

  it("cpuUnfinishedAndUnknownHaveNone", () => {
    const data = sampleData();
    expect(gameEloChange(data, "cpu")).toBeNull();
    expect(gameEloChange(data, "unf")).toBeNull();
    expect(gameEloChange(data, "nope")).toBeNull();
  });

  it("defaultEloIsReplayedOnce", () => {
    const data = sampleData();
    const first = defaultElo(data);
    expect(defaultElo(data)).toBe(first);
    expect(first).toEqual(replayElo(countedGames(data.games, DEFAULT_FILTER)));
    expect(defaultElo(sampleData())).not.toBe(first);
  });
});
