import { expect, test, type Locator, type Page } from "@playwright/test";
import type { StatsData } from "../src/stats/record";
import { makeRecord, makeSeats } from "../src/stats/testRecords";
import { wrappedLabels } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, statsSizesFor, stubStats } from "./stats";

/**
 * ACTIVITY in the browser: the tab fits at every stats size, its charts show the value under the
 * pointer or a tap, the week and month switch redraws its charts, and its dates are the
 * browser's time zone's.
 */

const desktopOnly = () => test.skip(test.info().project.name !== "desktop", "one browser is enough");
const onPhone = () => test.info().project.name.startsWith("phone");

/** Stubs `data` and fixes the clock an hour after its latest game ended. */
async function stubAt(page: Page, data: StatsData): Promise<void> {
  await stubStats(page, data);
  const latest = data.games.reduce((most, game) => Math.max(most, game.endedAt), 0);
  await page.clock.setFixedTime(latest + 3_600_000);
}

/** Goes to `path` (the response already stubbed) and waits for the tab. */
async function show(page: Page, path = "/stats/activity"): Promise<void> {
  await page.goto(path);
  await expect(page.locator(".activity-tab")).toBeVisible();
  await settle(page);
}

/** Opens ACTIVITY with `data` stubbed and the clock an hour after its latest game ended. */
async function open(page: Page, data: StatsData = bigStatsData()): Promise<void> {
  await stubAt(page, data);
  await show(page);
}

/**
 * Each chart whose image reaches outside the chart's own box, or whose box reaches outside its
 * card's cell, as `<card> [left, right] in [left, right]` (0.5px of slack).
 */
function chartsOutside(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const within = (inner: DOMRect, outer: DOMRect) => inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
    const span = (r: DOMRect) => `[${Math.round(r.left)}, ${Math.round(r.right)}]`;
    for (const chart of Array.from(document.querySelectorAll(".bar-chart, .calendar-heatmap"))) {
      const cell = chart.closest("[data-card]");
      const slug = cell?.getAttribute("data-card") ?? "?";
      const box = chart.getBoundingClientRect();
      const svg = chart.querySelector("svg")!.getBoundingClientRect();
      if (!within(svg, box)) out.push(`${slug} ${span(svg)} in ${span(box)}`);
      if (cell && !within(box, cell.getBoundingClientRect())) out.push(`${slug} ${span(box)} in ${span(cell.getBoundingClientRect())}`);
    }
    return out;
  });
}

test("ACTIVITY fits sideways at every stats size, with 44px targets", async ({ page }) => {
  test.slow(); // the tab at every size, twice
  await stubAt(page, bigStatsData());
  // Without CPU games and with them, which make the counts larger.
  for (const path of ["/stats/activity", "/stats/activity?cpu=1"]) {
    await show(page, path);
    for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
      await checkStatsPage(page, size);
      const at = `${path} at ${size.width}x${size.height}`;
      expect(await chartsOutside(page), `charts outside their cards on ${at}`).toEqual([]);
      expect(await wrappedLabels(page, ".activity-tab"), `wrapped labels on ${at}`).toEqual([]);
      expect(await page.locator(".activity-tab svg").count(), `charts drawn on ${at}`).toBeGreaterThanOrEqual(6);
    }
  }
});

test("the charts show the value under the pointer or a tap", async ({ page }) => {
  await open(page);
  const point = async (target: Locator) => {
    await target.scrollIntoViewIfNeeded();
    if (onPhone()) await target.tap();
    else await target.hover();
  };

  await point(page.getByRole("img", { name: "Games by day of the week", exact: true }));
  await expect(page.locator('[data-card="day-of-week"] .chart-tooltip')).toHaveText(
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*: \d+ games?$/
  );

  await point(page.locator('[data-card="calendar"] rect.day[data-shade="4"]').first());
  await expect(page.locator('[data-card="calendar"] .chart-tooltip')).toHaveText(
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} \d{4}: \d+ games?$/
  );
});

test("the arrow keys move a chart's details", async ({ page }) => {
  desktopOnly();
  await open(page);
  const chart = page.getByRole("group", { name: "Games by day of the week", exact: true });
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await expect(chart.locator(".chart-tooltip")).toHaveText(/^Monday: \d+ games?$/);
  await page.keyboard.press("End");
  await expect(chart.locator(".chart-tooltip")).toHaveText(/^Sunday: \d+ games?$/);
  const outline = await chart.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe("solid");
});

test("PER MONTH redraws games over time, cumulative games and attendance", async ({ page }) => {
  desktopOnly();
  await open(page);
  await expect(page.getByRole("img", { name: "Games per week", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "PER MONTH" }).click();
  for (const name of ["Games per month", "Cumulative games per month", "Attendance per month"]) {
    await expect(page.getByRole("img", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: "Games per week", exact: true })).toHaveCount(0);
});

/** One counted five-player game across midnight UTC, from 23:30 on Friday 13 November 2026. */
function midnightGame(): StatsData {
  const startedAt = Date.parse("2026-11-13T23:30:00Z");
  const game = makeRecord({
    id: "midnight",
    startedAt,
    endedAt: Date.parse("2026-11-14T00:10:00Z"),
    seats: makeSeats(["LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "HITLER"], [1, 2, 3, 4, 5]),
  });
  return { players: [1, 2, 3, 4, 5].map((number) => ({ number, name: `P${number}` })), games: [game] };
}

for (const [timezoneId, day] of [
  ["Pacific/Auckland", "Sat 14 Nov 2026"],
  ["America/Los_Angeles", "Fri 13 Nov 2026"],
]) {
  test.describe(`in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test(`the busiest day is ${day}`, async ({ page }) => {
      desktopOnly();
      await open(page, midnightGame());
      await expect(page.locator('[data-card="busiest-times"]')).toContainText(`Busiest day: ${day} · 1 game`);
    });
  });
}
