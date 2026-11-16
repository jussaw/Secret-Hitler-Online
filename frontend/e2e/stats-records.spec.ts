import { expect, test, type Page } from "@playwright/test";
import type { StatsData } from "../src/stats/record";
import { makeRecord, makeSeats } from "../src/stats/testRecords";
import { MIN_TARGET } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, statsSizesFor, stubStats } from "./stats";

/**
 * RECORDS in the browser: the tab fits at every stats size with its game link a 44px target, the
 * link opens the upset's game, and the player of the month follows the browser's time zone.
 */

const desktopOnly = () => test.skip(test.info().project.name !== "desktop", "one browser is enough");

/**
 * Opens RECORDS with `data` stubbed and the clock at `at`, by default an hour after its latest
 * game ended (so this month has a player of the month).
 */
async function open(page: Page, data: StatsData = bigStatsData(), at?: number): Promise<void> {
  await stubStats(page, data);
  const latest = data.games.reduce((most, game) => Math.max(most, game.endedAt), 0);
  await page.clock.setFixedTime(at ?? latest + 3_600_000);
  await page.goto("/stats/records");
  await expect(page.locator(".records-tab")).toBeVisible();
  await settle(page);
}

test("RECORDS fits sideways at every stats size, with 44px targets", async ({ page }) => {
  test.slow();
  await open(page);
  for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
    await checkStatsPage(page, size);
    const at = `${size.width}x${size.height}`;
    const links = await page.locator("a.records-game-link").evaluateAll((all) =>
      all.map((a) => {
        const r = a.getBoundingClientRect();
        return { width: r.width, height: r.height };
      })
    );
    expect(links.length, `game links at ${at}`).toBeGreaterThanOrEqual(1);
    for (const link of links) {
      expect(link.width, `game link width at ${at}`).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(link.height, `game link height at ${at}`).toBeGreaterThanOrEqual(MIN_TARGET);
    }
  }
});

test("See the game opens the upset's game", async ({ page }) => {
  desktopOnly();
  const data = bigStatsData();
  await open(page, data);
  await page.locator('[data-card="rating-records"]').getByRole("link", { name: "See the game" }).click();
  await expect(page).toHaveURL(/\/stats\/games\/[^/]+$/);
  const id = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
  expect(data.games.map((game) => game.id)).toContain(id);
});

/**
 * One counted five-player game across midnight UTC, from 23:30 on Saturday 31 October 2026, won
 * by Ann and Bo, the Fascists.
 */
function halloweenGame(): StatsData {
  const game = makeRecord({
    id: "halloween",
    startedAt: Date.parse("2026-10-31T23:30:00Z"),
    endedAt: Date.parse("2026-11-01T00:10:00Z"),
    outcome: "FASCIST_POLICIES",
    winner: "FASCIST",
    liberalPolicies: 2,
    fascistPolicies: 6,
    seats: makeSeats(["FASCIST", "HITLER", "LIBERAL", "LIBERAL", "LIBERAL"], [1, 2, 3, 4, 5]),
  });
  const names = ["Ann", "Bo", "Cy", "Di", "Ed"];
  return { players: names.map((name, i) => ({ number: i + 1, name })), games: [game] };
}
const NOVEMBER_20 = Date.parse("2026-11-20T12:00:00Z");

test.describe("in Europe/Paris", () => {
  test.use({ timezoneId: "Europe/Paris" });

  test("the game started on 1 November, so Ann is this month's player of the month", async ({ page }) => {
    desktopOnly();
    await open(page, halloweenGame(), NOVEMBER_20);
    await expect(page.locator('[data-card="player-of-the-month"]')).toContainText("November 2026");
    await expect(page.locator('[data-card="player-of-the-month"] .records-line')).toHaveText("Ann, Bo · 1 win");
    await expect(page.locator('[data-card="players-of-the-month"]')).toContainText("No completed months yet.");
  });
});

test.describe("in America/Los_Angeles", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("the game started on 31 October, so it is in the history", async ({ page }) => {
    desktopOnly();
    await open(page, halloweenGame(), NOVEMBER_20);
    await expect(page.locator('[data-card="player-of-the-month"]')).toContainText("No wins yet this month.");
    const history = page.locator('[data-card="players-of-the-month"] tbody tr');
    await expect(history).toHaveCount(1);
    await expect(history.locator(".records-sub")).toHaveText("October 2026");
    await expect(history.locator("li")).toHaveText(["Ann", "Bo"]);
    await expect(history.locator(".ranked-value")).toHaveText("1 win");
  });
});
