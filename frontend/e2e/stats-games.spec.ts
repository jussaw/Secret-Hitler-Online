import { expect, test, type Page } from "@playwright/test";
import { outcomeLabel } from "../src/stats/format";
import { parseStatsData, STATS_GAMES_PATH } from "../src/stats/record";
import { routePath } from "../src/stats/routes";
import { signedOutMe, stubMe } from "./accounts";
import { openTable, play } from "./driveGame";
import { FAKE_GAME_ID, openFakeGame, PROMPTS } from "./fakeGame";
import { MIN_TARGET, NARROW_PHONE, overlaps, type Box } from "./layout";
import { settle, watchLobby } from "./lobby";
import { bigStatsData, checkStatsPage, statsPageProblems, statsSizesFor, stubStats } from "./stats";

/** GAMES, every recorded game, and the links into the stats from the login page, the lobby and the victory screen. */

const data = bigStatsData();

const desktopOnly = () => test.skip(test.info().project.name !== "desktop", "one browser is enough");

test.describe("the links in", () => {
  test("the login page's header opens the stats in the same tab", async ({ page }) => {
    desktopOnly();
    await stubMe(page, signedOutMe({ discord: true }));
    await stubStats(page, data);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Site" });
    await expect(nav.getByRole("link", { name: "PLAY", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Stats" })).toHaveCount(0);
    const stats = nav.getByRole("link", { name: "STATS", exact: true });
    await expect(stats).not.toHaveAttribute("target");
    await stats.click();
    await expect(page).toHaveURL(routePath({ page: "tab", tab: "overview" }));
    await expect(nav.getByRole("link", { name: "STATS", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "OVERVIEW" })).toBeVisible();
  });

  test("the lobby links to the stats only from the victory screen", async ({ page }) => {
    desktopOnly();
    await openFakeGame(page);
    // The lobby keeps its own header (the title and the speaker), with no stats links.
    const header = page.locator(".lobby-screen > header");
    await expect(header).toHaveText(/^SECRET-HITLER/);
    await expect(header.locator(".sound-control")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Site" })).toHaveCount(0);
    await expect(page.locator(".lobby-footer")).toHaveText("About this project · Report a bug");
    await expect(page.getByRole("link", { name: /stats/i })).toHaveCount(0);
  });

  test("See this game sits on the victory screen", async ({ page, isMobile }) => {
    const game = await openFakeGame(page);
    const victory = PROMPTS.find((p) => p.name === "victory")!;
    victory.packets.forEach((packet) => game.send(packet));
    const alertBox = page.locator("#alert-box.appear-custom-alert");
    await alertBox.getByRole("button", { name: victory.button, exact: true }).waitFor({ timeout: 15_000 });
    const link = alertBox.getByRole("link", { name: "See this game" });
    await expect(link).toHaveAttribute("href", routePath({ page: "game", id: FAKE_GAME_ID }));
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const box = (await link.boundingBox())!;
    if (isMobile) {
      expect(box.width, "the link's width").toBeGreaterThanOrEqual(MIN_TARGET);
      expect(box.height, "the link's height").toBeGreaterThanOrEqual(MIN_TARGET);
    }
  });
});

test("GAMES' and PLAYERS' old addresses move to their new ones", async ({ page }) => {
  desktopOnly();
  await stubStats(page, data);
  const newest = data.games[data.games.length - 1];
  const nav = page.getByRole("navigation", { name: "Site" });
  const current = nav.locator('[aria-current="page"]');
  // Links to these are out there, from victory screens and shared addresses.
  for (const [from, to, mark] of [
    ["/stats/games?players=1&per=50", "/games?players=1&per=50", "GAMES"],
    [`/stats/games/${encodeURIComponent(newest.id)}`, routePath({ page: "game", id: newest.id }), "GAMES"],
    ["/stats/players", "/players", "PLAYERS"],
    ["/stats/players/1?cpu=1", "/players/1?cpu=1", "PLAYERS"],
  ]) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
    await expect(current, from).toHaveText(mark);
  }
  // The tabs stay under /stats.
  await page.goto("/stats/roles");
  await expect(page).toHaveURL("/stats/roles");
  await expect(current).toHaveText("STATS");
});

/** Opens `path` with the big response stubbed, waits for the summary line, and settles the page. */
async function openGames(page: Page, path: string): Promise<void> {
  await stubStats(page, data);
  await page.goto(path);
  await expect(page.locator(".games-summary")).toContainText("400 games recorded");
  await settle(page);
}

/** The ids of the rows shown, in order. */
const rowIds = (page: Page) =>
  page.locator(".games-row-link").evaluateAll((links) => links.map((a) => a.getAttribute("href")!.split("/").pop()!));

test.describe("GAMES fits every size", () => {
  for (const [name, path] of [
    ["a hundred to a page", "/games?per=100"],
    ["with every filter set", "/games?players=1,2,3&from=2025-10-01&to=2026-12-31&cpu=with"],
  ]) {
    test(`GAMES, ${name}, fits every size`, async ({ page }) => {
      test.slow();
      await openGames(page, path);
      await expect(page.locator(".games-row").first()).toBeVisible();
      if (name === "with every filter set") {
        await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(3);
        await expect(page.getByRole("link", { name: "Clear filters" })).toBeVisible();
      }
      for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
        await checkStatsPage(page, size);
      }
    });
  }
});

test("a game's tag names its bots' level, and an older one says Bots", async ({ page }) => {
  // big-400 to big-301, all format 2: every level, and link names that say it.
  await openGames(page, "/games?per=100");
  await expect(page.locator(".games-row").first()).toBeVisible();
  const tags = await page.locator(".games-row-cpu").allTextContents();
  expect([...new Set(tags)].sort()).toEqual(["Easy bots", "Hard bots", "Normal bots"]);
  const names = await page.locator("a.games-row-link").evaluateAll((links) => links.map((a) => a.getAttribute("aria-label") ?? ""));
  expect(names.some((name) => / · with (Easy|Normal|Hard) bots$/.test(name))).toBe(true);
  // big-200 to big-101, all format 1: no level was kept.
  await openGames(page, "/games?per=100&page=3");
  await expect(page.locator(".games-row").first()).toBeVisible();
  const older = await page.locator(".games-row-cpu").allTextContents();
  expect(older.length).toBeGreaterThan(0);
  expect([...new Set(older)]).toEqual(["Bots"]);
});

test("twelve-character names stay inside their columns at 320px", async ({ page }) => {
  test.slow();
  await page.setViewportSize(NARROW_PHONE);
  await openGames(page, "/games?per=100&players=1,2");
  const { rows, chips } = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      rows: Array.from(document.querySelectorAll(".games-row"), (row) => ({
        seats: box(row.querySelector(".games-row-seats")!),
        counts: box(row.querySelector(".games-row-counts")!),
        names: Array.from(row.querySelectorAll(".games-row-seats .player-name"), box),
      })),
      chips: Array.from(document.querySelectorAll(".games-chip"), (chip) => ({
        chip: box(chip),
        name: box(chip.querySelector(".player-name")!),
      })),
    };
  });
  expect(rows.length).toBeGreaterThan(20);
  expect(chips.length).toBe(2);
  const inside = (inner: Box, outer: Box, what: string) => {
    expect(inner.left, `${what}'s left edge`).toBeGreaterThanOrEqual(outer.left - 1);
    expect(inner.right, `${what}'s right edge`).toBeLessThanOrEqual(outer.right + 1);
  };
  for (const row of rows) {
    for (const name of row.names) {
      inside(name, row.seats, "a name");
      expect(overlaps(name, row.counts), "a name over the counts").toBe(false);
    }
  }
  for (const { chip, name } of chips) inside(name, chip, "a chip's name");
  expect((await statsPageProblems(page)).sideways).toEqual([]);
});

test("filters and pages through the address", async ({ page }) => {
  desktopOnly();
  const seats = page.getByRole("combobox", { name: "Seats" });
  const next = page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Next ›" });
  await openGames(page, "/games");

  await seats.selectOption({ label: "7 seats" });
  await expect(page).toHaveURL("/games?size=7");
  const sevenSeats = data.games.filter((g) => g.seats.length === 7).length;
  await expect(page.locator(".games-summary")).toHaveText(`400 games recorded · ${sevenSeats} match · showing 1–20`);

  // A new page brings the summary, and the list under it, back into view.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await next.click();
  await expect(page).toHaveURL("/games?size=7&page=2");
  await expect(page.locator(".games-summary")).toBeInViewport();
  const secondPage = await rowIds(page);
  expect(secondPage.length).toBe(20);

  // The row's link covers it: a press on its counts opens the game.
  const counts = (await page.locator(".games-row-counts").first().boundingBox())!;
  await page.mouse.click(counts.x + counts.width / 2, counts.y + counts.height / 2);
  await expect(page).toHaveURL(routePath({ page: "game", id: secondPage[0] }));

  await page.goBack();
  await expect(page).toHaveURL("/games?size=7&page=2");
  await expect.poll(() => rowIds(page)).toEqual(secondPage);
  await page.goBack();
  await expect(page).toHaveURL("/games?size=7");
  await page.goBack();
  await expect(page).toHaveURL("/games");
  await expect(seats).toHaveValue("");
  await expect(seats.locator("option:checked")).toHaveText("Any size");
  await page.goForward();
  await expect(page).toHaveURL("/games?size=7");
  await page.reload();
  await expect(page).toHaveURL("/games?size=7");
  await expect(seats.locator("option:checked")).toHaveText("7 seats");

  // A filter change keeps the scroll position.
  await page.evaluate(() => window.scrollTo(0, 300));
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await page.getByRole("combobox", { name: "Add a player" }).selectOption({ label: "WWWWWWWWWW01" });
  await expect(page).toHaveURL("/games?players=1&size=7");
  await expect(page.getByRole("button", { name: "Remove WWWWWWWWWW01" })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL("/games");
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
});

test("a real game shows up in GAMES, and its victory screen opens its page", async ({ page, baseURL }) => {
  desktopOnly();
  test.setTimeout(180_000);
  // The page's clock runs as usual until the end, when the test runs it on to the victory screen.
  await page.clock.install();
  const table = await openTable(baseURL!, 7);
  let id: string | undefined;
  let firstSeat = "";
  try {
    await watchLobby(page, table.lobby);
    await expect(page.locator(".game-screen")).toBeVisible();
    const end = await play(table);
    id = table.latest()!.gameId;
    expect(id, "the victory packet's gameId").toBeDefined();
    firstSeat = end.playerOrder[0];

    const returnToLobby = page.getByRole("button", { name: "RETURN TO LOBBY" });
    await expect(async () => {
      await page.clock.runFor(10_000);
      await expect(returnToLobby).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 60_000 });
  } finally {
    table.close();
  }

  // The record lands soon after the game ends.
  const response = page.request;
  let label = "";
  await expect(async () => {
    const all = parseStatsData(await (await response.get(STATS_GAMES_PATH)).json());
    const record = all.games.find((g) => g.id === id);
    expect(record, `the record of ${id}`).toBeDefined();
    label = outcomeLabel(record!);
  }).toPass({ timeout: 30_000 });

  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "See this game" }).click();
  const gamePage = await popup;
  await expect(gamePage).toHaveURL(routePath({ page: "game", id: id! }));
  await expect(async () => {
    await gamePage.reload();
    await expect(gamePage.getByRole("heading", { level: 1 })).toHaveText(label, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  const games = await page.context().newPage();
  await games.goto("/games");
  const add = games.getByRole("combobox", { name: "Add a player" });
  await expect(async () => {
    await games.reload();
    await expect(add.locator("option", { hasText: firstSeat })).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await add.selectOption({ label: firstSeat });
  await expect(games).toHaveURL(/\/games\?players=\d+$/);
  await expect(games.locator(`.games-row-link[href="${routePath({ page: "game", id: id! })}"]`)).toBeVisible();
});
