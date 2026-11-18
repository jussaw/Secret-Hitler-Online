import { expect, test, type Locator, type Page } from "@playwright/test";
import { routePath, type TabId } from "../src/stats/routes";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, stubStats } from "./stats";

/**
 * The sortable tables in the browser (#109): a ranked card's heads sort its rows while every rank
 * stays its player's (on phones, where its count is a line under the name, its count head is gone),
 * the power ranking sorts by Elo, a best week by player, Enter and Space on a focused head sort it
 * with the focus kept there, a sorted card still fits a 320px phone, and at 320px every ranked
 * table fits inside its card.
 */

const data = bigStatsData();

/** The game's phone-only query (GameScreen.css), where a ranked card's count goes under the name. */
const PHONE_ONLY =
  "((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))";

/** Opens `path` with the big response stubbed and the clock an hour after its last game ends. */
async function open(page: Page, path: string): Promise<void> {
  await stubStats(page, data);
  const latest = data.games.reduce((most, game) => Math.max(most, game.endedAt), 0);
  await page.clock.setFixedTime(latest + 3_600_000);
  await page.goto(path);
  await expect(page.locator(".stats-main .stats-card").first()).toBeVisible();
  await settle(page);
}

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const head = (table: Locator, name: string) => table.getByRole("columnheader", { name, exact: true });
const headButton = (table: Locator, name: string) => head(table, name).getByRole("button");
const phoneLayout = (page: Page) => page.evaluate((query) => matchMedia(query).matches, PHONE_ONLY);

/** The body's cells of `cell`'s class, as numbers ("—" as null). */
function numbers(table: Locator, cell: string): Promise<(number | null)[]> {
  return table
    .locator(`tbody td.${cell}`)
    .evaluateAll((tds) =>
      tds.map((td) => {
        const text = (td.textContent ?? "").trim().replace("−", "-");
        return text === "—" ? null : parseFloat(text);
      })
    );
}

/** Each body row's player number and rank text ("3."), in the rows' order. */
function ranks(table: Locator): Promise<[string, string][]> {
  return table.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr): [string, string] => [
      tr.querySelector(".player-name")?.getAttribute("data-player") ?? "",
      (tr.querySelector("td.ranked-rank")?.textContent ?? "").trim(),
    ])
  );
}

/** The body's names, in the rows' order. */
function names(table: Locator): Promise<string[]> {
  return table.locator("tbody .ranked-name .player-name").evaluateAll((all) => all.map((el) => (el.textContent ?? "").trim()));
}

/** Names A to Z, as the Player head sorts them. */
const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

function nonIncreasing(values: (number | null)[]): boolean {
  return values.every((value, i) => i === 0 || (values[i - 1] as number) >= (value as number));
}

function nonDecreasing(values: (number | null)[]): boolean {
  return values.every((value, i) => i === 0 || (values[i - 1] as number) <= (value as number));
}

test("a ranked card's heads sort it and its ranks stay", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "overview" }));
  const table = card(page, "Win rate").locator("table.ranked-table");
  await expect(head(table, "Rank")).toHaveAttribute("aria-sort", "ascending");
  const opening = await ranks(table);
  expect(opening.length, "rows").toBeGreaterThan(1);
  const rankOf = new Map(opening);
  const ranksStay = async () => {
    for (const [player, rank] of await ranks(table)) expect(rank, `player ${player}'s rank`).toBe(rankOf.get(player));
  };

  const phone = await phoneLayout(page);
  if (phone) {
    // On a phone the count is a line under each name, in place of its column and head (as PLAYERS'
    // Last played), so sorting by it is a desktop thing: the press here is on Player.
    // Hidden, not removed: CSS locators, as a display: none cell is in no role query.
    const countHead = table.locator("thead th.ranked-count");
    await expect(countHead).toHaveCount(1);
    await expect(countHead).toHaveText("Games");
    await expect(countHead).toBeHidden();
    const countCells = table.locator("tbody td.ranked-count");
    await expect(countCells).toHaveCount(opening.length);
    for (const cell of await countCells.all()) await expect(cell).toBeHidden();
    const lines = table.locator("tbody .ranked-count-under");
    await expect(lines).toHaveCount(opening.length);
    for (const line of await lines.all()) await expect(line).toBeVisible();
    for (const line of await lines.allTextContents()) expect(line).toMatch(/^\d+ games?$/);

    await headButton(table, "Player").click();
    await expect(head(table, "Player")).toHaveAttribute("aria-sort", "ascending");
    const aToZ = await names(table);
    expect(aToZ, "names A to Z").toEqual([...aToZ].sort(byName));
    await ranksStay();
    await headButton(table, "Player").click();
    await expect(head(table, "Player")).toHaveAttribute("aria-sort", "descending");
    expect(await names(table), "names Z to A").toEqual([...aToZ].reverse());
    await ranksStay();
  } else {
    // The count's line under the name is there, and hidden: the count has its column here.
    const lines = table.locator("tbody .ranked-count-under");
    await expect(lines).toHaveCount(opening.length);
    for (const line of await lines.all()) await expect(line).toBeHidden();
    await headButton(table, "Games").click();
    await expect(head(table, "Games")).toHaveAttribute("aria-sort", "descending");
    await expect(head(table, "Rank")).not.toHaveAttribute("aria-sort", /./);
    const most = await numbers(table, "ranked-count");
    expect(most.every((count) => count !== null), "every count shown").toBe(true);
    expect(nonIncreasing(most), `most games first: ${most.join(", ")}`).toBe(true);
    await ranksStay();

    await headButton(table, "Games").click();
    await expect(head(table, "Games")).toHaveAttribute("aria-sort", "ascending");
    const fewest = await numbers(table, "ranked-count");
    expect(nonDecreasing(fewest), `fewest games first: ${fewest.join(", ")}`).toBe(true);
    await ranksStay();
  }

  await headButton(table, "Rank").click();
  await expect(head(table, "Rank")).toHaveAttribute("aria-sort", "ascending");
  // The pressed head gives up its mark (a hidden head is in no role query, so only on desktop Games).
  await expect(head(table, phone ? "Player" : "Games")).not.toHaveAttribute("aria-sort", /./);
  expect(await ranks(table), "the opening order").toEqual(opening);
});

test("the power ranking sorts by Elo", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "overview" }));
  const table = card(page, "Power ranking").locator("table.power-ranking");
  await headButton(table, "Elo").click();
  await expect(head(table, "Elo")).toHaveAttribute("aria-sort", "descending");
  const elo = await numbers(table, "ranked-value");
  expect(elo.length, "rows").toBeGreaterThan(1);
  expect(elo.every((rating) => rating !== null), "every rating shown").toBe(true);
  expect(nonIncreasing(elo), `highest Elo first: ${elo.join(", ")}`).toBe(true);
});

test("a best week sorts by player", async ({ page }) => {
  await open(page, routePath({ page: "tab", tab: "records" }));
  const table = card(page, "Most wins in a week").locator("table.ranked-table");
  await headButton(table, "Player").click();
  await expect(head(table, "Player")).toHaveAttribute("aria-sort", "ascending");
  const shown = await names(table);
  expect(shown.length, "rows").toBeGreaterThan(1);
  expect(shown, "names A to Z").toEqual([...shown].sort(byName));
});

test("Enter and Space on a focused head sort it", async ({ page }) => {
  const project = test.info().project.name;
  test.skip(project !== "desktop" && project !== "firefox", "a keyboard's matter");
  await open(page, routePath({ page: "tab", tab: "overview" }));
  const table = card(page, "Win rate").locator("table.ranked-table");
  const games = headButton(table, "Games");
  // From the card's first head, Tab along its heads to Games (Player and Win rate come first).
  await headButton(table, "Rank").focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await expect(games).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(head(table, "Games")).toHaveAttribute("aria-sort", "descending");
  await expect(games).toBeFocused();
  await page.keyboard.press("Space");
  await expect(head(table, "Games")).toHaveAttribute("aria-sort", "ascending");
  await expect(games).toBeFocused();
});

test("a sorted ranked card still fits", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-360", "the narrowest phone, once");
  await page.setViewportSize(NARROW_PHONE);
  await open(page, routePath({ page: "tab", tab: "overview" }));
  // Its count column gives way to the line under the name on a phone, so it sorts by its value.
  const table = card(page, "Win rate").locator("table.ranked-table");
  await headButton(table, "Win rate").click();
  await expect(head(table, "Win rate")).toHaveAttribute("aria-sort", "descending");
  await checkStatsPage(page, NARROW_PHONE);
});

/** Every page with ranked tables (`table.ranked-table`): the tabs that have them and PLAYERS, each
 *  with and without CPU games. */
const RANKED_TABS: TabId[] = ["overview", "roles", "votes", "activity", "records"];
const RANKED_PAGES: string[] = [...RANKED_TABS.map((tab) => routePath({ page: "tab", tab })), routePath({ page: "players" })].flatMap(
  (path) => [path, `${path}?cpu=1`]
);

/**
 * Every shown ranked table on the page that is not inside its nearest card's content box (padding
 * and border taken off), with 1px of slack as `statsPageProblems` allows, as `title: [left, right]
 * outside [left, right]`. A table that sits in a scroll region of its own by design (the power
 * ranking) is measured by its region, which must not scroll either. Also how many it checked.
 */
function rankedTableProblems(page: Page): Promise<{ checked: number; problems: string[] }> {
  return page.evaluate(() => {
    const out: string[] = [];
    let checked = 0;
    for (const table of Array.from(document.querySelectorAll("table.ranked-table"))) {
      const card = table.closest(".stats-card");
      if (!card || table.getBoundingClientRect().width === 0) continue;
      checked++;
      const title = (card.querySelector("h3")?.textContent ?? "?").trim();
      const region = table.closest(".scroll-region");
      const box = region ?? table;
      const style = getComputedStyle(card);
      const edges = card.getBoundingClientRect();
      const left = edges.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const right = edges.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      const r = box.getBoundingClientRect();
      if (r.left < left - 1 || r.right > right + 1) {
        out.push(`${title}: [${r.left.toFixed(1)}, ${r.right.toFixed(1)}] outside [${left.toFixed(1)}, ${right.toFixed(1)}]`);
      }
      if (region && region.scrollWidth > region.clientWidth) {
        out.push(`${title}: its region scrolls, ${region.scrollWidth} of ${region.clientWidth}`);
      }
    }
    return { checked, problems: out };
  });
}

test("every ranked table fits inside its card at 320px", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-360", "the narrowest phone, once");
  test.slow();
  const sizes = [NARROW_PHONE];
  const problems: string[] = [];
  for (const path of RANKED_PAGES) {
    await page.setViewportSize(sizes[0]);
    await open(page, path);
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const found = await rankedTableProblems(page);
      const at = `${path} at ${size.width}x${size.height}`;
      expect(found.checked, `ranked tables on ${at}`).toBeGreaterThan(0);
      problems.push(...found.problems.map((problem) => `${at}: ${problem}`));
    }
  }
  expect(problems, "ranked tables outside their cards").toEqual([]);
});
