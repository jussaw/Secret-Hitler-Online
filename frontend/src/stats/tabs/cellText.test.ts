import { describe, expect, it } from "vitest";
import { rate } from "../counting";
import { formatPercent, percentFigure, rateFigure } from "../numbers";
import { NO_VALUE, rateCellText, rateText } from "./cellText";

describe("rateText", () => {
  it("is a whole percent, or a dash below the minimum", () => {
    expect(rateText(0.625)).toBe("63%");
    expect(rateText(0)).toBe("0%");
    expect(rateText(null)).toBe("—");
    expect(NO_VALUE).toBe("—");
  });

  it("isFormatPercentsTextOfTheFigureItSortsBy", () => {
    for (const value of [0.625, 0.5249, 0.005, 0, 1, 1 / 3]) {
      expect(rateText(value), String(value)).toBe(formatPercent(value));
      expect(rateText(value), String(value)).toBe(`${percentFigure(value)}%`);
    }
  });
});

describe("rateCellText", () => {
  it("isItsSharesRateText", () => {
    const shown = rate(5, 8); // 0.625
    expect(rateCellText(shown)).toBe("63%");
    expect(rateCellText(shown)).toBe(`${rateFigure(shown)}%`);
    expect(rateCellText(rate(0, 5))).toBe("0%");
  });

  it("isADashBelowItsMinimum", () => {
    expect(rateCellText(rate(1, 2))).toBe(NO_VALUE); // below MIN_CHANCES
    expect(rateFigure(rate(1, 2))).toBeNull();
    expect(rateCellText({ hits: 0, chances: 0, value: null })).toBe(NO_VALUE);
  });
});
