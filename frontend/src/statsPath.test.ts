import { afterEach, describe, expect, it } from "vitest";
import { followMovedStatsPath, isStatsPath, movedStatsPath } from "./statsPath";

describe("isStatsPath", () => {
  it("is true for the stats pages only, by whole segments", () => {
    for (const path of ["/stats", "/stats/", "/stats/roles", "/games", "/games/", "/games/abc", "/players", "/players/3"]) {
      expect(isStatsPath(path), path).toBe(true);
    }
    // GAMES' and PLAYERS' old addresses load the stats too, which send them on.
    expect(isStatsPath("/stats/games/abc")).toBe(true);
    // The players' socket is /game: never a stats page.
    for (const path of ["/", "/stat", "/statsx", "/x/stats", "/game", "/gamesx", "/games-2", "/player", "/playersx", "/x/games"]) {
      expect(isStatsPath(path), path).toBe(false);
    }
  });
});

describe("movedStatsPath", () => {
  it("gives GAMES' and PLAYERS' new address for an old one", () => {
    const moved: [string, string][] = [
      ["/stats/games", "/games"],
      ["/stats/games/", "/games/"],
      ["/stats/games/abc-123", "/games/abc-123"],
      ["/stats/games/a%20b", "/games/a%20b"],
      ["/stats/players", "/players"],
      ["/stats/players/3", "/players/3"],
    ];
    for (const [from, to] of moved) expect(movedStatsPath(from), from).toBe(to);
  });

  it("leaves every other address alone", () => {
    for (const path of ["/", "/stats", "/stats/", "/stats/roles", "/stats/gamesx", "/stats/playersx", "/games", "/players/3", "/game", "/x/stats/games"]) {
      expect(movedStatsPath(path), path).toBeNull();
    }
  });
});

describe("followMovedStatsPath", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
  });

  it("moves an old address to its new one in place, with its query and hash", () => {
    history.replaceState(null, "", "/stats/games?players=1,3&page=2#top");
    const entries = history.length;
    followMovedStatsPath();
    expect(location.pathname).toBe("/games");
    expect(location.search).toBe("?players=1,3&page=2");
    expect(location.hash).toBe("#top");
    expect(history.length, "replaced, not pushed").toBe(entries);
  });

  it("leaves a current address as it is", () => {
    history.replaceState(null, "", "/players/3?cpu=1");
    followMovedStatsPath();
    expect(location.pathname + location.search).toBe("/players/3?cpu=1");
  });
});
