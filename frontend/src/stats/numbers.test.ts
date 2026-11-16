import { describe, expect, it } from "vitest";
import * as numbers from "./numbers";
import { formatDays, formatPercent, formatRating, formatSigned } from "./numbers";

describe("formatPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatPercent(0.625)).toBe("63%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1 / 3)).toBe("33%");
  });
});

describe("formatSigned", () => {
  it("rounds and signs, with a true minus", () => {
    expect(formatSigned(19.42)).toBe("+19");
    expect(formatSigned(-12.58)).toBe("−13");
    expect(formatSigned(16)).toBe("+16");
    expect(formatSigned(-15.6)).toBe("−16");
  });
  it("never says ±0", () => {
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(0.4)).toBe("0");
    expect(formatSigned(-0.4)).toBe("0");
    expect(formatSigned(-0)).toBe("0");
  });
});

describe("formatRating", () => {
  it("is the rating rounded", () => {
    expect(formatRating(1497.1)).toBe("1497");
    expect(formatRating(1519.5)).toBe("1520");
    expect(formatRating(1500)).toBe("1500");
  });
});

describe("formatDays", () => {
  it("says today, a day or days", () => {
    expect(formatDays(0)).toBe("Today");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(3)).toBe("3 days");
  });
});

describe("the module", () => {
  it("leaves plural to format.ts and has no formatChange", () => {
    expect(Object.keys(numbers).sort()).toEqual(["formatDays", "formatPercent", "formatRating", "formatSigned"]);
  });
});
