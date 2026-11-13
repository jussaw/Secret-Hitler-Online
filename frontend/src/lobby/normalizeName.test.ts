import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalizeName";

describe("normalizeName", () => {
  it("leaves a plain name alone", () => {
    expect(normalizeName("Sam")).toBe("Sam");
  });

  it("trims both ends", () => {
    expect(normalizeName("  Sam ")).toBe("Sam");
  });

  it("collapses runs of whitespace to one space", () => {
    expect(normalizeName("Sam  \t Lee")).toBe("Sam Lee");
  });

  it("turns an all-space name into the empty name", () => {
    expect(normalizeName(" \t ")).toBe("");
  });
});
