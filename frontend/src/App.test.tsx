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

test("the lobby marks only the first player as HOST", async () => {
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
  const rows = [...container.querySelectorAll(".lobby-players li.roster-row")];
  expect(rows.map((row) => row.getAttribute("data-player"))).toEqual(["A", "B", "C"]);
  expect(rows.map((row) => row.querySelector(".roster-detail")?.textContent)).toEqual(["HOST", "", ""]);
});

test("the login checks send the name and lobby as whole query values", async () => {
  const app = createRef<App>();
  render(<App ref={app} />);
  await app.current!.tryLogin("A&B #1+?=", "HB&A");
  await app.current!.tryWatchLogin("HB#A");
  const checks = vi
    .mocked(fetch)
    .mock.calls.map(([url]) => new URL(String(url), "http://host"))
    .filter((url) => url.pathname.endsWith("/check-login"));
  expect(checks).toHaveLength(2);
  expect(checks[0].searchParams.get("name")).toBe("A&B #1+?=");
  expect(checks[0].searchParams.get("lobby")).toBe("HB&A");
  expect(checks[1].searchParams.get("lobby")).toBe("HB#A");
  expect(checks[1].searchParams.get("spectator")).toBe("true");
});
