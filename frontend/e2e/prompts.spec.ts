import { expect, test } from "@playwright/test";
import { LobbyState } from "../src/types";
import { PROMPTS, TEN, gamePacket, openFakeGame } from "./fakeGame";
import { DESKTOP_SIZES, overflowX, smallTargets } from "./layout";

// Runs in every project. Phones: no horizontal overflow, the prompt on screen and near-full width,
// large touch targets. Desktop, at all five sizes: the prompt never makes the page scroll, and its
// button can always be reached.

for (const prompt of PROMPTS) {
  test(`the ${prompt.name} prompt fits`, async ({ page, isMobile }) => {
    const game = await openFakeGame(page);
    prompt.packets.forEach((packet) => game.send(packet));
    const alertBox = page.locator("#alert-box.appear-custom-alert");
    const button = alertBox.getByRole("button", { name: prompt.button, exact: true });
    await button.waitFor({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    const sizes = isMobile ? [page.viewportSize()!] : DESKTOP_SIZES;
    for (const size of sizes) {
      await page.setViewportSize(size);
      const at = `${size.width}x${size.height}`;
      if (!isMobile) {
        const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(scrollHeight, `the page grows at ${at}`).toBeLessThanOrEqual(size.height);
      }
      const overflow = await overflowX(page);
      expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
      expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);

      const box = (await alertBox.boundingBox())!;
      expect(box.y, `box top at ${at}`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `box bottom at ${at}`).toBeLessThanOrEqual(size.height);
      if (isMobile) {
        expect(box.width, `box width at ${at}`).toBeGreaterThanOrEqual(size.width * 0.9);
        expect(await smallTargets(page, "#alert-box"), `small targets at ${at}`).toEqual([]);
      }

      await button.scrollIntoViewIfNeeded();
      const reached = (await button.boundingBox())!;
      expect(reached.y, `button top at ${at}`).toBeGreaterThanOrEqual(0);
      expect(reached.y + reached.height, `button bottom at ${at}`).toBeLessThanOrEqual(size.height);
    }
  });
}

const SHORT_SHAPES: { name: string; shape: (w: number, h: number) => { width: number; height: number } }[] = [
  { name: "sideways", shape: (w, h) => ({ width: h, height: w }) },
  { name: "upright and short", shape: (w) => ({ width: w, height: 600 }) },
];

for (const { name, shape } of SHORT_SHAPES) {
  test(`a prompt that opens while the page is scrolled is on screen, ${name}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "only phones scroll the game page");
    // The game fits a phone held upright, so this one is shortened, where the page scrolls.
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize(shape(width, height));
    const game = await openFakeGame(page);
    game.send(gamePacket({ state: LobbyState.CHANCELLOR_NOMINATION, president: TEN[1], electionTracker: 1 }));
    await page.locator(".game-screen").waitFor();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY), "the game page scrolls").toBeGreaterThan(0);

    game.send(PROMPTS.find((p) => p.name === "vote")!.packets[0]);
    const alertBox = page.locator("#alert-box.appear-custom-alert");
    await alertBox.getByRole("button", { name: "CONFIRM" }).waitFor();
    const box = (await alertBox.boundingBox())!;
    expect(box.y, "box top").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "box bottom").toBeLessThanOrEqual(page.viewportSize()!.height);
  });
}
