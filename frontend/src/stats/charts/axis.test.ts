import { describe, expect, it } from "vitest";
import { niceTicks } from "./axis";

describe("niceTicks", () => {
  it("steps by 1, 2 or 5 times a power of ten, covering the range", () => {
    expect(niceTicks(1488, 1612)).toEqual([1450, 1500, 1550, 1600, 1650]);
    expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it("widens a single value by five each way", () => {
    expect(niceTicks(1500, 1500)).toEqual([1494, 1496, 1498, 1500, 1502, 1504, 1506]);
  });
  it("rounds fractional steps to their decimals", () => {
    expect(niceTicks(0, 0.3)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(niceTicks(0.1, 0.7)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
  });
  it("takes a count", () => {
    expect(niceTicks(0, 10, 2)).toEqual([0, 5, 10]);
  });
  it("handles negative numbers", () => {
    expect(niceTicks(-30, 25)).toEqual([-40, -20, 0, 20, 40]);
  });
});
