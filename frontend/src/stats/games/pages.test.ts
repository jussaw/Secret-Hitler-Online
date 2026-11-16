import { describe, expect, it } from "vitest";
import { gamesSummary, pageCount, pageLinks } from "./pages";

describe("pages", () => {
  it("counts the pages, at least one", () => {
    expect([pageCount(0, 20), pageCount(20, 20), pageCount(45, 20), pageCount(45, 50)]).toEqual([1, 1, 3, 1]);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(400, 100)).toBe(4);
  });

  it("links the first and last pages and the current one's neighbours", () => {
    expect(pageLinks(1, 1)).toEqual([1]);
    expect(pageLinks(1, 2)).toEqual([1, 2]);
    expect(pageLinks(2, 3)).toEqual([1, 2, 3]);
    expect(pageLinks(1, 8)).toEqual([1, 2, null, 8]);
    expect(pageLinks(3, 8)).toEqual([1, 2, 3, 4, null, 8]);
    expect(pageLinks(5, 8)).toEqual([1, null, 4, 5, 6, 7, 8]);
    expect(pageLinks(8, 8)).toEqual([1, null, 7, 8]);
    expect(pageLinks(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });

  it("sums up what is shown", () => {
    expect(gamesSummary(0, 0, 0, 0, false)).toBe("No games recorded yet.");
    expect(gamesSummary(1, 1, 1, 1, false)).toBe("1 game recorded · showing 1–1");
    expect(gamesSummary(142, 142, 1, 20, false)).toBe("142 games recorded · showing 1–20");
    expect(gamesSummary(142, 37, 21, 37, true)).toBe("142 games recorded · 37 match · showing 21–37");
    expect(gamesSummary(142, 0, 0, 0, true)).toBe("142 games recorded · none match");
    expect(gamesSummary(142, 1, 1, 1, true)).toBe("142 games recorded · 1 matches · showing 1–1");
  });
});
