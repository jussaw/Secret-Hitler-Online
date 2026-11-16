import { describe, expect, it } from "vitest";
import { labelStep } from "./labelStep";

describe("labelStep", () => {
  it("labelsEveryBarWhenTheyFit", () => {
    expect(labelStep(7, 3, 468)).toBe(1);
    expect(labelStep(0, 0, 300)).toBe(1);
  });

  it("skipsBarsSoTheLabelsFit", () => {
    // 24 labels of 2 characters, 22px each with the gap, in 268px: every second one.
    expect(labelStep(24, 2, 268)).toBe(2);
    expect(labelStep(52, 6, 1028)).toBe(3);
  });

  it("aBoxWithNoRoomLabelsEveryBar", () => {
    expect(labelStep(10, 4, 0)).toBe(1);
  });
});
