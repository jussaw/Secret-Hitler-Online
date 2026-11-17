import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigate, parseRoute, routePath, TAB_IDS, useLocation, type StatsRoute } from "./routes";

const cases: [string, StatsRoute][] = [
  ["/stats", { page: "tab", tab: "overview" }],
  ["/stats/", { page: "tab", tab: "overview" }],
  ["/stats/roles", { page: "tab", tab: "roles" }],
  ["/stats/records", { page: "tab", tab: "records" }],
  ["/games", { page: "games" }],
  ["/games/", { page: "games" }],
  ["/games/abc-123", { page: "game", id: "abc-123" }],
  ["/games/a%20b", { page: "game", id: "a b" }],
  ["/players", { page: "players" }],
  ["/players/7", { page: "player", number: 7 }],
  ...[
    "/players/07",
    "/players/0",
    "/players/x",
    "/players/-1",
    "/stats/overview",
    "/stats/nope",
    "/games/a/b",
    "/games/%E0%A4%A",
    // GAMES' and PLAYERS' old addresses: the entry sends them on before the page reads them
    // (followMovedStatsPath).
    "/stats/games",
    "/stats/players/7",
    "/gamesx",
    "/game",
  ].map((p) => [p, { page: "notFound" }] as [string, StatsRoute]),
];

describe("parseRoute", () => {
  it("reads every stats path", () => {
    for (const [path, route] of cases) {
      expect(parseRoute(path), path).toEqual(route);
    }
  });

  it("reads every tab", () => {
    for (const tab of TAB_IDS) {
      expect(parseRoute(routePath({ page: "tab", tab }))).toEqual({ page: "tab", tab });
    }
  });
});

describe("routePath", () => {
  it("writes each route's path, which reads back as the route", () => {
    const paths = cases.map(([, route]) => routePath(route));
    expect(paths).toEqual([
      "/stats",
      "/stats",
      "/stats/roles",
      "/stats/records",
      "/games",
      "/games",
      "/games/abc-123",
      "/games/a%20b",
      "/players",
      "/players/7",
      ...Array.from({ length: 12 }, () => "/stats"),
    ]);
    for (const [, route] of cases) {
      if (route.page !== "notFound") expect(parseRoute(routePath(route))).toEqual(route);
    }
    expect(routePath({ page: "game", id: "a/b?c" })).toBe("/games/a%2Fb%3Fc");
    expect(parseRoute(routePath({ page: "game", id: "a/b?c" }))).toEqual({ page: "game", id: "a/b?c" });
  });
});

describe("navigate and useLocation", () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    history.replaceState(null, "", "/games");
    scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navigate pushes once and tells useLocation", () => {
    const { result } = renderHook(() => useLocation());
    expect(result.current).toEqual({ pathname: "/games", search: "" });
    const first = result.current;
    const length = history.length;

    act(() => navigate("/games/g1?x=1"));
    expect(result.current).toEqual({ pathname: "/games/g1", search: "?x=1" });
    expect(result.current).not.toBe(first);
    expect(history.length).toBe(length + 1);

    const second = result.current;
    act(() => navigate("/games/g1?x=1"));
    expect(history.length).toBe(length + 1);
    expect(result.current).toBe(second);
  });

  it("navigate scrolls to the top only for a new page", () => {
    act(() => navigate("/games/g1"));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    history.replaceState(null, "", "/games");
    scrollTo.mockClear();
    act(() => navigate("/games?size=7"));
    expect(location.search).toBe("?size=7");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("the back button tells useLocation", async () => {
    const { result } = renderHook(() => useLocation());
    act(() => navigate("/players"));
    expect(result.current.pathname).toBe("/players");
    act(() => history.back());
    await waitFor(() => expect(result.current.pathname).toBe("/games"));
  });
});
