import { expect, test, type Locator, type Page } from "@playwright/test";
import { game, seatsOf } from "../src/stats/testGames";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, statsSizesFor, stubStats } from "./stats";

/** OVERVIEW in the browser: it fits every stats size, follows the filter and shows a rating's details. */

/** A `GET /api/stats/games` response (this spec imports only `./stats`, `./lobby`, `./layout` and `testGames`). */
type StatsData = ReturnType<typeof bigStatsData>;

/** The game's phone-only query (GameScreen.css), where the filter folds into one line. */
const PHONE_ONLY =
  "((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))";
const DAY = 24 * 60 * 60 * 1000;
const H = 60 * 60 * 1000;

/** Fixes the page's clock two days after the last game in `data` ends. */
async function twoDaysOn(page: Page, data: StatsData): Promise<void> {
  const last = Math.max(...data.games.map((g) => g.endedAt));
  await page.clock.setFixedTime(last + 2 * DAY);
}

/** Opens `path` with `data` stubbed, and waits for OVERVIEW's dashboard. */
async function open(page: Page, data: StatsData, path: string): Promise<void> {
  await stubStats(page, data);
  await page.goto(path);
  await expect(page.getByRole("region", { name: "At a glance" })).toBeVisible();
  await settle(page);
}

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const phoneLayout = (page: Page) => page.evaluate((query) => matchMedia(query).matches, PHONE_ONLY);

/** A card's table rows, each as its cells' text. */
function rows(table: Locator): Promise<string[][]> {
  return table
    .locator("tbody tr")
    .evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td"), (td) => (td.textContent ?? "").trim())));
}

test("OVERVIEW fits every stats size", async ({ page }) => {
  test.slow();
  const data = bigStatsData();
  await twoDaysOn(page, data);
  for (const path of ["/stats", "/stats?cpu=1"]) {
    await open(page, data, path);
    // The dashboard names its leaders (twelve-character names) and the chart is drawn.
    await expect(card(page, "Win streak").locator(".player-name").first()).toBeVisible();
    await expect(card(page, "Rating history").getByRole("img", { name: "Rating history" })).toBeVisible();
    for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
      await checkStatsPage(page, size);
    }
  }
});

/**
 * Three players: four games of all three won by the Liberals, two of Ann and Cy won by the
 * Fascists, and two of Ann, Bo and a CPU seat won by the Liberals.
 */
const T0 = Date.UTC(2026, 10, 1, 20, 0);
const LLF = ["LIBERAL", "LIBERAL", "FASCIST"] as const;
const FILTERED: StatsData = {
  players: [
    { number: 1, name: "Ann" },
    { number: 2, name: "Bo" },
    { number: 3, name: "Cy" },
  ],
  games: [
    ...[0, 1, 2, 3].map((i) => game(`all${i}`, T0 + i * H, seatsOf([1, 2, 3], [...LLF]), "LIBERAL")),
    ...[4, 5].map((i) => game(`ac${i}`, T0 + i * H, seatsOf([1, 3], ["LIBERAL", "FASCIST"]), "FASCIST")),
    ...[6, 7].map((i) => game(`cpu${i}`, T0 + i * H, seatsOf([1, 2, null], [...LLF]), "LIBERAL")),
  ],
};

test("the numbers follow the filter and the toggle", async ({ page }) => {
  test.slow();
  const gamesPlayed = card(page, "Games played");
  /** On phones, opens the filter's panel from its line. */
  const openPanel = async () => {
    if (!(await phoneLayout(page))) return;
    const summary = page.locator(".filter-summary");
    if ((await summary.getAttribute("aria-expanded")) !== "true") await summary.click();
    await expect(page.locator(".filter-panel")).toBeVisible();
  };
  for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
    const at = `at ${size.width}x${size.height}`;
    await page.setViewportSize(size);
    await open(page, FILTERED, "/stats");
    await expect.poll(() => rows(gamesPlayed), at).toEqual([
      ["1.", "Ann", "6", ""],
      ["1.", "Cy", "6", ""],
      ["3.", "Bo", "4", ""],
    ]);

    await openPanel();
    await page.getByRole("switch", { name: "Include games with Bots" }).click();
    await expect(page, at).toHaveURL(/\/stats\?cpu=1$/);
    await expect.poll(() => rows(gamesPlayed), at).toEqual([
      ["1.", "Ann", "8", ""],
      ["2.", "Bo", "6", ""],
      ["2.", "Cy", "6", ""],
    ]);

    await openPanel();
    await page.getByRole("group", { name: "Players" }).getByRole("button", { name: "Bo", exact: true }).click();
    await expect(page, at).toHaveURL(/\/stats\?players=1,3&cpu=1$/);
    await expect.poll(() => rows(gamesPlayed), at).toEqual([
      ["1.", "Ann", "2", ""],
      ["1.", "Cy", "2", ""],
    ]);
    await expect(card(page, "Liberal / Fascist wins"), at).toContainText("0 / 2");

    // Review Focus 3: back follows the address, and so does every number.
    await page.goBack();
    await expect(page, at).toHaveURL(/\/stats\?cpu=1$/);
    await expect.poll(async () => (await rows(gamesPlayed))[0], at).toEqual(["1.", "Ann", "8", ""]);
    await expect(card(page, "Liberal / Fascist wins"), at).toContainText("6 / 2");

    // A fresh load of the filtered address.
    await page.goto("/stats?players=1,3&cpu=1");
    await expect(page.getByRole("region", { name: "At a glance" })).toBeVisible();
    await expect.poll(async () => (await rows(gamesPlayed))[0], at).toEqual(["1.", "Ann", "2", ""]);
  }
});

/** A rating's details: a change and the rating after it, or a game the player missed. */
const DETAIL = /^([+−]\d+|0) → \d+$|^Did not play · \d+$/;

test("the rating history shows a game's change on hover or tap", async ({ page }) => {
  test.slow();
  const data = bigStatsData();
  await twoDaysOn(page, data);
  const chart = card(page, "Rating history").getByRole("img", { name: "Rating history" });
  const tooltip = page.locator(".chart-tooltip");
  const touch = test.info().project.name.startsWith("phone");
  /** Points at `x`, `y` in the chart: a tap on a phone, a hover (or a click at the edge) on a desktop. */
  const pointAt = async (x: number, y: number, press = false) => {
    if (touch) await chart.tap({ position: { x, y } });
    else if (press) await chart.click({ position: { x, y } });
    else await chart.hover({ position: { x, y } });
  };

  for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
    const at = `at ${size.width}x${size.height}`;
    await page.setViewportSize(size);
    await open(page, data, "/stats");
    await chart.scrollIntoViewIfNeeded();
    await expect(tooltip, at).toBeHidden();
    const box = (await chart.boundingBox())!;
    await pointAt(box.width / 2, box.height / 2);
    await expect(tooltip, at).toBeVisible();
    const lines = await tooltip.locator(":scope > div").allTextContents();
    expect(lines, at).toHaveLength(3);
    expect(lines[2], at).toMatch(DETAIL);
    expect(lines[1], at).toMatch(/ · (Liberals|Fascists) win · /);
  }

  // Review Focus 5: the rightmost point's details at 320px push nothing past the page's edge.
  await page.setViewportSize(NARROW_PHONE);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await chart.scrollIntoViewIfNeeded();
  const narrow = (await chart.boundingBox())!;
  await pointAt(narrow.width - 2, narrow.height / 2, true);
  await expect(tooltip).toBeVisible();
  expect((await tooltip.locator(":scope > div").allTextContents())[2]).toMatch(DETAIL);
  await checkStatsPage(page, NARROW_PHONE);
});
