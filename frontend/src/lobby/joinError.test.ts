import { describe, expect, it } from "vitest";
import { CONTACT_ERROR, joinErrorMessage } from "./joinError";

describe("joinErrorMessage", () => {
  it("says the lobby could not be found for 404", () => {
    expect(joinErrorMessage(404)).toBe("The lobby could not be found.");
  });

  it("says to sign in for 401", () => {
    expect(joinErrorMessage(401)).toBe("Sign in to play.");
  });

  it("says the player is already in the lobby for 403", () => {
    expect(joinErrorMessage(403)).toBe(
      "You're already in this lobby in another tab or window.",
    );
  });

  it("says the lobby is in a game for 488", () => {
    expect(joinErrorMessage(488)).toBe(
      "The lobby is currently in a game.",
    );
  });

  it("says the lobby is full for 489", () => {
    expect(joinErrorMessage(489)).toBe("The lobby is currently full.");
  });

  it("falls back to a connection error for any other status", () => {
    expect(joinErrorMessage(500)).toBe(
      "There was an error connecting to the server. Please try again.",
    );
  });

  it("has a message for a request that never got a response", () => {
    expect(CONTACT_ERROR).toBe(
      "There was an error contacting the server. Please wait and try again.",
    );
  });
});
