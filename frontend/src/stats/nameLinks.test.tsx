import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStatsDataForTests } from "./api";
import fixture from "./fixtures/recorded-games.json";
import { sampleData } from "./players/testStats";
import { parseStatsData, type StatsData } from "./record";
import { routePath, TAB_IDS } from "./routes";
import StatsApp from "./StatsApp";

/**
 * Names across the whole stats app (Phase 22A): each player's name is a link to their page, never
 * inside another link or control, and a name in a sentence or a headline stays plain. Each test
 * opens one page (#101), so a busy machine's slower draws stay far inside Vitest's 5 s timeout,
 * and a test that runs out has no later page left to draw over the next test's.
 */

const fixtureData = (): StatsData => parseStatsData(JSON.parse(JSON.stringify(fixture)));

/** Two games' IDs: one with no CPU seat that finished, and one with a CPU seat. */
type TwoGames = { plain: string; cpu: string };

/** The newest game with no CPU seat that finished, and the newest with a CPU seat. */
function gamesOf(data: StatsData): TwoGames {
  const newest = [...data.games].reverse();
  return {
    plain: newest.find((g) => !g.hasCpu && g.outcome !== "UNFINISHED")!.id,
    cpu: newest.find((g) => g.hasCpu)!.id,
  };
}

/**
 * Every page the check opens, each with the name its test gives it: the tabs, GAMES, and the data
 * set's two `games`, named for what they are rather than for IDs that a new fixture changes.
 */
function pagesOf(games: TwoGames): { name: string; path: string }[] {
  const tabs = TAB_IDS.map((tab) => routePath({ page: "tab", tab }));
  return [
    ...[...tabs, routePath({ page: "games" })].map((path) => ({ name: path, path })),
    { name: "a game without bots", path: routePath({ page: "game", id: games.plain }) },
    { name: "a game with bots", path: routePath({ page: "game", id: games.cpu }) },
  ];
}

/** The headlines the check reads, by page and selector. */
const HEADLINES: [string, string][] = [
  [routePath({ page: "tab", tab: "overview" }), '[aria-label="At a glance"]'],
  [routePath({ page: "tab", tab: "rivals" }), ".rivals-headline"],
  [routePath({ page: "tab", tab: "activity" }), '[data-card="fastest-voter"] .activity-line'],
  [routePath({ page: "tab", tab: "activity" }), '[data-card="slowest-president"] .activity-line'],
  [routePath({ page: "tab", tab: "records" }), ".records-line"],
];

/**
 * The data sets the checks run on. `unnamed`: the selectors of `HEADLINES` whose headlines name
 * nobody in this set, since the sample's 8 games are too few for a rivals headline or a fastest
 * voter; every other check also shows that its selector still finds names.
 */
const SETS: { label: string; data: () => StatsData; games: (data: StatsData) => TwoGames; unnamed: string[] }[] = [
  {
    label: "the sample",
    data: sampleData,
    games: () => ({ plain: "g1", cpu: "cpu" }),
    unnamed: [".rivals-headline", '[data-card="fastest-voter"] .activity-line'],
  },
  { label: "the contract fixture", data: fixtureData, games: gamesOf, unnamed: [] },
];

/** StatsApp at `path`, answering its request with `data`, once the page shows. */
async function open(path: string, data: StatsData): Promise<HTMLElement> {
  resetStatsDataForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } }))
  );
  history.replaceState(null, "", path);
  const { container } = render(<StatsApp />);
  await waitFor(() => {
    expect(container.querySelector(".stats-message")).toBeNull();
    expect(container.querySelector(".stats-main")!.children.length).toBeGreaterThan(0);
  });
  return container;
}

describe("name links", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const set of SETS) {
    const data = set.data();

    it.each(pagesOf(set.games(data)))(`namesAreLinksNeverNested on ${set.label} at $name`, async ({ path }) => {
      const container = await open(path, data);
      expect(container.querySelectorAll("a a, button a, label a, a button"), "nested").toHaveLength(0);
      for (const name of Array.from(container.querySelectorAll<HTMLElement>(".player-name"))) {
        const listed = name.closest("td, th, .game-seats, .games-row-seats");
        if (name.dataset.player !== undefined && listed) {
          expect(name.tagName, name.textContent ?? "").toBe("A");
          expect(name).toHaveClass("player-link");
        }
      }
      const links = Array.from(container.querySelectorAll("a.player-link"));
      for (const link of links) {
        expect(link.textContent ?? "", "a CPU seat's link").not.toMatch(/^Bot /);
        expect(link.getAttribute("href")).toMatch(/^\/players\/\d+(\?|$)/);
      }
      expect(links.length, "some names are links").toBeGreaterThan(0);
    });

    it.each(HEADLINES)(`headlinesKeepPlainNames on ${set.label} at %s, %s`, async (path, selector) => {
      const container = await open(path, data);
      let named = 0;
      for (const headline of Array.from(container.querySelectorAll(selector))) {
        expect(headline.querySelector("a.player-link")).toBeNull();
        named += headline.querySelectorAll(".player-name").length;
      }
      if (!set.unnamed.includes(selector)) expect(named, "the headlines name players").toBeGreaterThan(0);
    });
  }
});
