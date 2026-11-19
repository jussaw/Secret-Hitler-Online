import { expect, test, type Page } from "@playwright/test";
import { outcomeLabel } from "../src/stats/format";
import { botSkillOf, parseStatsData, STATS_GAMES_PATH, type GameRecord } from "../src/stats/record";
import { routePath } from "../src/stats/routes";
import { rounds } from "../src/stats/rounds";
import { isVictory, openTable, play } from "./driveGame";
import { settle } from "./lobby";
import { bigStatsData, checkStatsPage, PHONE_SIZES, statsSizesFor, stubStats } from "./stats";

/** One game's page (`/games/<id>`): its header and a block per round, at every size. */

const data = bigStatsData();
/** The game with the most seats, then the most events: ten twelve-character names voting. */
const largest = [...data.games].sort((a, b) => b.seats.length - a.seats.length || b.events.length - a.events.length)[0];
const incomplete = data.games.find((g) => !g.complete)!;
const unfinished = data.games.find((g) => g.outcome === "UNFINISHED")!;
/** The format 2 game with bots with the most seats, then the most events: its header names their level. */
const withBots = [...data.games]
  .filter((g) => botSkillOf(g) !== null)
  .sort((a, b) => b.seats.length - a.seats.length || b.events.length - a.events.length)[0];
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

/**
 * Each line and name in the page's cards that reaches past its card's content box (inside its
 * padding), as `text [left, right] in [left, right]`: a long line must wrap inside its card.
 */
function pastTheirCards(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const card of Array.from(document.querySelectorAll(".game-page .stats-card"))) {
      const r = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const left = r.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const right = r.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      for (const el of Array.from(card.querySelectorAll("p, .player-name"))) {
        for (const box of Array.from(el.getClientRects())) {
          if (box.width === 0 || (box.left >= left - 1 && box.right <= right + 1)) continue;
          const text = (el.textContent ?? "").trim().slice(0, 24);
          out.push(`${text} [${Math.round(box.left)}, ${Math.round(box.right)}] in [${Math.round(left)}, ${Math.round(right)}]`);
        }
      }
    }
    return out;
  });
}

test("the game page fits every size", async ({ page }) => {
  test.slow();
  await stubStats(page, data);
  expect(largest.seats.length).toBe(10);
  for (const game of [largest, incomplete, unfinished, withBots, null]) {
    await openGame(page, game ? game.id : "no-such-game");
    if (game === withBots) await expect(page.locator("p.game-facts")).toHaveText(/ · (Easy|Normal|Hard) bots$/);
    if (game === largest) await expect(page.locator(".round-block")).toHaveCount(rounds(largest).length);
    if (game === incomplete) await expect(page.getByText("The first rounds of this game were not recorded.")).toBeVisible();
    if (game === unfinished) await expect(page.getByText("Unfinished: the lobby closed")).toBeVisible();
    for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
      await checkStatsPage(page, size);
      expect(await pastTheirCards(page), `lines past their cards at ${size.width}x${size.height}`).toEqual([]);
      if (!isPhone(size)) continue;
      const widths = await page.locator(".round-block").evaluateAll((blocks) => blocks.map((b) => b.getBoundingClientRect().width));
      for (const width of widths) {
        expect(width, `a round's block at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(size.width - 32);
      }
    }
  }
});

test("a round's card: its edge and its lines' spacing", async ({ page }) => {
  await stubStats(page, data);
  await openGame(page, largest.id);
  const style = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { gap: s.rowGap, edge: `${s.borderLeftWidth} ${s.borderLeftColor}` };
      });
  // RoundBlock.css's own spacing, over the card look's 8px, which StatsApp.css sets after it.
  expect((await style(".round-block")).gap).toBe("4px");
  expect((await style(".game-header")).gap).toBe("8px");
  // A 6px edge in the colour of the policy (variables.css), grey for none.
  for (const [kind, color] of [
    ["liberal", "rgb(90, 155, 166)"],
    ["fascist", "rgb(232, 96, 74)"],
    ["none", "rgb(146, 128, 121)"],
  ]) {
    expect((await style(`.round-block.round-${kind}`)).edge, kind).toBe(`6px ${color}`);
  }
  // Each line is plain text in its card: no class of the game's own pages draws a box round one.
  const boxed = await page.locator(".round-block p").evaluateAll((lines) =>
    lines
      .filter((line) => {
        const s = getComputedStyle(line);
        return s.paddingTop !== "0px" || s.paddingLeft !== "0px" || s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.boxShadow !== "none";
      })
      .map((line) => `${line.className}: ${(line.textContent ?? "").slice(0, 30)}`)
  );
  expect(boxed).toEqual([]);
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
  // Seven seats: a game of seven also goes through an investigation and a special election, which
  // five or six seats never have.
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
