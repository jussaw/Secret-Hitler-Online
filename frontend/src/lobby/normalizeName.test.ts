import { describe, expect, it } from "vitest";
import { normalizeName, typedName } from "./normalizeName";

describe("typedName", () => {
  it("drops whitespace at the start and collapses runs of it", () => {
    expect(typedName(" \t Sam  \t Lee")).toBe("Sam Lee");
  });

  it("keeps one space at the end, for the rest of the name", () => {
    expect(typedName("Sam  ")).toBe("Sam ");
  });

  it("stops at twelve characters", () => {
    expect(typedName("Wolfgang Maxwell")).toBe("Wolfgang Max");
  });
});

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
