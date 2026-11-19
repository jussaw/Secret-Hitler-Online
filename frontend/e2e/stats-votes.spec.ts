import { expect, test } from "@playwright/test";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, expectWholeTables, statsSizesFor, stubStats, type WholeTable } from "./stats";

/**
 * VOTES & POWERS in the browser: the tab at every stats size, the split tables that fitted their
 * cards before their heads sorted (#109) still whole there, and every card's empty line.
 */

const NO_GAMES = "No games yet with these players.";

/** Split tables that fit their card without scrolling, at every size but those they scrolled at
 *  before their heads sorted (#109). */
const WHOLE: WholeTable[] = [
  { region: "JA RATE table", scrollsAt: ["1024x1366", "700x900", "320x568"] },
  { region: "TIMES INVESTIGATED table", scrollsAt: [] },
  { region: "VETOES AS PRESIDENT table", scrollsAt: [] },
  { region: "SURVIVAL table", scrollsAt: [] },
];

test("VOTES & POWERS fits every stats size", async ({ page }, testInfo) => {
  test.slow(); // the tab at every size, twice
  const sizes = statsSizesFor(testInfo.project.name, page.viewportSize()!);
  await stubStats(page, bigStatsData());
  for (const search of ["", "?cpu=1"]) {
    await page.goto(`/stats/votes${search}`);
    await expect(page.locator(".votes-card")).toHaveCount(26);
    await settle(page);
    await expect(page.locator(".votes-tab").getByText(NO_GAMES)).toHaveCount(0);
    for (const size of sizes) {
      await checkStatsPage(page, size);
      await expectWholeTables(page, WHOLE, size);
    }
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
  // Wrapped as text, a few words to a line, not squeezed to a letter a line beside the name.
  const { table, widths } = await card.evaluate((el) => ({
    table: el.querySelector("table")!.getBoundingClientRect().width,
    widths: Array.from(el.querySelectorAll(".ranked-value"), (cell) => cell.getBoundingClientRect().width),
  }));
  for (const width of widths) expect(width, "a value's share of its row").toBeGreaterThanOrEqual(table / 2);
});

test("every flex and grid child of the tab with text can shrink", async ({ page }) => {
  // "Names never overflow": a flex or grid item's min-width is auto unless set, which lets a long
  // line widen its row instead of wrapping in it.
  await stubStats(page, bigStatsData());
  await page.goto("/stats/votes");
  await expect(page.locator(".votes-card")).toHaveCount(26);
  const stuck = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".votes-tab *"))
      .filter((el) => {
        const parent = el.parentElement;
        if (!parent || (el.textContent ?? "").trim() === "") return false;
        return /flex|grid/.test(getComputedStyle(parent).display) && getComputedStyle(el).minWidth === "auto";
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
  );
  expect(stuck).toEqual([]);
});
