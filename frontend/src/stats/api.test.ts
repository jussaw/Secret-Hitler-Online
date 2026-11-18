import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStatsData, resetStatsDataForTests, STATS_GAMES_PATH, STATS_LOAD_ERROR, useStatsData } from "./api";
import fixture from "./fixtures/recorded-games.json";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Stubs fetch with one answer per call, in order (an Error is a network failure). */
function mockFetch(...answers: (Response | Error)[]) {
  const fn = vi.fn();
  for (const answer of answers) {
    if (answer instanceof Error) fn.mockRejectedValueOnce(answer);
    else fn.mockResolvedValueOnce(answer);
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** A promise and the function that resolves it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("fetchStatsData", () => {
  beforeEach(() => resetStatsDataForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("fetches and parses the games", async () => {
    const fn = mockFetch(json(fixture));
    expect(STATS_GAMES_PATH).toBe("/api/stats/games");
    const data = await fetchStatsData();
    expect(String(fn.mock.calls[0][0]).endsWith("/api/stats/games")).toBe(true);
    expect(data.games.length).toBe(fixture.games.length);
    expect(data.players).toEqual(fixture.players);
  });

  it("rejects a failed or malformed answer", async () => {
    const newer = JSON.parse(JSON.stringify(fixture));
    newer.games[0].format = 3;
    mockFetch(
      json({ error: "down" }, 503),
      new TypeError("Failed to fetch"),
      new Response("<html><body>Bad gateway</body></html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      json(newer)
    );
    await expect(fetchStatsData()).rejects.toThrow("/api/stats/games answered 503");
    await expect(fetchStatsData()).rejects.toThrow("Failed to fetch");
    await expect(fetchStatsData()).rejects.toThrow(Error);
    await expect(fetchStatsData()).rejects.toThrow("Unsupported game record format: 3");
  });
});

describe("useStatsData", () => {
  beforeEach(() => {
    resetStatsDataForTests();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("gives the data", async () => {
    const answer = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => answer.promise));
    const { result } = renderHook(() => useStatsData());
    expect(result.current).toEqual({ data: null, error: null });
    answer.resolve(json(fixture));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect(result.current.data!.games.length).toBe(fixture.games.length);
  });

  it("gives the error line", async () => {
    mockFetch(json({}, 503));
    const { result } = renderHook(() => useStatsData());
    await waitFor(() => expect(result.current).toEqual({ data: null, error: STATS_LOAD_ERROR }));
    expect(STATS_LOAD_ERROR).toBe("Could not load the games. Reload the page to try again.");
  });

  it("one request per page load", async () => {
    const fn = mockFetch(json(fixture));
    const one = renderHook(() => useStatsData());
    const two = renderHook(() => useStatsData());
    await waitFor(() => expect(one.result.current.data).not.toBeNull());
    await waitFor(() => expect(two.result.current.data).not.toBeNull());
    const three = renderHook(() => useStatsData());
    expect(three.result.current.data).toBe(one.result.current.data);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a failure is asked again", async () => {
    const fn = mockFetch(json({}, 503), json(fixture));
    const first = renderHook(() => useStatsData());
    await waitFor(() => expect(first.result.current.error).toBe(STATS_LOAD_ERROR));
    first.unmount();
    const again = renderHook(() => useStatsData());
    await waitFor(() => expect(again.result.current.data).not.toBeNull());
    expect(again.result.current.error).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
