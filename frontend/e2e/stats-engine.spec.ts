import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import type { StatsData } from "../src/stats/record";
import { game, seatsOf } from "../src/stats/testGames";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, statsSizesFor, stubStats } from "./stats";

/** The stats engine in the browser: the filter, the CPU toggle and the tab row, at every size. */

/** The game's phone-only query (GameScreen.css), where the filter folds and the tab row scrolls. */
const PHONE_ONLY =
  "((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))";

const T0 = Date.UTC(2026, 10, 1, 20, 0);
const H = 3_600_000;
/** Three players and a few games, every one with CPU seats. */
const SMALL: StatsData = {
  players: [
    { number: 1, name: "Ann" },
    { number: 2, name: "Bo" },
    { number: 3, name: "Cy" },
  ],
  games: [
    game("s1", T0, seatsOf([1, 2, 3, null, null]), "LIBERAL"),
    game("s2", T0 + H, seatsOf([1, 3, null, null, null]), "FASCIST"),
    game("s3", T0 + 2 * H, seatsOf([2, 3, 1, null, null]), "LIBERAL"),
  ],
};

const phoneLayout = (page: Page) => page.evaluate((query) => matchMedia(query).matches, PHONE_ONLY);
const tabRow = (page: Page) => page.getByRole("navigation", { name: "Stats sections" });
const summary = (page: Page) => page.locator(".filter-summary");
const chip = (page: Page, name: string) =>
  page.getByRole("group", { name: "Players", includeHidden: true }).getByRole("button", { name, exact: true, includeHidden: true });
const cpuSwitch = (page: Page) => page.getByRole("switch", { name: "Include games with CPU players", includeHidden: true });

/** Opens `path` with `data` stubbed and waits for the tab row. */
async function open(page: Page, data: StatsData, path: string): Promise<void> {
  await stubStats(page, data);
  await page.goto(path);
  await expect(tabRow(page)).toBeVisible();
  await settle(page);
}

/** On phones, opens the filter's panel from its line. */
async function openPanel(page: Page): Promise<void> {
  if (await phoneLayout(page)) {
    if ((await summary(page).getAttribute("aria-expanded")) !== "true") await summary(page).click();
    await expect(page.locator(".filter-panel")).toBeVisible();
  }
}

test("the tab row and the filter fit every stats size", async ({ page }) => {
  test.slow();
  const data = bigStatsData();
  for (const path of ["/stats", "/stats/roles?cpu=1"]) {
    await open(page, data, path);
    for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
      await checkStatsPage(page, size);
      if (!(await phoneLayout(page))) continue;
      const at = `${path} at ${size.width}x${size.height}`;

      // The tab row is one row that scrolls sideways.
      const row = await tabRow(page).evaluate((nav) => ({
        tops: Array.from(nav.querySelectorAll("a"), (a) => Math.round(a.getBoundingClientRect().top)),
        scrollWidth: nav.scrollWidth,
        clientWidth: nav.clientWidth,
      }));
      expect(row.tops, `the tabs on one row, ${at}`).toHaveLength(7);
      expect(new Set(row.tops).size, `the tabs on one row, ${at}`).toBe(1);
      expect(row.scrollWidth, `the tab row scrolls, ${at}`).toBeGreaterThan(row.clientWidth);

      // The open panel, ten twelve-character chips, still fits (Review Focus 5 at 320x568).
      await summary(page).click();
      await expect(page.locator(".filter-panel")).toBeVisible();
      await checkStatsPage(page, size);
      await summary(page).click();
      await expect(page.locator(".filter-panel")).toBeHidden();
    }
  }
});

test("the filter and the CPU toggle change the address", async ({ page }) => {
  await open(page, SMALL, "/stats");
  await openPanel(page);
  for (const name of ["Ann", "Bo", "Cy"]) await expect(chip(page, name)).toHaveAttribute("aria-pressed", "true");
  await expect(cpuSwitch(page)).toHaveAttribute("aria-checked", "false");

  await cpuSwitch(page).click();
  await expect(page).toHaveURL(/\/stats\?cpu=1$/);
  await expect(cpuSwitch(page)).toHaveAttribute("aria-checked", "true");

  await chip(page, "Bo").click();
  await expect(page).toHaveURL(/\/stats\?players=1,3&cpu=1$/);
  await expect(chip(page, "Bo")).toHaveAttribute("aria-pressed", "false");
  if (await phoneLayout(page)) await expect(summary(page)).toHaveText("Players: 2 of 3 · CPU on");

  // Review Focus 3: back follows the address.
  await page.goBack();
  await expect(page).toHaveURL(/\/stats\?cpu=1$/);
  await expect(chip(page, "Bo")).toHaveAttribute("aria-pressed", "true");
  await expect(cpuSwitch(page)).toHaveAttribute("aria-checked", "true");

  await page.goto("/stats?players=1,3&cpu=1");
  await expect(tabRow(page)).toBeVisible();
  await openPanel(page);
  await expect(chip(page, "Bo")).toHaveAttribute("aria-pressed", "false");
  await expect(chip(page, "Ann")).toHaveAttribute("aria-pressed", "true");
  await expect(cpuSwitch(page)).toHaveAttribute("aria-checked", "true");
});

test("the tabs keep the filter", async ({ page }) => {
  await open(page, SMALL, "/stats?players=1,3&cpu=1");
  const tab = (name: string) => tabRow(page).getByRole("link", { name, exact: true });

  await tab("ROLES & CARDS").click();
  await expect(page).toHaveURL(/\/stats\/roles\?players=1,3&cpu=1$/);
  await expect(tab("ROLES & CARDS")).toHaveAttribute("aria-current", "page");
  await expect(cpuSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(chip(page, "Bo")).toHaveAttribute("aria-pressed", "false");

  await tab("RECORDS").click(); // scrolled to on phones
  await expect(page).toHaveURL(/\/stats\/records\?players=1,3&cpu=1$/);
  await expect(tab("RECORDS")).toHaveAttribute("aria-current", "page");
  await expect(tab("RECORDS")).toBeInViewport();

  await tab("OVERVIEW").click();
  await expect(page).toHaveURL(/\/stats\?players=1,3&cpu=1$/);
  await expect(tab("OVERVIEW")).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await expect(page).toHaveURL(/\/stats\/records\?players=1,3&cpu=1$/);
  await expect(tab("RECORDS")).toHaveAttribute("aria-current", "page");
});

test("phones fold the filter into one line", async ({ page }) => {
  const project = test.info().project.name;
  await open(page, SMALL, "/stats");
  const sizes = project === "phone-360" ? [page.viewportSize()!, NARROW_PHONE] : [page.viewportSize()!];
  for (const size of sizes) {
    await page.setViewportSize(size);
    if (await phoneLayout(page)) {
      await expect(summary(page)).toBeVisible();
      await expect(summary(page)).toHaveText(/^Players: \d+ of \d+ · CPU (off|on)$/);
      await expect(page.getByRole("group", { name: "Players" })).toBeHidden();
      await summary(page).click();
      await expect(page.getByRole("group", { name: "Players" })).toBeVisible();
      await expect(page.getByRole("switch", { name: "Include games with CPU players" })).toBeVisible();
      await summary(page).click();
      await expect(page.getByRole("group", { name: "Players" })).toBeHidden();
    } else {
      await expect(summary(page)).toBeHidden();
      await expect(page.getByRole("group", { name: "Players" })).toBeVisible();
      await expect(page.getByRole("switch", { name: "Include games with CPU players" })).toBeVisible();
    }
  }
  if (project === "desktop" || project === "firefox") {
    // A desktop window shows the panel, and a phone-sized one folds it.
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(summary(page)).toBeVisible();
    await expect(page.getByRole("group", { name: "Players" })).toBeHidden();
  }
});

/** The charts' shared stylesheet, which a chart's tooltip and marks take their look from. */
const CHARTS_CSS = fileURLToPath(new URL("../src/stats/charts/charts.css", import.meta.url));
/** The game's colours and fonts, which every page loads before the charts' stylesheet. */
const VARIABLES_CSS = fileURLToPath(new URL("../src/variables.css", import.meta.url));

test("a chart's tooltip keeps its width at either edge", async ({ page }) => {
  // Review Focus 5: the rightmost point's details stay whole and inside the chart, as LineChart
  // and StackedBarChart place them (left at the point's share, moved back by as much).
  const tooltip = (id: string, share: number) =>
    `<div class="chart-tooltip" id="${id}" style="left: ${share}%; top: 100px; transform: translateX(-${share}%)">` +
    "<div>WWWWWWWWWW01</div><div>+19 \u00b7 1612</div></div>";
  await page.setContent(
    `<div class="chart" id="chart" style="width: 300px; height: 220px; margin: 0 10px">${tooltip("left", 0)}${tooltip(
      "middle",
      50
    )}${tooltip("right", 100)}</div>`
  );
  await page.addStyleTag({ path: VARIABLES_CSS });
  await page.addStyleTag({ path: CHARTS_CSS });
  const chart = (await page.locator("#chart").boundingBox())!;
  for (const id of ["left", "middle", "right"]) {
    const box = (await page.locator(`#${id}`).boundingBox())!;
    expect(box.width, `the ${id} tooltip's width`).toBeGreaterThan(120);
    expect(box.x, `the ${id} tooltip's left edge`).toBeGreaterThanOrEqual(chart.x - 0.5);
    expect(box.x + box.width, `the ${id} tooltip's right edge`).toBeLessThanOrEqual(chart.x + chart.width + 0.5);
    const lines = await page.locator(`#${id} > div`).evaluateAll((all) => all.map((line) => line.getClientRects().length));
    expect(lines, `the ${id} tooltip's lines each on one line`).toEqual([1, 1]);
  }
});

test("a chart's hovered bar is marked", async ({ page }) => {
  await page.setContent(
    '<div class="chart"><svg width="200" height="100"><rect class="chart-bar" id="still" width="20" height="40" fill="#5a9ba6" />' +
      '<rect class="chart-bar is-active" id="hovered" x="40" width="20" height="40" fill="#5a9ba6" /></svg></div>'
  );
  await page.addStyleTag({ path: VARIABLES_CSS });
  await page.addStyleTag({ path: CHARTS_CSS });
  const stroke = (id: string) =>
    page.locator(`#${id}`).evaluate((rect) => {
      const style = getComputedStyle(rect);
      return { stroke: style.stroke, width: parseFloat(style.strokeWidth) };
    });
  expect((await stroke("still")).stroke).toBe("none");
  const hovered = await stroke("hovered");
  expect(hovered.stroke).not.toBe("none");
  expect(hovered.width).toBeGreaterThanOrEqual(2);
});

test("a link to a tab shows that tab in the row", async ({ page }) => {
  await open(page, SMALL, "/stats/records?cpu=1");
  const boxes = await tabRow(page).evaluate((nav) => {
    const current = nav.querySelector('[aria-current="page"]')!.getBoundingClientRect();
    const row = nav.getBoundingClientRect();
    return { current: { left: current.left, right: current.right }, row: { left: row.left, right: row.right }, page: scrollY };
  });
  expect(boxes.current.left).toBeGreaterThanOrEqual(boxes.row.left - 0.5);
  expect(boxes.current.right).toBeLessThanOrEqual(boxes.row.right + 0.5);
  expect(boxes.page, "the page itself stays at the top").toBe(0);
});
