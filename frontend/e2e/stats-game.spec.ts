import { expect, test, type Page } from "@playwright/test";
import { outcomeLabel } from "../src/stats/format";
import { parseStatsData, STATS_GAMES_PATH, type GameRecord } from "../src/stats/record";
import { routePath } from "../src/stats/routes";
import { rounds } from "../src/stats/rounds";
import { isVictory, openTable, play } from "./driveGame";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, PHONE_SIZES, statsSizesFor, stubStats } from "./stats";

/** One game's page (`/stats/games/<id>`): its header and a block per round, at every size. */

const data = bigStatsData();
/** The game with the most seats, then the most events: ten twelve-character names voting. */
const largest = [...data.games].sort((a, b) => b.seats.length - a.seats.length || b.events.length - a.events.length)[0];
const incomplete = data.games.find((g) => !g.complete)!;
const unfinished = data.games.find((g) => g.outcome === "UNFINISHED")!;
const NOT_FOUND = "This game was not found.";

const isPhone = (size: { width: number; height: number }) =>
  PHONE_SIZES.some((phone) => phone.width === size.width && phone.height === size.height);

/** Opens the page of `id` with the big response stubbed, and waits for it and its fonts. */
async function openGame(page: Page, id: string): Promise<void> {
  await page.goto(routePath({ page: "game", id }));
  const game = data.games.find((g) => g.id === id);
  if (game) await expect(page.getByRole("heading", { level: 1 })).toHaveText(outcomeLabel(game));
  else await expect(page.getByText(NOT_FOUND, { exact: true })).toBeVisible();
  await settle(page);
}

test("the game page fits every size", async ({ page }) => {
  test.slow();
  await stubStats(page, data);
  expect(largest.seats.length).toBe(10);
  for (const game of [largest, incomplete, unfinished, null]) {
    await openGame(page, game ? game.id : "no-such-game");
    if (game === largest) await expect(page.locator(".round-block")).toHaveCount(rounds(largest).length);
    if (game === incomplete) await expect(page.getByText("The first rounds of this game were not recorded.")).toBeVisible();
    if (game === unfinished) await expect(page.getByText("Unfinished: the lobby closed")).toBeVisible();
    for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
      await checkStatsPage(page, size);
      if (!isPhone(size)) continue;
      const widths = await page.locator(".round-block").evaluateAll((blocks) => blocks.map((b) => b.getBoundingClientRect().width));
      for (const width of widths) {
        expect(width, `a round's block at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.width - 32);
      }
    }
  }
});

test("an unknown game says so", async ({ page }) => {
  await stubStats(page, data);
  await openGame(page, "no-such-game");
  await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true));
  await page.getByRole("link", { name: "All games", exact: true }).click();
  await expect(page).toHaveURL(routePath({ page: "games" }));
  await expect(page.getByText(NOT_FOUND, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed), "no reload").toBe(true);
});

test("a real game's page shows every round", async ({ page, request, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  test.setTimeout(180_000);
  // Seven seats: driveGame's presidents never nominate Hitler after three fascist policies, and in
  // a game of five the two executions can leave no one else to nominate.
  const table = await openTable(baseURL!, 7);
  try {
    const victory = await play(table);
    expect(isVictory(victory.state), victory.state).toBe(true);
    const id = table.latest()!.gameId;
    expect(id, "the victory packet's gameId").toBeTruthy();

    // The writer saves on its own thread, so the record lands just after the victory.
    let record: GameRecord | undefined;
    await expect
      .poll(
        async () => {
          const response = await request.get(STATS_GAMES_PATH);
          record = response.ok() ? parseStatsData(await response.json()).games.find((g) => g.id === id) : undefined;
          return record !== undefined;
        },
        { timeout: 30_000 }
      )
      .toBe(true);

    await page.goto(routePath({ page: "game", id: id! }));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(outcomeLabel(record!));
    const blocks = page.locator(".round-block");
    await expect(blocks).toHaveCount(record!.rounds);
    // driveGame fails the first election.
    await expect(blocks.first()).toContainText("fails");
    expect(await page.locator(".decision-time").count(), "a decision's time").toBeGreaterThan(0);
    if (record!.events.some((e) => e.type === "vetoAnswer" && e.accepted)) {
      await expect(blocks.filter({ hasText: "accepted the veto" }).first()).toBeVisible();
    }
  } finally {
    table.close();
  }
});
