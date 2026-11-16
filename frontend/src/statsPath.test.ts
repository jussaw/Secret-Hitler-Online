import { describe, expect, it } from "vitest";
import { isStatsPath } from "./statsPath";

describe("isStatsPath", () => {
  it("is true for the stats pages only", () => {
    for (const path of ["/stats", "/stats/", "/stats/games/abc"]) expect(isStatsPath(path), path).toBe(true);
    for (const path of ["/", "/stat", "/statsx", "/x/stats"]) expect(isStatsPath(path), path).toBe(false);
  });
});
