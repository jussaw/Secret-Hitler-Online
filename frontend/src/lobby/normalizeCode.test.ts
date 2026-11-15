import { describe, expect, it } from "vitest";
import { normalizeCode } from "./normalizeCode";

describe("normalizeCode", () => {
  it("puts a code in capitals", () => {
    expect(normalizeCode("abcd")).toBe("ABCD");
  });

  it("keeps the first four letters", () => {
    expect(normalizeCode("abcde")).toBe("ABCD");
  });

  it("drops whitespace anywhere", () => {
    expect(normalizeCode(" ab cd ")).toBe("ABCD");
  });
});
