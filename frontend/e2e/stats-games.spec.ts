import { expect, test } from "@playwright/test";
import { routePath } from "../src/stats/routes";
import { signedOutMe, stubMe } from "./accounts";
import { FAKE_GAME_ID, openFakeGame, PROMPTS } from "./fakeGame";
import { MIN_TARGET } from "./layout";
import { bigStatsData, stubStats } from "./stats";

/** GAMES, every recorded game, and the links into the stats from the login page, the lobby and the victory screen. */

const data = bigStatsData();

const desktopOnly = () => test.skip(test.info().project.name !== "desktop", "one browser is enough");

test.describe("the links in", () => {
  test("the login page's Stats link opens the stats in the same tab", async ({ page }) => {
    desktopOnly();
    await stubMe(page, signedOutMe({ discord: true }));
    await stubStats(page, data);
    await page.goto("/");
    const stats = page.getByRole("contentinfo").getByRole("link", { name: "Stats", exact: true });
    await expect(stats).not.toHaveAttribute("target");
    await stats.click();
    await expect(page).toHaveURL(routePath({ page: "tab", tab: "overview" }));
    const nav = page.getByRole("navigation", { name: "Stats pages" });
    await expect(nav.getByRole("link", { name: "STATS", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("the lobby's Stats link opens the stats in a new tab", async ({ page }) => {
    desktopOnly();
    await openFakeGame(page);
    const popup = page.waitForEvent("popup");
    await page.locator(".lobby-footer").getByRole("link", { name: "Stats", exact: true }).click();
    const stats = await popup;
    await expect(stats).toHaveURL(routePath({ page: "tab", tab: "overview" }));
    await expect(page.getByRole("button", { name: "LEAVE LOBBY" })).toBeVisible();
    await expect(page).toHaveURL("/");
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
