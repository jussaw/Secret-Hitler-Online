import { describe, expect, it } from "vitest";
import { addChance, countRate, newCount, seatTallies, sideAt } from "./tallies";
import { FIVE, gameOf } from "./votesTestRounds";

describe("tallies", () => {
  it("counts hits of chances into a rate with its minimum", () => {
    const c = newCount();
    [true, false, true, true, false].forEach((hit) => addChance(c, hit));
    expect(c).toEqual({ hits: 3, chances: 5 });
    expect(countRate(c)).toEqual({ hits: 3, chances: 5, value: 0.6 });
    expect(countRate(c, 6)).toEqual({ hits: 3, chances: 5, value: null });
    expect(countRate(newCount())).toEqual({ hits: 0, chances: 0, value: null });
  });

  it("gives each person's seat their tally, made once and counting their games", () => {
    const tallies = new Map<number, { games: number }>();
    const make = () => ({ games: 0 });
    const first = seatTallies(gameOf(FIVE, [], { players: [1, null, 3, 4, 5] }), tallies, make);
    const second = seatTallies(gameOf(FIVE, [], { players: [3, 1, 6, null, 7] }), tallies, make);
    expect([...first.keys()]).toEqual([0, 2, 3, 4]);
    expect(first.get(2)).toEqual({ player: 3, tally: tallies.get(3) });
    expect(second.get(0)!.tally).toBe(first.get(2)!.tally);
    expect([...tallies].map(([player, t]) => [player, t.games])).toEqual([[1, 2], [3, 2], [4, 1], [5, 1], [6, 1], [7, 1]]);
  });

  it("says a seat's side, Hitler a Fascist, and null for a seat the record lacks", () => {
    const g = gameOf(FIVE, []);
    expect([0, 3, 4, 5].map((seat) => sideAt(g, seat))).toEqual(["LIBERAL", "FASCIST", "FASCIST", null]);
  });
});
