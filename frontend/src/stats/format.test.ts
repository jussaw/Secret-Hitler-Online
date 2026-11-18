import { describe, expect, it } from "vitest";
import {
  botsLabel,
  formatDuration,
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
  localDayKey,
  outcomeLabel,
  plural,
  sideWord,
  viewerTimeZone,
} from "./format";
import type { GameRecord } from "./record";
import { makeRecord } from "./testRecords";

/** A time from local parts, as `new Date(...)` takes them. */
const at = (...parts: [number, number, number, number, number]) => new Date(...parts).getTime();
const record = (o: Partial<GameRecord>) => makeRecord(o);

describe("outcomeLabel", () => {
  it("names the result", () => {
    expect(outcomeLabel(record({}))).toBe("Liberals win · 5 Liberal policies");
    expect(outcomeLabel(record({ outcome: "HITLER_EXECUTED" }))).toBe("Liberals win · Hitler executed");
    expect(
      outcomeLabel(record({ outcome: "FASCIST_POLICIES", winner: "FASCIST", liberalPolicies: 3, fascistPolicies: 6 }))
    ).toBe("Fascists win · 6 Fascist policies");
    expect(outcomeLabel(record({ outcome: "HITLER_ELECTED", winner: "FASCIST" }))).toBe(
      "Fascists win · Hitler elected"
    );
    expect(
      outcomeLabel(record({ outcome: "UNFINISHED", winner: null, rounds: 6, liberalPolicies: 4, fascistPolicies: 3 }))
    ).toBe("Unfinished after round 6 · 4 L, 3 F");
  });
});

describe("sideWord", () => {
  it("names the winners as the result does", () => {
    expect([sideWord("LIBERAL"), sideWord("FASCIST")]).toEqual(["Liberals", "Fascists"]);
    expect(outcomeLabel(record({ outcome: "HITLER_ELECTED", winner: "FASCIST" })).startsWith(sideWord("FASCIST"))).toBe(
      true
    );
  });
});

describe("formatDuration", () => {
  it("gives whole minutes, then hours", () => {
    expect([0, 29_999, 30_000, 38 * 60_000, 3_599_999, 65 * 60_000, 125 * 60_000].map(formatDuration)).toEqual([
      "0 min",
      "0 min",
      "1 min",
      "38 min",
      "1 h 00 min",
      "1 h 05 min",
      "2 h 05 min",
    ]);
  });
});

describe("local dates and times", () => {
  it("formats in the zone it is given, in English", () => {
    expect(formatLocalDate(Date.UTC(2026, 10, 14, 21, 42), "UTC")).toBe("Sat 14 Nov 2026");
    expect(formatLocalDate(Date.UTC(2026, 8, 7, 12, 0), "UTC")).toBe("Mon 7 Sep 2026");
    expect(formatLocalTime(Date.UTC(2026, 10, 14, 21, 42), "UTC")).toBe("9:42 PM");
    expect(formatLocalTime(Date.UTC(2026, 10, 15, 0, 5), "UTC")).toBe("12:05 AM");
    expect(formatLocalTime(Date.UTC(2026, 10, 15, 12, 0), "UTC")).toBe("12:00 PM");
    expect(formatLocalDateTime(Date.UTC(2026, 10, 14, 21, 42), "UTC")).toBe("Sat 14 Nov 2026, 9:42 PM");
    expect(formatLocalDateTime(Date.UTC(2026, 10, 15, 2, 42), "America/New_York")).toBe("Sat 14 Nov 2026, 9:42 PM");
  });

  it("uses the viewer's zone by default", () => {
    expect(formatLocalDateTime(at(2026, 10, 14, 21, 42))).toBe("Sat 14 Nov 2026, 9:42 PM");
    expect(localDayKey(at(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(viewerTimeZone()).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("keys a day in the zone it is given", () => {
    expect(localDayKey(Date.UTC(2026, 0, 5, 23, 59), "UTC")).toBe("2026-01-05");
    expect(localDayKey(Date.UTC(2026, 0, 6, 0, 0), "UTC")).toBe("2026-01-06");
    expect(localDayKey(Date.UTC(2026, 0, 6, 3, 30), "America/New_York")).toBe("2026-01-05");
    expect(localDayKey(Date.UTC(2026, 0, 5, 23, 30), "Asia/Tokyo")).toBe("2026-01-06");
  });
});

describe("plural", () => {
  it("counts a noun", () => {
    expect([plural(1, "round"), plural(7, "seat"), plural(0, "game")]).toEqual(["1 round", "7 seats", "0 games"]);
  });
});

describe("botsLabel", () => {
  it("names the bots' level, or only Bots for a record without one", () => {
    expect([botsLabel(null), botsLabel("EASY"), botsLabel("NORMAL"), botsLabel("HARD")]).toEqual([
      "Bots",
      "Easy bots",
      "Normal bots",
      "Hard bots",
    ]);
  });
});
