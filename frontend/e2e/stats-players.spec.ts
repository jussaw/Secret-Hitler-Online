import { expect, test, type Page } from "@playwright/test";
import type { StatsData } from "../src/stats/record";
import { routePath } from "../src/stats/routes";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, statsSizesFor, stubStats } from "./stats";

/**
 * PLAYERS and a player's page (Phase 22B): both fit every stats size, both have the CPU switch
 * alone (PLAYERS ignores a player filter in its address, and has its search box left of the
 * switch, #100), PLAYERS' search narrows its rows and its heads sort them, a name in GAMES opens its
 * player's page, "All N games" opens GAMES filtered to the player, and the player page's CPU
 * switch counts the CPU games its header said were left out.
 */

const data = bigStatsData();

/** The player in the most of the data's games (the lowest number of a tie). */
function busiestPlayer(stats: StatsData): number {
  const games = new Map<number, number>();
  for (const game of stats.games) {
    for (const seat of game.seats) {
      if (seat.player !== null && !seat.cpu) games.set(seat.player, (games.get(seat.player) ?? 0) + 1);
    }
  }
  return Array.from(games.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

const busiest = busiestPlayer(data);
const busiestName = data.players.find((p) => p.number === busiest)!.name;

/** Opens `path` with the big response stubbed, once its first card shows, and settles the page. */
async function open(page: Page, path: string): Promise<void> {
  await stubStats(page, data);
  await page.goto(path);
  await expect(page.locator(".stats-main .stats-card").first()).toBeVisible();
  await settle(page);
}

/** Checks the open page at every size its project checks. */
async function checkEverySize(page: Page): Promise<void> {
  for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
    await checkStatsPage(page, size);
  }
}

test("PLAYERS fits every stats size", async ({ page }) => {
  test.slow();
  for (const path of [routePath({ page: "players" }), `${routePath({ page: "players" })}?cpu=1`]) {
    await open(page, path);
    await expect(page.getByRole("region", { name: "Players" }).locator("tbody tr")).toHaveCount(data.players.length);
    await checkEverySize(page);
  }
});

test("PLAYERS has the CPU switch alone and ignores a player filter", async ({ page }) => {
  await open(page, `${routePath({ page: "players" })}?players=2,3`);
  await expect(page.getByRole("region", { name: "Players" }).locator("tbody tr")).toHaveCount(data.players.length);
  await expect(page.locator(".filter-chip, .filter-summary")).toHaveCount(0);
  await page.getByRole("switch", { name: "Include games with Bots" }).click();
  await expect(page).toHaveURL(/\/players\?cpu=1$/);
  await expect(page.getByRole("region", { name: "Players" }).locator("tbody tr")).toHaveCount(data.players.length);
});

/** PLAYERS' search box, its table and the names down it. */
const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search players" });
const playersTable = (page: Page) => page.getByRole("region", { name: "Players" }).locator("table");
const shownNames = (page: Page) => playersTable(page).locator("tbody tr a.player-link").allTextContents();

/** The numbers down one column of PLAYERS' table (1 Games, 2 Win rate, 3 Elo), `null` for "— (N)". */
async function columnNumbers(page: Page, column: number): Promise<(number | null)[]> {
  const texts = await playersTable(page).locator(`tbody tr td:nth-child(${column + 1})`).allTextContents();
  return texts.map((text) => (text.startsWith("—") ? null : Number(text.replace("%", ""))));
}

/** The game's phone-only query, which puts PLAYERS' search box on a line of its own on a phone. */
const PHONE_ONLY =
  "((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))";

test("PLAYERS' search box stands left of the switch, above it on a phone", async ({ page }) => {
  test.slow();
  await open(page, routePath({ page: "players" }));
  for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
    await page.setViewportSize(size);
    const phone = await page.evaluate((query) => matchMedia(query).matches, PHONE_ONLY);
    const box = (await searchBox(page).boundingBox())!;
    const toggle = (await page.getByRole("switch", { name: "Include games with Bots" }).boundingBox())!;
    const bar = (await page.locator(".filter-bar").boundingBox())!;
    const at = `${size.width}x${size.height}`;
    for (const [name, r] of [["box", box], ["switch", toggle]] as const) {
      expect(r.y, `${name} inside the bar at ${at}`).toBeGreaterThanOrEqual(bar.y);
      expect(r.y + r.height, `${name} inside the bar at ${at}`).toBeLessThanOrEqual(bar.y + bar.height);
    }
    if (phone) {
      expect(box.y + box.height, `the box above the switch at ${at}`).toBeLessThanOrEqual(toggle.y);
    } else {
      expect(box.x + box.width, `the box left of the switch at ${at}`).toBeLessThanOrEqual(toggle.x);
      expect(Math.abs(box.y - toggle.y), `the box's top in line with the switch's at ${at}`).toBeLessThan(1);
    }
  }
});

test("typing in PLAYERS' search box narrows the rows, ignoring case", async ({ page }) => {
  await open(page, routePath({ page: "players" }));
  const third = data.players[2].name;
  await searchBox(page).fill(third.toLowerCase());
  await expect.poll(() => shownNames(page)).toEqual([third]);
  await searchBox(page).fill("1");
  await expect.poll(() => shownNames(page)).toEqual(data.players.map((p) => p.name).filter((name) => name.includes("1")).sort());
  await searchBox(page).fill("zz");
  await expect(page.getByRole("region", { name: "Players" })).toContainText("No players match “zz”.");
  await expect(playersTable(page)).toHaveCount(0);
  await searchBox(page).fill("");
  await expect(playersTable(page).locator("tbody tr")).toHaveCount(data.players.length);
  await expect(page).toHaveURL(/\/players$/);
});

test("a press on a PLAYERS head sorts the rows, and a second turns them round", async ({ page }) => {
  await open(page, routePath({ page: "players" }));
  const games = page.getByRole("columnheader", { name: "Games" });
  await games.getByRole("button").click();
  await expect(games).toHaveAttribute("aria-sort", "descending");
  const most = await columnNumbers(page, 1);
  expect(most, "most games first").toEqual([...most].sort((a, b) => b! - a!));
  await games.getByRole("button").click();
  await expect(games).toHaveAttribute("aria-sort", "ascending");
  const fewest = await columnNumbers(page, 1);
  expect(fewest, "fewest games first").toEqual([...most].sort((a, b) => a! - b!));
  await expect(page.getByRole("columnheader", { name: "Player" })).not.toHaveAttribute("aria-sort", /./);
});

test("PLAYERS with a search typed and a column sorted fits every stats size", async ({ page }) => {
  test.slow();
  await open(page, routePath({ page: "players" }));
  await searchBox(page).fill("1");
  await page.getByRole("columnheader", { name: "Elo" }).getByRole("button").click();
  await expect(page.getByRole("columnheader", { name: "Elo" })).toHaveAttribute("aria-sort", "descending");
  await expect(playersTable(page).locator("tbody tr")).toHaveCount(2);
  await checkEverySize(page);
});

test("a player page fits every stats size", async ({ page }) => {
  test.slow();
  await open(page, routePath({ page: "player", number: busiest }));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(busiestName);
  expect(await page.locator(".player-trophies .trophy-badge").count(), "trophies shown").toBeGreaterThan(0);
  await checkEverySize(page);
});

test("a name in GAMES opens its player page", async ({ page }) => {
  await open(page, routePath({ page: "games" }));
  const name = page.locator(".games-row").first().locator("a.player-link").first();
  const text = (await name.textContent())!.trim();
  await name.click();
  await expect(page).toHaveURL(/\/players\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(text);
  await expect(page.getByRole("region", { name: "Latest games" })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("All N games opens GAMES filtered to the player", async ({ page }) => {
  await open(page, routePath({ page: "player", number: busiest }));
  const all = page.getByRole("region", { name: "Latest games" }).getByRole("link", { name: /^All \d+ games$/ });
  // As drawn: a space between "games" and the arrow (a 44px link is a flex box, whose items drop a
  // space at their edges).
  const gap = await all.evaluate((link) => {
    const arrow = link.querySelector('[aria-hidden="true"]')!;
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    let words: Text | null = null;
    for (let node = walker.nextNode(); node && !arrow.contains(node); node = walker.nextNode()) {
      if ((node.nodeValue ?? "").trim() !== "") words = node as Text;
    }
    const range = document.createRange();
    range.setStart(words!, 0);
    range.setEnd(words!, words!.nodeValue!.trimEnd().length);
    return arrow.getBoundingClientRect().left - range.getBoundingClientRect().right;
  });
  expect(gap, "the space before the arrow, in px").toBeGreaterThan(2);
  await all.click();
  await expect(page).toHaveURL(new RegExp(`/games\\?players=${busiest}$`));
  const rows = page.locator(".games-row");
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i).locator(".games-row-seats"), `row ${i + 1}`).toContainText(busiestName);
  }
});

test("the player page's CPU switch counts CPU games", async ({ page }) => {
  await open(page, routePath({ page: "player", number: busiest }));
  const line = page.locator(".player-summary");
  await expect(line).toContainText(/ · \+\d+ with Bots, not counted · /);
  const before = Number((await line.textContent())!.match(/^(\d+) games/)![1]);
  await page.getByRole("switch", { name: "Include games with Bots" }).click();
  await expect(page).toHaveURL(/[?&]cpu=1$/);
  await expect(line).not.toContainText("with Bots");
  const after = Number((await line.textContent())!.match(/^(\d+) games/)![1]);
  expect(after, "the CPU games now counted").toBeGreaterThan(before);
});

test("an unknown player fits every stats size", async ({ page }) => {
  test.slow();
  await open(page, routePath({ page: "player", number: 99 }));
  await expect(page.getByText("This player was not found.")).toBeVisible();
  await expect(page.getByRole("link", { name: "All players" })).toHaveAttribute("href", routePath({ page: "players" }));
  await checkEverySize(page);
});
