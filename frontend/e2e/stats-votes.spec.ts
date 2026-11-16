import { expect, test } from "@playwright/test";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, statsSizesFor, stubStats } from "./stats";

/** VOTES & POWERS in the browser: the tab at every stats size, and every card's empty line. */

const NO_GAMES = "No games yet with these players.";

test("VOTES & POWERS fits every stats size", async ({ page }, testInfo) => {
  test.slow(); // the tab at every size, twice
  const sizes = statsSizesFor(testInfo.project.name, page.viewportSize()!);
  await stubStats(page, bigStatsData());
  for (const search of ["", "?cpu=1"]) {
    await page.goto(`/stats/votes${search}`);
    await expect(page.locator(".votes-card")).toHaveCount(26);
    await settle(page);
    await expect(page.locator(".votes-tab").getByText(NO_GAMES)).toHaveCount(0);
    for (const size of sizes) await checkStatsPage(page, size);
  }
});

test("with no counted game every card says so", async ({ page }) => {
  await stubStats(page, bigStatsData());
  await page.goto("/stats/votes?players=1"); // no game has player 1 in every human seat
  await expect(page.locator(".votes-tab").getByText(NO_GAMES)).toHaveCount(26);
});

test("INVESTIGATIONS' longest value wraps inside its card at 320px", async ({ page }) => {
  await page.setViewportSize(NARROW_PHONE);
  await stubStats(page, bigStatsData());
  await page.goto("/stats/votes?cpu=1");
  const card = page.getByRole("region", { name: "INVESTIGATIONS", exact: true });
  const values = card.locator(".ranked-value");
  await expect(values.first()).toBeVisible();
  await settle(page);
  // Each value names whom the player investigated: far wider than a phone on one line.
  const longest = Math.max(...(await values.allTextContents()).map((text) => text.length));
  expect(longest, "the longest value").toBeGreaterThan(100);
  await checkStatsPage(page, NARROW_PHONE);
  const { right, table, cells } = await card.evaluate((el) => ({
    right: el.getBoundingClientRect().right,
    table: el.querySelector("table")!.getBoundingClientRect().width,
    cells: Array.from(el.querySelectorAll(".ranked-value"), (cell) => {
      const r = cell.getBoundingClientRect();
      return { right: r.right, width: r.width };
    }),
  }));
  for (const cell of cells) {
    expect(cell.right, "a value inside its card").toBeLessThanOrEqual(right + 0.5);
    // Wrapped as text, a few words to a line, not squeezed to a letter a line beside the name.
    expect(cell.width, "a value's share of its row").toBeGreaterThanOrEqual(table / 2);
  }
});
