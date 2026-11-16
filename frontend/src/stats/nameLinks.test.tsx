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
 * inside another link or control, and a name in a sentence or a headline stays plain.
 */

const fixtureData = (): StatsData => parseStatsData(JSON.parse(JSON.stringify(fixture)));

/** The newest game with no CPU seat that finished, and the newest with a CPU seat. */
function gamesOf(data: StatsData): { plain: string; cpu: string } {
  const newest = [...data.games].reverse();
  return {
    plain: newest.find((g) => !g.hasCpu && g.outcome !== "UNFINISHED")!.id,
    cpu: newest.find((g) => g.hasCpu)!.id,
  };
}

/** Every page the check opens for `data`: the tabs, GAMES, and two of its games. */
function pathsOf(games: { plain: string; cpu: string }): string[] {
  return [
    ...TAB_IDS.map((tab) => routePath({ page: "tab", tab })),
    routePath({ page: "games" }),
    routePath({ page: "game", id: games.plain }),
    routePath({ page: "game", id: games.cpu }),
  ];
}

const SETS: { label: string; data: () => StatsData; games: (data: StatsData) => { plain: string; cpu: string } }[] = [
  { label: "the sample", data: sampleData, games: () => ({ plain: "g1", cpu: "cpu" }) },
  { label: "the contract fixture", data: fixtureData, games: gamesOf },
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
    it(`namesAreLinksNeverNested on ${set.label}`, async () => {
      const data = set.data();
      let linked = 0;
      for (const path of pathsOf(set.games(data))) {
        const container = await open(path, data);
        expect(container.querySelectorAll("a a, button a, label a, a button"), `${path}: nested`).toHaveLength(0);
        const names = Array.from(container.querySelectorAll<HTMLElement>(".player-name"));
        for (const name of names) {
          const listed = name.closest("td, th, .game-seats, .games-row-seats");
          if (name.dataset.player !== undefined && listed) {
            expect(name.tagName, `${path}: ${name.textContent}`).toBe("A");
            expect(name).toHaveClass("player-link");
          }
        }
        for (const link of Array.from(container.querySelectorAll("a.player-link"))) {
          expect(link.textContent ?? "", `${path}: a CPU seat's link`).not.toMatch(/^Bot /);
          expect(link.getAttribute("href"), path).toMatch(/^\/stats\/players\/\d+(\?|$)/);
          linked++;
        }
        cleanup();
      }
      expect(linked, "some names are links").toBeGreaterThan(0);
    });

    it(`headlinesKeepPlainNames on ${set.label}`, async () => {
      const data = set.data();
      const checks: [string, string][] = [
        [routePath({ page: "tab", tab: "overview" }), '[aria-label="At a glance"]'],
        [routePath({ page: "tab", tab: "rivals" }), ".rivals-headline"],
        [routePath({ page: "tab", tab: "activity" }), '[data-card="fastest-voter"] .activity-line'],
        [routePath({ page: "tab", tab: "activity" }), '[data-card="slowest-president"] .activity-line'],
        [routePath({ page: "tab", tab: "records" }), ".records-line"],
      ];
      let named = 0;
      for (const [path, selector] of checks) {
        const container = await open(path, data);
        for (const headline of Array.from(container.querySelectorAll(selector))) {
          expect(headline.querySelector("a.player-link"), `${path} ${selector}`).toBeNull();
          named += headline.querySelectorAll(".player-name").length;
        }
        cleanup();
      }
      expect(named, "some headlines name players").toBeGreaterThan(0);
    });
  }
});
