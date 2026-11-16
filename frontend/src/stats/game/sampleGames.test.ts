import { describe, expect, it } from "vitest";
import { parseStatsData } from "../record";
import { rounds } from "../rounds";
import { ev, SHOWCASE_PLAYERS, showcaseGame } from "./sampleGames";

describe("showcaseGame", () => {
  const game = showcaseGame();
  const rs = rounds(game);

  it("is a valid record of seven named players", () => {
    expect(() => parseStatsData({ players: SHOWCASE_PLAYERS, games: [game] })).not.toThrow();
    expect(game.seats.map((s) => s.name)).toEqual(["Maya", "Rowan", "Theo", "Priya", "Sam", "Ash", "Blair"]);
    expect(game.seats.map((s) => s.player)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(SHOWCASE_PLAYERS.map((p) => p.name)).toEqual(game.seats.map((s) => s.name));
    expect(game.seats.filter((s) => s.role === "HITLER").map((s) => s.name)).toEqual(["Sam"]);
    expect(game.seats.filter((s) => s.role === "FASCIST").map((s) => s.name)).toContain("Theo");
    expect(game).toMatchObject({ complete: true, hasCpu: false, outcome: "LIBERAL_POLICIES", winner: "LIBERAL" });
  });

  it("adds up to its board, round by round", () => {
    expect(rs.map((x) => x.r)).toEqual(Array.from({ length: game.rounds }, (_, i) => i + 1));
    let liberal = 0;
    let fascist = 0;
    for (const e of game.events) {
      if (e.type !== "enact") continue;
      if (e.policy === "L") liberal++;
      else fascist++;
      expect([e.liberal, e.fascist], `the board at ${e.t}`).toEqual([liberal, fascist]);
    }
    expect([liberal, fascist]).toEqual([game.liberalPolicies, game.fascistPolicies]);
    expect(game.liberalPolicies).toBe(5);
    const last = game.events[game.events.length - 1];
    expect(last).toMatchObject({ type: "end", outcome: "LIBERAL_POLICIES" });
    expect(game.endedAt - game.startedAt).toBe(last.t);
    for (let i = 1; i < game.events.length; i++) expect(game.events[i].t).toBeGreaterThanOrEqual(game.events[i - 1].t);
    const dead = rs.flatMap((x) => (x.power?.kind === "execute" ? [x.power.target] : []));
    expect(game.seats.flatMap((s, i) => (s.alive ? [] : [i]))).toEqual(dead);
  });

  it("holds every kind of round the page draws", () => {
    const humans = (x: (typeof rs)[number]) => Object.values(x.ms).filter((ms) => ms !== null).length;
    expect(rs.some((x) => humans(x) >= 5 && x.votes.every((v) => v.ms !== null)), "a round with every decision timed").toBe(true);
    expect(rs.some((x) => x.election?.passed === false), "a failed election").toBe(true);
    expect(rs.some((x) => x.enacted?.by === "chaos" && x.reshuffled), "chaos with a reshuffle").toBe(true);
    expect(rs.some((x) => x.blame !== null && x.blame === x.president), "blame on a president").toBe(true);
    expect(rs.some((x) => x.blame !== null && x.blame === x.chancellor), "blame on a chancellor").toBe(true);
    expect(rs.some((x) => x.power?.kind === "investigate"), "an investigation").toBe(true);
    expect(
      rs.some((x) => x.veto?.accepted === false && x.enacted?.by === "chancellor" && x.ms.chancellorAfterVeto !== null),
      "a refused veto and the enact after it"
    ).toBe(true);
    expect(rs.some((x) => x.endTerm?.by === "countdown" && x.pauses > 0), "a countdown end with a pause").toBe(true);
    expect(rs.some((x) => x.disconnects.length > 0), "a dropped connection").toBe(true);
  });

  it("follows the rotation", () => {
    for (let k = 2; k <= rs.length; k++) {
      const before = game.events.filter((e) => e.r < k);
      const cut = rounds({ ...game, outcome: "UNFINISHED", winner: null, events: [...before, ev.end(k, 0, "UNFINISHED")] });
      expect(cut[cut.length - 1].president, `round ${k}`).toBe(rs[k - 1].president);
    }
  });
});
