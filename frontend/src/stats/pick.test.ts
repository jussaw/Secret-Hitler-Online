import { describe, expect, it } from "vitest";
import { firstBy } from "./pick";

describe("firstBy", () => {
  it("finds the first by the comparison, the earliest of equals", () => {
    const items = [{ n: 3, id: "a" }, { n: 1, id: "b" }, { n: 1, id: "c" }, { n: 2, id: "d" }];
    expect(firstBy(items, (x, y) => x.n - y.n)).toBe(items[1]);
    expect(firstBy(items, (x, y) => y.n - x.n)).toBe(items[0]);
  });

  it("is null for nothing", () => {
    expect(firstBy([], () => 0)).toBeNull();
  });
});
