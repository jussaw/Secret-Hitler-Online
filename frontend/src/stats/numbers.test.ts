import { describe, expect, it } from "vitest";
import { rate } from "./counting";
import * as numbers from "./numbers";
import {
  countFigure,
  formatDays,
  formatPercent,
  formatRating,
  formatSigned,
  percentFigure,
  rateFigure,
  wholePercent,
  wholeRating,
  wholeSigned,
} from "./numbers";

describe("formatPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatPercent(0.625)).toBe("63%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1 / 3)).toBe("33%");
  });
});

describe("wholePercent", () => {
  it("is the whole percent formatPercent shows", () => {
    expect(wholePercent(0.625)).toBe(63);
    expect(wholePercent(0.5249)).toBe(52);
    expect(formatPercent(0.625)).toBe("63%");
  });
});

describe("percentFigure", () => {
  it("is the whole percent a share shows, and null for none", () => {
    expect(percentFigure(0.625)).toBe(63);
    expect(percentFigure(0)).toBe(0);
    expect(percentFigure(null)).toBeNull();
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

describe("wholeSigned", () => {
  it("is the whole number formatSigned shows", () => {
    expect(wholeSigned(19.42)).toBe(19);
    expect(wholeSigned(-12.58)).toBe(-13);
    expect(wholeSigned(16)).toBe(16);
    expect(wholeSigned(-15.6)).toBe(-16);
    expect(wholeSigned(2.5)).toBe(3);
    expect(wholeSigned(-2.5)).toBe(-2); // Math.round's half towards +∞, as formatSigned shows "−2"
    for (const change of [19.42, -12.58, 16, -15.6, 2.5, -2.5, 0.4, -0.4, 0, -0]) {
      const whole = wholeSigned(change);
      expect(formatSigned(change)).toBe(whole === 0 ? "0" : whole > 0 ? `+${whole}` : `−${-whole}`);
    }
  });

  it("is 0 for anything that rounds to zero, never −0", () => {
    for (const change of [0, -0, 0.4, -0.4, -0.5]) expect(Object.is(wholeSigned(change), 0), String(change)).toBe(true);
  });
});

describe("formatRating", () => {
  it("is the rating rounded", () => {
    expect(formatRating(1497.1)).toBe("1497");
    expect(formatRating(1519.5)).toBe("1520");
    expect(formatRating(1500)).toBe("1500");
  });
});

describe("wholeRating", () => {
  it("is the whole number formatRating shows", () => {
    expect(wholeRating(1497.1)).toBe(1497);
    expect(wholeRating(1519.5)).toBe(1520);
    expect(wholeRating(1500)).toBe(1500);
    expect(wholeRating(1480.49)).toBe(1480);
    for (const rating of [1497.1, 1519.5, 1500, 1480.49, 1612.7]) {
      expect(formatRating(rating)).toBe(String(wholeRating(rating)));
    }
  });
});

describe("sort figures", () => {
  it("aCountsFigureIsItself", () => {
    expect(countFigure(7)).toBe(7);
    expect(countFigure(0)).toBe(0);
    expect(countFigure(-2)).toBe(-2); // a current streak of two losses
  });

  it("aRatesFigureIsTheWholePercentItShows", () => {
    const shown = rate(5, 8); // 0.625, shown "63%"
    expect(formatPercent(shown.value!)).toBe("63%");
    expect(rateFigure(shown)).toBe(63);
    expect(rateFigure(rate(0, 5))).toBe(0);
  });

  it("aRateWithNoValueHasNoFigure", () => {
    expect(rate(1, 2).value).toBeNull(); // below MIN_CHANCES, shown "—"
    expect(rateFigure(rate(1, 2))).toBeNull();
    expect(rateFigure({ hits: 0, chances: 0, value: null })).toBeNull();
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
    expect(Object.keys(numbers).sort()).toEqual([
      "countFigure",
      "formatDays",
      "formatPercent",
      "formatRating",
      "formatSigned",
      "percentFigure",
      "rateFigure",
      "wholePercent",
      "wholeRating",
      "wholeSigned",
    ]);
  });
});
