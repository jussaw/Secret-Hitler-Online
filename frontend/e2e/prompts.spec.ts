import { expect, test, type Locator, type Page } from "@playwright/test";
import { LobbyState } from "../src/types";
import { PROMPTS, TEN, gamePacket, openFakeGame } from "./fakeGame";
import { DESKTOP_SIZES, NARROW_PHONE, overflowX, smallTargets } from "./layout";

// Runs in desktop and the phone projects. Phones, at the project's size (phone-360 also at
// NARROW_PHONE, 320x568): no horizontal overflow, the prompt on screen and near-full width, large
// touch targets. Desktop, at all five sizes: the prompt never makes the page scroll, and its
// button can always be reached. The portrait picker's CONFIRM is in view without any scrolling,
// at those sizes and on a phone held sideways, with only the grid of portraits scrolling.

type Size = { width: number; height: number };

/** DESKTOP_SIZES on desktop; on a phone its own size, and NARROW_PHONE as well in phone-360. */
function promptSizes(page: Page, isMobile: boolean, project: string): Size[] {
  const phones = project === "phone-360" ? [NARROW_PHONE] : [];
  return isMobile ? [page.viewportSize()!, ...phones] : DESKTOP_SIZES;
}

/** Sizes the page to `size`: the page never grows on desktop or overflows sideways, and the box is on screen. */
async function resizeAndCheckFit(page: Page, alertBox: Locator, isMobile: boolean, size: Size): Promise<void> {
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
    // Held upright, a phone gives the box nearly its whole width.
    if (size.width < size.height) {
      expect(box.width, `box width at ${at}`).toBeGreaterThanOrEqual(size.width * 0.9);
    }
    expect(await smallTargets(page, "#alert-box"), `small targets at ${at}`).toEqual([]);
  }
}

for (const prompt of PROMPTS) {
  test(`the ${prompt.name} prompt fits`, async ({ page, isMobile }, testInfo) => {
    const game = await openFakeGame(page);
    prompt.packets.forEach((packet) => game.send(packet));
    const alertBox = page.locator("#alert-box.appear-custom-alert");
    const button = alertBox.getByRole("button", { name: prompt.button, exact: true });
    await button.waitFor({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    for (const size of promptSizes(page, isMobile, testInfo.project.name)) {
      await resizeAndCheckFit(page, alertBox, isMobile, size);
      const at = `${size.width}x${size.height}`;
      await button.scrollIntoViewIfNeeded();
      const reached = (await button.boundingBox())!;
      expect(reached.y, `button top at ${at}`).toBeGreaterThanOrEqual(0);
      expect(reached.y + reached.height, `button bottom at ${at}`).toBeLessThanOrEqual(size.height);
    }
  });
}

test("the portrait picker's CONFIRM is in view without scrolling", async ({ page, isMobile }, testInfo) => {
  await openFakeGame(page);
  await page.getByRole("button", { name: "CHANGE LOOK" }).click();
  const alertBox = page.locator("#alert-box.appear-custom-alert");
  const label = alertBox.locator("#prompt-label");
  const grid = alertBox.locator("#icon-container");
  const portraits = grid.locator("#icon");
  const button = alertBox.getByRole("button", { name: "CONFIRM", exact: true });
  await button.waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  // A phone held sideways is the shortest window the picker opens in.
  const { width, height } = page.viewportSize()!;
  const sideways = isMobile ? [{ width: height, height: width }] : [];
  for (const size of [...promptSizes(page, isMobile, testInfo.project.name), ...sideways]) {
    await resizeAndCheckFit(page, alertBox, isMobile, size);
    const at = `${size.width}x${size.height}`;
    // Only the grid scrolls: the box has nothing below CONFIRM to scroll to.
    const boxOverflow = await alertBox.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(boxOverflow, `the box scrolls at ${at}`).toBeLessThanOrEqual(0);
    await expect(label, `the label at ${at}`).toBeInViewport({ ratio: 1 });
    await expect(button, `CONFIRM at ${at}`).toBeInViewport({ ratio: 1 });
    const row = (await portraits.first().boundingBox())!.height;
    const shown = await grid.evaluate((el) => el.clientHeight);
    expect(shown, `the grid's height at ${at}, against a portrait's ${row}px`).toBeGreaterThanOrEqual(row);

    // Scrolling the grid to its end shows the last portrait, and moves neither the label nor CONFIRM.
    const pinned = await button.boundingBox();
    await grid.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(portraits.last(), `the last portrait at ${at}`).toBeInViewport({ ratio: 1 });
    await expect(label, `the label after scrolling at ${at}`).toBeInViewport({ ratio: 1 });
    await expect(button, `CONFIRM after scrolling at ${at}`).toBeInViewport({ ratio: 1 });
    expect(await button.boundingBox(), `CONFIRM moved at ${at}`).toEqual(pinned);
    await grid.evaluate((el) => el.scrollTo(0, 0));
  }
});

const SHORT_SHAPES = [
  { name: "sideways", shape: (w: number, h: number) => ({ width: h, height: w }) },
  { name: "upright and short", shape: (w: number) => ({ width: w, height: 600 }) },
];

for (const { name, shape } of SHORT_SHAPES) {
  test(`a prompt that opens while the page is scrolled is on screen, ${name}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "only phones scroll the game page");
    // The game fits a phone held upright, so this one is shortened, where the page scrolls.
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize(shape(width, height));
    const game = await openFakeGame(page);
    game.send(
      gamePacket({ state: LobbyState.CHANCELLOR_NOMINATION, president: TEN[1], electionTracker: 1 })
    );
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
