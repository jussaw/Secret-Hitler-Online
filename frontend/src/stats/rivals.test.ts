import { describe, expect, it } from "vitest";
import { countedGames, DEFAULT_FILTER, humanSeats } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { parseStatsData, type Role } from "./record";
import { against, computeRivals, pairKey, pairOf } from "./rivals";
import { beats, NAMES, nominated, played, repeat, together } from "./testRivals";

describe("pairs", () => {
  it("counts each pair's games on the same side and on opposite sides", () => {
    const r = computeRivals(
      [
        played([[1, "LIBERAL"], [2, "LIBERAL"], [3, "LIBERAL"], [4, "FASCIST"], [5, "HITLER"]], "LIBERAL"),
        played([[1, "FASCIST"], [2, "HITLER"], [3, "LIBERAL"], [4, "LIBERAL"], [5, "LIBERAL"]], "FASCIST"),
      ],
      NAMES
    );
    expect(r.players).toEqual([1, 2, 3, 4, 5]);
    expect(r.pairs.size).toBe(10);
    expect(pairOf(r, 2, 1)).toEqual({
      a: 1, b: 2, shared: 2, together: 2, togetherWins: 2,
      fascistTogether: 1, fascistTogetherWins: 1, opposed: 0, aWins: 0,
    });
    expect(pairOf(r, 1, 3)).toEqual({
      a: 1, b: 3, shared: 2, together: 1, togetherWins: 1,
      fascistTogether: 0, fascistTogetherWins: 0, opposed: 1, aWins: 1,
    });
    expect(pairOf(r, 4, 5)).toEqual({
      a: 4, b: 5, shared: 2, together: 2, togetherWins: 0,
      fascistTogether: 1, fascistTogetherWins: 0, opposed: 0, aWins: 0,
    });
    expect(against(r, 3, 1)).toEqual({ wins: 0, losses: 1 });
    expect(against(r, 3, 4)).toEqual({ wins: 1, losses: 0 });
    expect(against(r, 1, 2)).toEqual({ wins: 0, losses: 0 });
  });

  it("keys a pair by its two numbers, the smaller first", () => {
    expect(pairKey(7, 3)).toBe("3-7");
    expect(pairKey(3, 7)).toBe("3-7");
  });

  it("never pairs a CPU seat", () => {
    const r = computeRivals([together(1, 2, "LIBERAL", true)], NAMES);
    expect([...r.pairs.keys()]).toEqual(["1-2"]);
    expect(r.players).toEqual([1, 2]);
  });

  it("gives the same pairs for the games in any order", () => {
    const games = [beats(1, 2), together(1, 3, "FASCIST", true), beats(3, 2), together(2, 4, "LIBERAL", false)];
    const forwards = computeRivals(games, NAMES);
    const backwards = computeRivals([...games].reverse(), NAMES);
    expect(backwards.players).toEqual(forwards.players);
    expect(new Map(backwards.pairs)).toEqual(new Map(forwards.pairs));
  });

  it("has nothing without counted games", () => {
    const r = computeRivals([], NAMES);
    expect(r.players).toEqual([]);
    expect(r.pairs.size).toBe(0);
    expect(r.bestDuo).toBeNull();
    expect(r.bestFascistDuo).toBeNull();
    expect(r.closest).toBeNull();
    expect(r.mostLopsided).toBeNull();
  });
});

describe("duos", () => {
  it("the best duo needs 5 games together, then more games, then names", () => {
    const r = computeRivals(
      [
        ...repeat(4, () => together(1, 2, "LIBERAL", true)), together(1, 2, "LIBERAL", false), // 4 of 5
        ...repeat(8, () => together(3, 4, "LIBERAL", true)),
        ...repeat(2, () => together(3, 4, "FASCIST", false)), // 8 of 10
        ...repeat(4, () => together(5, 6, "LIBERAL", true)), // too few
      ],
      NAMES
    );
    expect(r.bestDuo).toMatchObject({ a: 3, b: 4, together: 10, togetherWins: 8 });
    const even = computeRivals(
      [
        ...repeat(4, () => together(3, 4, "LIBERAL", true)), together(3, 4, "LIBERAL", false),
        ...repeat(4, () => together(1, 2, "LIBERAL", true)), together(1, 2, "LIBERAL", false),
      ],
      NAMES
    );
    expect(even.bestDuo).toMatchObject({ a: 1, b: 2 });
  });

  it("the best Fascist duo counts only games on the Fascist side", () => {
    const r = computeRivals(
      [
        ...repeat(3, () => together(1, 2, "FASCIST", true)), ...repeat(2, () => together(1, 2, "FASCIST", false)),
        ...repeat(6, () => together(3, 4, "LIBERAL", true)),
        ...repeat(4, () => together(5, 6, "FASCIST", true)),
      ],
      NAMES
    );
    expect(r.bestDuo).toMatchObject({ a: 3, b: 4 });
    expect(r.bestFascistDuo).toMatchObject({ a: 1, b: 2, fascistTogether: 5, fascistTogetherWins: 3 });
  });
});

describe("rivalries", () => {
  it("rivalries need 5 games on opposite sides: closest smallest, most lopsided largest", () => {
    const r = computeRivals(
      [
        ...repeat(3, () => beats(1, 2)), ...repeat(3, () => beats(2, 1)), // Ann 3–3 Bo
        ...repeat(3, () => beats(3, 4)), ...repeat(7, () => beats(4, 3)), // Cy 3–7 Di
        ...repeat(5, () => beats(7, 8)), // Gus 5–0 Hal
        ...repeat(4, () => beats(9, 10)), // too few
      ],
      NAMES
    );
    expect(r.closest).toEqual({ pair: expect.objectContaining({ a: 1, b: 2, opposed: 6, aWins: 3 }), closeness: 0 });
    expect(r.mostLopsided).toEqual({ pair: expect.objectContaining({ a: 7, b: 8, opposed: 5, aWins: 5 }), closeness: 0.5 });
  });

  it("mirror-image rivalries are exactly as close", () => {
    const r = computeRivals(
      [
        ...repeat(7, () => beats(5, 6)), ...repeat(3, () => beats(6, 5)), // Ed 7–3 Fay
        ...repeat(3, () => beats(3, 4)), ...repeat(7, () => beats(4, 3)), // Cy 3–7 Di
      ],
      NAMES
    );
    expect(r.closest!.pair).toMatchObject({ a: 3, b: 4 }); // tied at 0.2 and on games: names
    expect(r.mostLopsided!.pair).toMatchObject({ a: 3, b: 4 });
    expect(r.closest!.closeness).toBe(0.2);
  });

  it("an equal closeness goes to the pair with more games", () => {
    const r = computeRivals(
      [
        ...repeat(3, () => beats(1, 2)), ...repeat(2, () => beats(2, 1)), // Ann 3–2 Bo: 0.1 over 5
        ...repeat(6, () => beats(3, 4)), ...repeat(4, () => beats(4, 3)), // Cy 6–4 Di: 0.1 over 10
      ],
      NAMES
    );
    expect(r.closest!.pair).toMatchObject({ a: 3, b: 4 });
    expect(r.mostLopsided!.pair).toMatchObject({ a: 3, b: 4 });
  });
});

describe("each player's people", () => {
  it("most played with counts games on either side, ties by name", () => {
    const r = computeRivals(
      [
        ...repeat(3, () => together(1, 2, "LIBERAL", true)),
        ...repeat(2, () => together(1, 3, "LIBERAL", true)), beats(3, 1),
        ...repeat(2, () => together(1, 4, "FASCIST", false)),
      ],
      NAMES
    );
    expect(r.byPlayer.get(1)!.mostPlayedWith).toEqual({ player: 2, games: 3 }); // Bo before Cy
    expect(r.byPlayer.get(4)!.mostPlayedWith).toEqual({ player: 1, games: 2 });
  });

  it("the best teammate needs 5 games together", () => {
    const r = computeRivals(
      [
        ...repeat(3, () => together(1, 2, "LIBERAL", true)), ...repeat(2, () => together(1, 2, "LIBERAL", false)),
        ...repeat(4, () => together(1, 3, "FASCIST", true)), together(1, 3, "LIBERAL", false),
        ...repeat(4, () => together(1, 4, "LIBERAL", true)),
      ],
      NAMES
    );
    expect(r.byPlayer.get(1)!.bestTeammate).toEqual({ player: 3, wins: 4, games: 5 });
    expect(r.byPlayer.get(4)!.bestTeammate).toBeNull();
  });

  it("the nemesis has the most wins against the player; ties by more shared games, then name", () => {
    const r = computeRivals(
      [
        ...repeat(2, () => beats(2, 1)), beats(1, 2), // Bo 2–1, 3 shared
        ...repeat(2, () => beats(3, 1)), ...repeat(2, () => together(1, 3, "LIBERAL", true)), // Cy 2–0, 4 shared
        beats(4, 1),
      ],
      NAMES
    );
    expect(r.byPlayer.get(1)!.nemesis).toEqual({ player: 3, losses: 2, games: 4 });
    expect(r.byPlayer.get(4)!.nemesis).toBeNull();
    expect(r.byPlayer.get(2)!.favouriteOpponent).toEqual({ player: 1, wins: 2, games: 3 });
    expect(r.byPlayer.get(1)!.favouriteOpponent).toEqual({ player: 2, wins: 1, games: 3 });
    expect(r.byPlayer.get(1)!.opponents).toEqual(
      new Map([
        [2, { games: 3, wins: 1, losses: 2 }],
        [3, { games: 2, wins: 0, losses: 2 }],
        [4, { games: 1, wins: 0, losses: 1 }],
      ])
    );
    expect(computeRivals([beats(3, 1), beats(2, 1)], NAMES).byPlayer.get(1)!.nemesis).toEqual({
      player: 2,
      losses: 1,
      games: 1,
    });
  });

  it("the favourite opponent breaks ties by more shared games", () => {
    const r = computeRivals(
      [beats(1, 2), beats(1, 2), beats(1, 3), beats(1, 3), together(1, 3, "LIBERAL", false), beats(1, 4)],
      NAMES
    );
    expect(r.byPlayer.get(1)!.favouriteOpponent).toEqual({ player: 3, wins: 2, games: 3 });
  });

  it("a lone player has an entry with no one in it", () => {
    const r = computeRivals(
      [played([[1, "LIBERAL"], [null, "LIBERAL"], [null, "LIBERAL"], [null, "FASCIST"], [null, "HITLER"]], "LIBERAL")],
      NAMES
    );
    expect(r.players).toEqual([1]);
    expect(r.pairs.size).toBe(0);
    expect(r.nominations.size).toBe(0);
    expect(r.byPlayer.get(1)).toEqual({
      opponents: new Map(),
      mostPlayedWith: null,
      bestTeammate: null,
      nemesis: null,
      favouriteOpponent: null,
    });
  });
});

describe("who trusts whom", () => {
  it("counts who nominated whom, human to human", () => {
    const seats: [number | null, Role][] = [[1, "LIBERAL"], [2, "LIBERAL"], [3, "FASCIST"], [null, "LIBERAL"], [null, "HITLER"]];
    const r = computeRivals(
      [
        played(seats, "LIBERAL", [
          ...nominated(1, 0, 1, true), ...nominated(2, 1, 0, false), ...nominated(3, 2, 0, true),
          ...nominated(4, 3, 0, true), ...nominated(5, 4, 1, false), ...nominated(6, 0, 1, false),
        ]),
      ],
      NAMES
    );
    expect(r.nominations).toEqual(
      new Map([
        [1, new Map([[2, 2]])],
        [2, new Map([[1, 1]])],
        [3, new Map([[1, 1]])],
      ])
    );
  });
});

describe("the contract fixture", () => {
  it("adds up on the contract fixture", () => {
    const data = parseStatsData(fixture);
    const counted = countedGames(data.games, DEFAULT_FILTER);
    const names = new Map(data.players.map((p) => [p.number, p.name]));
    const r = computeRivals(counted, names);
    let shared = 0;
    r.pairs.forEach((pair) => {
      expect(pair.together + pair.opposed).toBe(pair.shared);
      expect(pair.aWins).toBeLessThanOrEqual(pair.opposed);
      expect(pair.fascistTogether).toBeLessThanOrEqual(pair.together);
      expect(pair.togetherWins).toBeLessThanOrEqual(pair.together);
      expect(pair.a).toBeLessThan(pair.b);
      shared += pair.shared;
    });
    const expected = counted.reduce((sum, g) => {
      const h = humanSeats(g).length;
      return sum + (h * (h - 1)) / 2;
    }, 0);
    expect(expected).toBeGreaterThan(0);
    expect(shared).toBe(expected);

    expect(r.byPlayer.size).toBe(r.players.length);
    let nominations = 0;
    r.nominations.forEach((chancellors) => chancellors.forEach((n) => (nominations += n)));
    const human = (g: (typeof counted)[number], seat: number) => g.seats[seat].player !== null && !g.seats[seat].cpu;
    const events = counted.reduce(
      (sum, g) => sum + g.events.filter((e) => e.type === "nominate" && human(g, e.president) && human(g, e.chancellor)).length,
      0
    );
    expect(events).toBeGreaterThan(0);
    expect(nominations).toBe(events);
  });
});
