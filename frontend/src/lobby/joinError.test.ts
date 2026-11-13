import { describe, expect, it } from "vitest";
import { CONTACT_ERROR, joinErrorMessage } from "./joinError";

describe("joinErrorMessage", () => {
  it("says the lobby could not be found for 404", () => {
    expect(joinErrorMessage(404, "Sam")).toBe("The lobby could not be found.");
  });

  it("names the taken name for 403", () => {
    expect(joinErrorMessage(403, "Sam")).toBe(
      "There is already a user with the name 'Sam' in the lobby.",
    );
  });

  it("says the lobby is in a game for 488", () => {
    expect(joinErrorMessage(488, "Sam")).toBe(
      "The lobby is currently in a game.",
    );
  });

  it("says the lobby is full for 489", () => {
    expect(joinErrorMessage(489, "Sam")).toBe("The lobby is currently full.");
  });

  it("falls back to a connection error for any other status", () => {
    expect(joinErrorMessage(500, "Sam")).toBe(
      "There was an error connecting to the server. Please try again.",
    );
  });

  it("has a message for a request that never got a response", () => {
    expect(CONTACT_ERROR).toBe(
      "There was an error contacting the server. Please wait and try again.",
    );
  });
});
