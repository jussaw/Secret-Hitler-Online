import { describe, expect, it } from "vitest";
import fixture from "./fixtures/recorded-games.json";
import { EVENT_FIELDS, parseStatsData, playerName, sideOf, type GameRecord, type StatsData } from "./record";
import { makeData, makeRecord, makeSeats } from "./testRecords";

/** A fresh copy of the contract fixture, safe to change. */
function fixtureCopy(): StatsData {
  return JSON.parse(JSON.stringify(fixture));
}

describe("parseStatsData", () => {
  it("parses the contract fixture", () => {
    const data = parseStatsData(fixtureCopy());
    expect(data.games.length).toBeGreaterThan(0);

    for (let i = 1; i < data.games.length; i++) {
      const [a, b] = [data.games[i - 1], data.games[i]];
      expect(a.endedAt < b.endedAt || (a.endedAt === b.endedAt && a.id < b.id), `${a.id} before ${b.id}`).toBe(
        true
      );
    }

    const numbers = new Set(data.players.map((p) => p.number));
    let chaos = 0;
    for (const game of data.games) {
      for (const seat of game.seats) {
        if (seat.player !== null) expect(numbers.has(seat.player), `${game.id}: player ${seat.player}`).toBe(true);
      }
      for (const event of game.events) {
        const keys = Object.keys(event).filter((k) => k !== "type" && k !== "t" && k !== "r");
        let expected = [...EVENT_FIELDS[event.type]];
        if (event.type === "enact" && event.by === "chaos") {
          expected = expected.filter((k) => k !== "seat");
          chaos++;
        }
        expect(keys, `${game.id}: ${event.type}`).toEqual(expected);
      }
      const last = game.events[game.events.length - 1];
      expect(last, `${game.id}'s last event`).toMatchObject({ type: "end", outcome: game.outcome });
    }
    expect(chaos, "a chaos policy in the fixture").toBeGreaterThan(0);
  });

  it("refuses another format", () => {
    const data = fixtureCopy();
    (data.games[3] as unknown as { format: number }).format = 2;
    expect(() => parseStatsData(data)).toThrow(/Unsupported game record format: 2/);
  });

  it("refuses a malformed response", () => {
    const bad = (change: (record: GameRecord) => void) => {
      const record = makeRecord();
      change(record);
      return makeData([record]);
    };
    const cases: unknown[] = [
      null,
      {},
      { players: [], games: {} },
      bad((r) => ((r.seats[2] as unknown as { role: string }).role = "KING")),
      bad((r) => ((r as unknown as { outcome: string }).outcome = "DRAW")),
      bad((r) => (r.events = [{ type: "nap", t: 0, r: 1 } as unknown as GameRecord["events"][number]])),
      bad((r) => delete (r as unknown as { events?: unknown }).events),
    ];
    for (const json of cases) {
      expect(() => parseStatsData(json), JSON.stringify(json)).toThrow(Error);
    }
  });

  it("the builders make valid data", () => {
    const second = makeRecord({
      id: "game-2",
      seats: makeSeats(["LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "HITLER"], [1, 2, null, 4, null]),
      hasCpu: true,
    });
    const data = makeData([makeRecord(), second]);
    expect(() => parseStatsData(data)).not.toThrow();
    expect(second.seats.map((s) => s.name)).toEqual(["P1", "P2", "Bot 1", "P4", "Bot 2"]);
    expect(second.seats.map((s) => s.cpu)).toEqual([false, false, true, false, true]);
    expect(data.players).toEqual([1, 2, 3, 4, 5].map((n) => ({ number: n, name: `P${n}` })));
  });
});

describe("sideOf", () => {
  it("puts Hitler with the Fascists", () => {
    expect(sideOf("HITLER")).toBe("FASCIST");
    expect(sideOf("FASCIST")).toBe("FASCIST");
    expect(sideOf("LIBERAL")).toBe("LIBERAL");
  });
});

describe("playerName", () => {
  it("names a player, or numbers one it does not know", () => {
    const data = makeData([makeRecord()]);
    expect(playerName(data, 3)).toBe("P3");
    expect(playerName(data, 9)).toBe("Player 9");
  });
});
