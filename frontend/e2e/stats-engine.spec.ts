import { expect, test, type Locator, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { game, seatsOf } from "../src/stats/testGames";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, statsSizesFor, stubStats } from "./stats";

/** The stats engine in the browser: the filter, the CPU toggle and the tab row, at every size. */

/** A `GET /api/stats/games` response (this spec imports only `./stats`, `./lobby`, `./layout` and `testGames`). */
type StatsData = ReturnType<typeof bigStatsData>;

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
const cpuSwitch = (page: Page) => page.getByRole("switch", { name: "Include games with Bots", includeHidden: true });

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
      await expect(page.getByRole("switch", { name: "Include games with Bots" })).toBeVisible();
      await summary(page).click();
      await expect(page.getByRole("group", { name: "Players" })).toBeHidden();
    } else {
      await expect(summary(page)).toBeHidden();
      await expect(page.getByRole("group", { name: "Players" })).toBeVisible();
      await expect(page.getByRole("switch", { name: "Include games with Bots" })).toBeVisible();
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

test("every flex and grid child with text can shrink", async ({ page }) => {
  // "Names never overflow": a flex or grid item's min-width is auto unless set, which lets a long
  // name widen its row instead of wrapping in it.
  await open(page, bigStatsData(), "/stats");
  const sizes = test.info().project.name === "phone-360" ? [page.viewportSize()!, NARROW_PHONE] : [page.viewportSize()!];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await openPanel(page);
    const stuck = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".stats-main *"))
        .filter((el) => {
          const parent = el.parentElement;
          if (!parent || (el.textContent ?? "").trim() === "") return false;
          const display = getComputedStyle(parent).display;
          return /flex|grid/.test(display) && getComputedStyle(el).minWidth === "auto";
        })
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
    );
    expect(stuck, `at ${size.width}x${size.height}`).toEqual([]);
  }
});

test("the grey controls share one look", async ({ page }) => {
  // The lobby's grey (App.css's button look): chips, the CPU switch, the phone's line and the tabs
  // not shown, with one hover and focus look for all of them.
  await open(page, SMALL, "/stats");
  const face = (control: Locator) =>
    control.evaluate((el) => getComputedStyle(el).getPropertyValue("--button-face").trim().toLowerCase());
  // On phones the line first, before a tap leaves it hovered, as a phone does with any tapped button.
  if (await phoneLayout(page)) expect(await face(summary(page)), "the line at rest").toBe("#6e655e");
  await openPanel(page);
  const controls = [chip(page, "Ann"), cpuSwitch(page), tabRow(page).getByRole("link", { name: "RIVALS", exact: true })];
  const desktop = !test.info().project.name.startsWith("phone");
  for (const control of controls) {
    if (desktop) await page.mouse.move(0, 0);
    expect(await face(control), `${await control.textContent()} at rest`).toBe("#6e655e");
    if (!desktop) continue;
    await control.hover();
    expect(await face(control), `${await control.textContent()} under the pointer`).toBe("#857b73");
  }
  if (!desktop) return;

  // A click leaves no hover face behind once the pointer has gone.
  await cpuSwitch(page).click();
  await page.mouse.move(0, 0);
  expect(await face(cpuSwitch(page))).toBe("#6e655e");
  // The keyboard's focus shows the hover face and an outline.
  await page.keyboard.press("Shift+Tab");
  const focused = chip(page, "Cy");
  await expect(focused).toBeFocused();
  expect(await face(focused)).toBe("#857b73");
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const tab = tabRow(page).getByRole("link", { name: "ROLES & CARDS", exact: true });
  await page.keyboard.press("Tab");
  await expect(tab).toBeFocused();
  expect(await face(tab)).toBe("#857b73");
  expect(await tab.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");

  // A chip turned off keeps its darker face, focused by the click or under the pointer.
  await chip(page, "Bo").click();
  await expect(chip(page, "Bo")).toHaveAttribute("aria-pressed", "false");
  expect(await face(chip(page, "Bo")), "off, under the pointer").toBe("#564e48");
  await page.mouse.move(0, 0);
  expect(await face(chip(page, "Bo")), "off, focused by the click").toBe("#463f3a");
});
