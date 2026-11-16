import { describe, expect, it } from "vitest";
import { NO_VALUE, rateText } from "./cellText";

describe("rateText", () => {
  it("is a whole percent, or a dash below the minimum", () => {
    expect(rateText(0.625)).toBe("63%");
    expect(rateText(0)).toBe("0%");
    expect(rateText(null)).toBe("—");
    expect(NO_VALUE).toBe("—");
  });
});
