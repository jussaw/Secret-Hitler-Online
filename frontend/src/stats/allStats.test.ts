import { describe, expect, it } from "vitest";
import { allStats } from "./allStats";
import { computeCards } from "./cards";
import { DEFAULT_FILTER } from "./counting";
import { SAMPLE_NOW, sampleData } from "./players/testStats";
import { computePowers } from "./powers";
import { computeRecords } from "./records";
import { computeRivals } from "./rivals";
import { computeRoles } from "./roles";
import { computeTiming } from "./timing";
import { buildStats } from "./useStats";
import { computeVotes } from "./votes";

describe("allStats", () => {
  it("runsEachModuleOnTheCountedGames", () => {
    const ctx = buildStats(sampleData(), DEFAULT_FILTER);
    const all = allStats(ctx, SAMPLE_NOW);
    expect(all.roles).toEqual(computeRoles(ctx.counted));
    expect(all.cards).toEqual(computeCards(ctx.counted));
    expect(all.votes).toEqual(computeVotes(ctx.counted));
    expect(all.powers).toEqual(computePowers(ctx.counted));
    expect(all.rivals).toEqual(computeRivals(ctx.counted, ctx.names));
    expect(all.records).toEqual(computeRecords(ctx.counted, ctx.elo, SAMPLE_NOW));
    expect(all.timing).toEqual(computeTiming(ctx.counted));
    expect(all.roles.byPlayer.size).toBe(6);
  });
});
