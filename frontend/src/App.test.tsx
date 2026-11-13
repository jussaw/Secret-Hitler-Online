import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { PACKET_LOBBY, PARAM_ICON, PARAM_PACKET_TYPE, PARAM_USERNAMES } from "./constants";

beforeEach(() => {
  // App pings the server from its constructor; keep that off the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(null, { status: 200 })))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders the login page with join and create forms", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "JOIN A GAME" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeInTheDocument();
});

test("pings the server once when it starts", () => {
  render(<App />);
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/ping$/));
});

test("the login page's banner reads SECRET-HITLER", () => {
  const { container } = render(<App />);
  expect(container.querySelector("header")).toHaveTextContent(/^SECRET-HITLER$/);
});

test("the lobby tags only the first player, the VIP, as [Host]", async () => {
  const app = createRef<App>();
  const { container } = render(<App ref={app} />);
  const packet = {
    [PARAM_PACKET_TYPE]: PACKET_LOBBY,
    [PARAM_USERNAMES]: ["A", "B", "C"],
    [PARAM_ICON]: { A: "p1", B: "p2", C: "p3" },
  };
  await act(() =>
    app.current!.onWebSocketMessage(new MessageEvent("message", { data: JSON.stringify(packet) }))
  );
  const names = [...container.querySelectorAll("#lobby-player-container #player-name")];
  expect(names.map((name) => name.textContent)).toEqual(["A [Host]", "B", "C"]);
});
