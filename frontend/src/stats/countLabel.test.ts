import { describe, expect, it } from "vitest";
import { countLabel, GAME_NOUNS } from "./countLabel";

describe("countLabel", () => {
  it("takesTheOneFormForOneAndTheOtherForTheRest", () => {
    expect(countLabel(1, ["loss", "losses"])).toBe("1 loss");
    expect(countLabel(2, ["loss", "losses"])).toBe("2 losses");
    expect([0, 1, 7].map((n) => countLabel(n, GAME_NOUNS))).toEqual(["0 games", "1 game", "7 games"]);
  });
});
