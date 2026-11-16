import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigate, parseRoute, routePath, TAB_IDS, useLocation, type StatsRoute } from "./routes";

const cases: [string, StatsRoute][] = [
  ["/stats", { page: "tab", tab: "overview" }],
  ["/stats/", { page: "tab", tab: "overview" }],
  ["/stats/roles", { page: "tab", tab: "roles" }],
  ["/stats/records", { page: "tab", tab: "records" }],
  ["/stats/games", { page: "games" }],
  ["/stats/games/", { page: "games" }],
  ["/stats/games/abc-123", { page: "game", id: "abc-123" }],
  ["/stats/games/a%20b", { page: "game", id: "a b" }],
  ["/stats/players", { page: "players" }],
  ["/stats/players/7", { page: "player", number: 7 }],
  ...[
    "/stats/players/07",
    "/stats/players/0",
    "/stats/players/x",
    "/stats/players/-1",
    "/stats/overview",
    "/stats/nope",
    "/stats/games/a/b",
    "/stats/games/%E0%A4%A",
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
      "/stats/games",
      "/stats/games",
      "/stats/games/abc-123",
      "/stats/games/a%20b",
      "/stats/players",
      "/stats/players/7",
      ...Array.from({ length: 8 }, () => "/stats"),
    ]);
    for (const [, route] of cases) {
      if (route.page !== "notFound") expect(parseRoute(routePath(route))).toEqual(route);
    }
    expect(routePath({ page: "game", id: "a/b?c" })).toBe("/stats/games/a%2Fb%3Fc");
    expect(parseRoute(routePath({ page: "game", id: "a/b?c" }))).toEqual({ page: "game", id: "a/b?c" });
  });
});

describe("navigate and useLocation", () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    history.replaceState(null, "", "/stats/games");
    scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navigate pushes once and tells useLocation", () => {
    const { result } = renderHook(() => useLocation());
    expect(result.current).toEqual({ pathname: "/stats/games", search: "" });
    const first = result.current;
    const length = history.length;

    act(() => navigate("/stats/games/g1?x=1"));
    expect(result.current).toEqual({ pathname: "/stats/games/g1", search: "?x=1" });
    expect(result.current).not.toBe(first);
    expect(history.length).toBe(length + 1);

    const second = result.current;
    act(() => navigate("/stats/games/g1?x=1"));
    expect(history.length).toBe(length + 1);
    expect(result.current).toBe(second);
  });

  it("navigate scrolls to the top only for a new page", () => {
    act(() => navigate("/stats/games/g1"));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    history.replaceState(null, "", "/stats/games");
    scrollTo.mockClear();
    act(() => navigate("/stats/games?size=7"));
    expect(location.search).toBe("?size=7");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("the back button tells useLocation", async () => {
    const { result } = renderHook(() => useLocation());
    act(() => navigate("/stats/players"));
    expect(result.current.pathname).toBe("/stats/players");
    act(() => history.back());
    await waitFor(() => expect(result.current.pathname).toBe("/stats/games"));
  });
});
