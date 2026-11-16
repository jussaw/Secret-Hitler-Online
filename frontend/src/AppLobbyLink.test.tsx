import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import App from "./App";

let consoleError: MockInstance;
let startUrl: string;

beforeEach(() => {
  // App pings the server from its constructor and asks /me from componentDidMount: the page is
  // signed out.
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        String(url).endsWith("/me")
          ? new Response(JSON.stringify({ signedIn: false, discord: true, testSignIn: false }), {
              status: 200,
            })
          : new Response(null, { status: 200 })
      )
    )
  );
  consoleError = vi.spyOn(console, "error");
  startUrl = window.location.href;
});

afterEach(() => {
  window.history.replaceState({}, "", startUrl);
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

test("a lobby link fills the join form's code field, upper-cased", () => {
  window.history.pushState({}, "", "/?lobby=abcd");
  render(<App />);
  expect(screen.getByLabelText("Lobby code")).toHaveValue("ABCD");
  expect(consoleError).not.toHaveBeenCalled();
});

test("signing in from a lobby link comes back to its code", async () => {
  window.history.pushState({}, "", "/?lobby=abcd");
  render(<App />);
  const link = await screen.findByRole("link", { name: "SIGN IN WITH DISCORD" });
  expect(link.getAttribute("href")).toMatch(/\/auth\/discord\?lobby=ABCD$/);
  // The link stays in the address bar, so a reload still has it.
  expect(window.location.search).toBe("?lobby=abcd");
  await waitFor(() => expect(consoleError).not.toHaveBeenCalled());
});
