import { expect, test, type Page } from "@playwright/test";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, statsSizesFor, stubStats } from "./stats";

/** ROLES & CARDS in the browser: seventeen cards that fit every stats size, wide tables scrolling in their card. */

/** StatCard's line for a filter with no games (StatCard imports CSS, so it is not imported here). */
const NO_GAMES = "No games yet with these players.";

const TITLES = [
  "Role split",
  "Role luck",
  "Times as Hitler",
  "Longest run of one role",
  "Win rate as Liberal",
  "Win rate as Fascist",
  "Win rate as Hitler",
  "Win rate by player count",
  "First president",
  "Hands drawn",
  "Liberal accuracy",
  "Deep cover (president)",
  "Given one of each",
  "Policies enacted",
  "Vetoes asked for",
  "Fascist choices",
  "Forced Fascists",
];

const SECTIONS = ["Roles", "As president", "As chancellor", "Blame"];

/** Opens `path` against the big stubbed response and waits for the tab. */
async function open(page: Page, path = "/stats/roles"): Promise<void> {
  await stubStats(page, bigStatsData());
  await page.goto(path);
  await expect(page.locator(".roles-tab")).toBeVisible();
  await settle(page);
}

test("ROLES & CARDS fits every stats size", async ({ page }) => {
  test.slow();
  await open(page);
  for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
    await page.setViewportSize(size);
    await checkStatsPage(page, size);
    for (const title of TITLES) {
      await expect(page.getByRole("region", { name: title, exact: true }), `${title} at ${size.width}x${size.height}`).toHaveCount(1);
    }
    await expect(page.getByText(NO_GAMES)).toHaveCount(0);
  }
});

test("a wide table scrolls inside its card on a 320px phone", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-360", "phone-360 only");
  await open(page);
  await checkStatsPage(page, NARROW_PHONE);
  const table = page.getByRole("region", { name: "Win rate by player count table", exact: true });
  const { scrollWidth, clientWidth } = await table.evaluate((box) => ({ scrollWidth: box.scrollWidth, clientWidth: box.clientWidth }));
  expect(scrollWidth, "the table scrolls rather than squeezing").toBeGreaterThan(clientWidth);
});

test("the tab row opens ROLES & CARDS and keeps the filter", async ({ page }) => {
  await stubStats(page, bigStatsData());
  await page.goto("/stats?cpu=1");
  const tabRow = page.getByRole("navigation", { name: "Stats sections" });
  await expect(tabRow).toBeVisible();
  const tab = tabRow.getByRole("link", { name: "ROLES & CARDS", exact: true });
  await tab.click();
  await expect(page).toHaveURL(/\/stats\/roles\?cpu=1$/);
  await expect(tab).toHaveAttribute("aria-current", "page");
  for (const section of SECTIONS) {
    await expect(page.getByRole("heading", { level: 2, name: section, exact: true })).toBeVisible();
  }
});
