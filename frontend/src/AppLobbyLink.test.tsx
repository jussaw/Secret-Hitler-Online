import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import App from "./App";

let consoleError: MockInstance;
let startUrl: string;

beforeEach(() => {
  // App pings the server from its constructor; keep that off the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(null, { status: 200 })))
  );
  consoleError = vi.spyOn(console, "error");
  startUrl = window.location.href;
});

afterEach(() => {
  window.history.replaceState({}, "", startUrl);
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

test("a lobby link fills the join form's Lobby field, upper-cased", () => {
  window.history.pushState({}, "", "/?lobby=abcd");
  render(<App />);
  expect(screen.getByLabelText("Lobby")).toHaveValue("ABCD");
  expect(consoleError).not.toHaveBeenCalled();
});
