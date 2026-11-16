import { describe, expect, it } from "vitest";
import { rate } from "../counting";
import { formatLastPlayed, formatPoints, formatRate, formatShortDate } from "./playerText";
import { SAMPLE_NOW, TZ } from "./testStats";

describe("formatRate", () => {
  it("aRateAsAPercent", () => {
    expect(formatRate(rate(5, 6))).toBe("83%");
  });

  it("belowItsMinimumADashAndTheChances", () => {
    expect(formatRate(rate(1, 1))).toBe("— (1)");
    expect(formatRate(rate(0, 0))).toBe("— (0)");
  });
});

describe("formatPoints", () => {
  it("aShareAsSignedPoints", () => {
    expect(formatPoints(0.0667)).toBe("+7%");
    expect(formatPoints(-0.03)).toBe("−3%");
    expect(formatPoints(0.001)).toBe("0%");
  });
});

describe("formatShortDate", () => {
  it("theDayAndMonthThisYear", () => {
    expect(formatShortDate(Date.UTC(2026, 9, 2, 20), SAMPLE_NOW, TZ)).toBe("2 Oct");
  });

  it("theYearTooWhenItIsAnother", () => {
    expect(formatShortDate(Date.UTC(2025, 9, 2, 20), SAMPLE_NOW, TZ)).toBe("2 Oct 2025");
  });

  it("theMonthAsTheOtherStatsPagesSpellIt", () => {
    expect(formatShortDate(Date.UTC(2026, 8, 7, 20), SAMPLE_NOW, TZ)).toBe("7 Sep");
  });

  it("theDayInTheZoneGiven", () => {
    // 31 Dec 2025, 23:30 UTC is already 1 Jan 2026 in Paris.
    expect(formatShortDate(Date.UTC(2025, 11, 31, 23, 30), SAMPLE_NOW, "Europe/Paris")).toBe("1 Jan");
    expect(formatShortDate(Date.UTC(2025, 11, 31, 23, 30), SAMPLE_NOW, TZ)).toBe("31 Dec 2025");
  });
});

describe("formatLastPlayed", () => {
  it("todayYesterdayAndDaysAgo", () => {
    expect(formatLastPlayed(Date.UTC(2026, 10, 15, 8), SAMPLE_NOW, TZ)).toBe("today");
    expect(formatLastPlayed(Date.UTC(2026, 10, 14, 23, 59), SAMPLE_NOW, TZ)).toBe("yesterday");
    expect(formatLastPlayed(Date.UTC(2026, 10, 13, 20, 40), SAMPLE_NOW, TZ)).toBe("2 days ago");
  });

  it("inTheZoneGiven", () => {
    expect(formatLastPlayed(Date.UTC(2026, 10, 14, 23, 30), SAMPLE_NOW, "Europe/Paris")).toBe("today");
  });
});
