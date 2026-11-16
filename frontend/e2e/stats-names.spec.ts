import { expect, test, type Page } from "@playwright/test";
import type { GameRecord, StatsData } from "../src/stats/record";
import { routePath, TAB_IDS } from "../src/stats/routes";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, STACKED_QUERY, statsSizesFor, stubStats } from "./stats";

/**
 * Players' names as links (Phase 22A): in every table they are 44px targets that never overlap
 * where the stacked query matches, a name in GAMES opens its player's page (not the row's game),
 * and a game page shows its Elo change when the game counted.
 */

const data = bigStatsData();

/** The newest game with no CPU seat that finished. */
const counted: GameRecord = [...data.games]
  .reverse()
  .find((g) => !g.hasCpu && !g.seats.some((s) => s.cpu) && g.outcome !== "UNFINISHED")!;
/** The newest unfinished game. */
const unfinished: GameRecord = [...data.games].reverse().find((g) => g.outcome === "UNFINISHED")!;

/** Opens `path` with `stubbed` answering the records, once the page shows. */
async function open(page: Page, path: string, stubbed: StatsData = data): Promise<void> {
  await stubStats(page, stubbed);
  await page.goto(path);
  await expect(page.locator(".stats-main .stats-card").first()).toBeVisible();
  await settle(page);
}

/**
 * Every pair of name links that overlap, as `"<name> / <name>"`: for each table, its visible
 * `a.player-link` boxes grouped by their cell's column, and each pair in one column whose boxes
 * share any area.
 */
function overlappingNameLinks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const table of Array.from(document.querySelectorAll("table"))) {
      const columns = new Map<number, { name: string; box: DOMRect }[]>();
      for (const link of Array.from(table.querySelectorAll<HTMLAnchorElement>("a.player-link"))) {
        const box = link.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const cell = link.closest("td, th") as HTMLTableCellElement | null;
        if (!cell) continue;
        const list = columns.get(cell.cellIndex) ?? [];
        list.push({ name: (link.textContent ?? "").trim(), box });
        columns.set(cell.cellIndex, list);
      }
      columns.forEach((links) => {
        for (let i = 0; i < links.length; i++) {
          for (let j = i + 1; j < links.length; j++) {
            const a = links[i].box;
            const b = links[j].box;
            const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
            if (overlap) out.push(`${links[i].name} / ${links[j].name}`);
          }
        }
      });
    }
    return out;
  });
}

const PAGES: [string, string][] = [
  ...TAB_IDS.map((tab): [string, string] => [tab.toUpperCase(), routePath({ page: "tab", tab })]),
  ["GAMES", routePath({ page: "games" })],
  ["a game page", routePath({ page: "game", id: counted.id })],
];

test.describe("name links in tables are 44px and never overlap", () => {
  for (const [label, path] of PAGES) {
    test(`name links in tables are 44px and never overlap: ${label}`, async ({ page }) => {
      test.slow();
      await open(page, path);
      expect(await page.locator("a.player-link").count(), "the page has name links").toBeGreaterThan(0);
      for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
        await checkStatsPage(page, size);
        if (await page.evaluate((query) => matchMedia(query).matches, STACKED_QUERY)) {
          expect(await overlappingNameLinks(page), `overlapping names at ${size.width}x${size.height}`).toEqual([]);
        }
      }
    });
  }
});

test("a name in GAMES opens its player page, at its top", async ({ page }) => {
  await open(page, routePath({ page: "games" }));
  const lastRow = page.locator(".games-row").last();
  await lastRow.scrollIntoViewIfNeeded();
  const name = lastRow.locator("a.player-link").first();
  const href = await name.getAttribute("href");
  expect(href).toMatch(/^\/stats\/players\/\d+$/);
  expect(await page.evaluate(() => window.scrollY), "scrolled down to the last row").toBeGreaterThan(0);
  await name.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  expect(new URL(page.url()).pathname).not.toMatch(/^\/stats\/games/);
  await expect(page.getByRole("heading", { name: "PLAYER" })).toBeVisible();
  await expect(page.getByText("Coming in a later update.")).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("a game page shows its Elo change", async ({ page }) => {
  await open(page, routePath({ page: "game", id: counted.id }));
  await expect(page.locator(".game-header p.game-elo")).toHaveText(/^Elo: Liberals (?:[+−]\d+|0) · Fascists (?:[+−]\d+|0)$/);
  await page.goto(routePath({ page: "game", id: unfinished.id }));
  await expect(page.locator(".game-header")).toBeVisible();
  await expect(page.locator(".game-header p.game-elo")).toHaveCount(0);
  await expect(page.locator(".game-header")).not.toContainText("Elo:");
});
