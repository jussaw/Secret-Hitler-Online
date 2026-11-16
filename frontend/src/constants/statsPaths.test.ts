import { describe, expect, it } from "vitest";
import { routePath } from "../stats/routes";
import { STATS_GAME_LIST_PATH, STATS_PATH, STATS_PLAYER_LIST_PATH, statsGamePath } from ".";

// The game's pages link into the stats with these, and never import the stats' chunk for them.
describe("the stats paths", () => {
  it("are the stats' own routes", () => {
    expect(STATS_PATH).toBe(routePath({ page: "tab", tab: "overview" }));
    expect(STATS_GAME_LIST_PATH).toBe(routePath({ page: "games" }));
    expect(STATS_PLAYER_LIST_PATH).toBe(routePath({ page: "players" }));
    expect(statsGamePath("a b")).toBe(routePath({ page: "game", id: "a b" }));
    expect(statsGamePath("0f5e2c1a-7b3d")).toBe("/stats/games/0f5e2c1a-7b3d");
  });
});
