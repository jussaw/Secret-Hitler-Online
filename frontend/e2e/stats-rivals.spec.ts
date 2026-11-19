import { expect, test, type Page } from "@playwright/test";
import { routePath } from "../src/stats/routes";
import { MIN_TARGET } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, expectWholeTables, statsSizesFor, stubStats, type WholeTable } from "./stats";

/**
 * RIVALS and ENDINGS against the big response, at every stats size: the page never scrolls
 * sideways, the matrices and tables scroll inside their cards with the names held in view,
 * ENDINGS' two tables stay whole wherever they fitted before their heads sorted (#109), and on
 * phones every target and every table row is 44px. This spec imports only `./stats`, `./lobby`,
 * `./layout` and `routes.ts`, none of which reads the browser.
 */

const data = bigStatsData();
const isPhone = () => test.info().project.name.startsWith("phone");

const TABS = [
  { name: "RIVALS", path: routePath({ page: "tab", tab: "rivals" }), ready: "Opponents table", whole: [] as WholeTable[] },
  {
    name: "ENDINGS",
    path: routePath({ page: "tab", tab: "endings" }),
    ready: "How games are won",
    // Tables that fit their card without scrolling, at every size but those they scrolled at
    // before their heads sorted (#109).
    whole: [
      { region: "Liberal win rate by player count table", scrollsAt: ["820x1180", "800x700", "360x740", "412x915", "320x568"] },
      { region: "Game length table", scrollsAt: ["820x1180", "800x700", "360x740", "320x568"], phoneScrollsAt: ["412x915"] },
    ],
  },
];

/** Opens `path` with the big response stubbed, and waits for the region `ready` and the fonts. */
async function open(page: Page, path: string, ready: string): Promise<void> {
  await stubStats(page, data);
  await page.goto(path);
  await expect(page.getByRole("region", { name: ready })).toBeVisible();
  await settle(page);
}

/** Every `table.player-matrix` row shorter than MIN_TARGET, as `<region> row <n>: <height>px`. */
function shortRows(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = [];
    for (const table of Array.from(document.querySelectorAll("table.player-matrix"))) {
      const label = table.closest('[role="region"]')?.getAttribute("aria-label") ?? "table";
      Array.from(table.querySelectorAll("tr")).forEach((row, i) => {
        const height = row.getBoundingClientRect().height;
        if (height < min - 0.01) out.push(`${label} row ${i}: ${Math.round(height * 10) / 10}px`);
      });
    }
    return out;
  }, MIN_TARGET);
}

/**
 * Every element with text in the tab whose flex or grid parent leaves its min-width auto: such an
 * element lets a long name widen its row instead of wrapping in it ("Names never overflow").
 */
function stuckChildren(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".rivals-tab *, .endings-tab *"))
      .filter((el) => {
        const parent = el.parentElement;
        if (!parent || (el.textContent ?? "").trim() === "") return false;
        return /flex|grid/.test(getComputedStyle(parent).display) && getComputedStyle(el).minWidth === "auto";
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
  );
}

for (const tab of TABS) {
  test(`${tab.name} fits every stats size`, async ({ page }) => {
    test.slow();
    await open(page, tab.path, tab.ready);
    for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
      await checkStatsPage(page, size);
      const at = `${size.width}x${size.height}`;
      expect(await stuckChildren(page), `flex and grid children that cannot shrink at ${at}`).toEqual([]);
      if (isPhone()) expect(await shortRows(page), `rows under ${MIN_TARGET}px at ${at}`).toEqual([]);
      await expectWholeTables(page, tab.whole, size);
    }
  });
}

test("RIVALS' matrices scroll inside their cards", async ({ page }) => {
  test.skip(!isPhone(), "a phone's check: ten long names in a narrow card");
  test.slow();
  await open(page, TABS[0].path, TABS[0].ready);
  for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
    await page.setViewportSize(size);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    for (const label of ["Teammates table", "Opponents table", "Who trusts whom table"]) {
      const at = `${label} at ${size.width}x${size.height}`;
      const region = page.getByRole("region", { name: label });
      await region.scrollIntoViewIfNeeded();
      const result = await region.evaluate((el) => {
        const card = el.closest("section")!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const head = el.querySelector('th[scope="row"]')!;
        const name = () => head.getBoundingClientRect().left;
        const before = { left: box.left, right: box.right, card: { left: card.left, right: card.right } };
        const widths = { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
        const nameBefore = name();
        el.scrollLeft = el.scrollWidth;
        const nameWidth = head.getBoundingClientRect().width;
        const out = { ...before, ...widths, scrollLeft: el.scrollLeft, pageX: window.scrollX, nameBefore, nameAfter: name(), nameWidth };
        el.scrollLeft = 0;
        return out;
      });
      expect(result.left, `${at}: its left side in its card`).toBeGreaterThanOrEqual(result.card.left - 1);
      expect(result.right, `${at}: its right side in its card`).toBeLessThanOrEqual(result.card.right + 1);
      expect(result.scrollWidth, `${at}: wider than its box`).toBeGreaterThan(result.clientWidth);
      expect(result.scrollLeft, `${at}: scrolled`).toBeGreaterThan(0);
      expect(result.pageX, `${at}: the page did not scroll sideways`).toBe(0);
      expect(Math.abs(result.nameAfter - result.nameBefore), `${at}: the names held in view`).toBeLessThanOrEqual(1);
      expect(result.nameWidth, `${at}: the names leave room for the columns`).toBeLessThanOrEqual(result.clientWidth / 2);
    }
  }
});
