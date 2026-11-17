import { expect, test, type Locator, type Page } from "@playwright/test";
import { LobbyState } from "../src/types";
import { PROMPTS, TEN, gamePacket, openFakeGame } from "./fakeGame";
import { DESKTOP_SIZES, NARROW_PHONE, overflowX, smallTargets } from "./layout";

// Runs in desktop and the phone projects. Every prompt is a card of three parts (PromptLayout): its
// title, its middle and its buttons. At every size (desktop: the five desktop sizes; a phone: its
// own size, and NARROW_PHONE as well in phone-360) the card is inside the window, 16px clear of the
// header and of the window's bottom, with nothing past either side; its title and its buttons are
// in view without any scrolling, the box itself never scrolls, and the line above the buttons shows
// exactly when the middle scrolls. On an upright phone the card takes the window's width less 16px
// each side, with large touch targets. A prompt taller than the window (the vote with both warnings
// at 1280x600 and on a phone held sideways, and the portrait picker) scrolls its middle alone,
// between a title and buttons that stay put.

type Size = { width: number; height: number };

/** The room CustomAlert.css keeps between the box and the header, and the window's bottom. */
const GAP = 16;

/** DESKTOP_SIZES on desktop; on a phone its own size, and NARROW_PHONE as well in phone-360. */
function promptSizes(page: Page, isMobile: boolean, project: string): Size[] {
  const phones = project === "phone-360" ? [NARROW_PHONE] : [];
  return isMobile ? [page.viewportSize()!, ...phones] : DESKTOP_SIZES;
}

/** Waits for two frames: the ResizeObservers' answers to a resize, and the render they cause. */
async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  );
}

type PromptState = {
  /** The class of each of the prompt's parts, in order. */
  parts: string[];
  /**
   * Whether the middle holds more than it shows, by a pixel or more: the browser's own test for a
   * scroll bar (headless Chromium hides scroll bars, so their width cannot be measured).
   */
  middleScrolls: boolean;
  /** Whether the line above the buttons is drawn (PromptLayout's prompt-scrolls). */
  line: boolean;
  /** Whether the box itself holds more than it shows. */
  boxScrolls: boolean;
};

function promptState(alertBox: Locator): Promise<PromptState> {
  return alertBox.evaluate((box) => {
    const prompt = box.querySelector(".prompt")!;
    const body = prompt.querySelector(".prompt-body")!;
    return {
      parts: Array.from(prompt.children).map((part) => part.className),
      middleScrolls: body.scrollHeight > body.clientHeight,
      line: prompt.classList.contains("prompt-scrolls"),
      boxScrolls: box.scrollHeight > box.clientHeight,
    };
  });
}

/**
 * Sizes the page to `size` and checks the prompt there: the page never grows on desktop or
 * overflows sideways; the box is inside the window, 16px clear of the header and the bottom; its
 * title and `button` are in view as they are, the box itself does not scroll, and the line above
 * the buttons shows exactly when the middle scrolls. Returns the prompt's state.
 */
async function resizeAndCheckFit(
  page: Page,
  alertBox: Locator,
  button: Locator,
  isMobile: boolean,
  size: Size
): Promise<PromptState> {
  await page.setViewportSize(size);
  await settleLayout(page);
  const at = `${size.width}x${size.height}`;
  if (!isMobile) {
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight, `the page grows at ${at}`).toBeLessThanOrEqual(size.height);
  }
  const overflow = await overflowX(page);
  expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
  expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);

  const header = (await page.locator("header").first().boundingBox())!;
  const box = (await alertBox.boundingBox())!;
  expect(box.y, `box ${GAP}px under the header at ${at}`).toBeGreaterThanOrEqual(header.height + GAP - 0.5);
  expect(box.y + box.height, `box ${GAP}px over the bottom at ${at}`).toBeLessThanOrEqual(size.height - GAP + 0.5);
  expect(box.x, `box left at ${at}`).toBeGreaterThanOrEqual(GAP - 0.5);
  expect(box.x + box.width, `box right at ${at}`).toBeLessThanOrEqual(size.width - GAP + 0.5);
  if (isMobile) {
    // Held upright, a phone gives the box its whole width less 16px each side.
    if (size.width < size.height) {
      expect(box.width, `box width at ${at}`).toBeGreaterThanOrEqual(size.width - 2 * GAP - 0.5);
    }
    expect(await smallTargets(page, "#alert-box"), `small targets at ${at}`).toEqual([]);
  }

  await expect(alertBox.locator(".prompt-title"), `the title at ${at}`).toBeInViewport({ ratio: 1 });
  await expect(button, `the button at ${at}`).toBeInViewport({ ratio: 1 });
  const state = await promptState(alertBox);
  expect(state.parts, `the prompt's parts at ${at}`).toEqual(["prompt-title", "prompt-body", "prompt-buttons"]);
  expect(state.boxScrolls, `the box scrolls at ${at}`).toBe(false);
  expect(state.line, `the line above the buttons at ${at}, where the middle scrolls: ${state.middleScrolls}`).toBe(
    state.middleScrolls
  );
  return state;
}

/** Opens `name` from PROMPTS on the scripted game and waits for its button, with the web fonts. */
async function openPrompt(page: Page, name: string): Promise<{ alertBox: Locator; button: Locator }> {
  const prompt = PROMPTS.find((p) => p.name === name)!;
  const game = await openFakeGame(page);
  prompt.packets.forEach((packet) => game.send(packet));
  const alertBox = page.locator("#alert-box.appear-custom-alert");
  const button = alertBox.getByRole("button", { name: prompt.button, exact: true });
  await button.waitFor({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
  return { alertBox, button };
}

for (const prompt of PROMPTS) {
  test(`the ${prompt.name} prompt fits`, async ({ page, isMobile }, testInfo) => {
    const { alertBox, button } = await openPrompt(page, prompt.name);
    for (const size of promptSizes(page, isMobile, testInfo.project.name)) {
      await resizeAndCheckFit(page, alertBox, button, isMobile, size);
    }
  });
}

/**
 * Scrolls the open prompt's middle to its end and checks that the last of what it holds comes into
 * its view, while the title and `button` stay where they were. Scrolls back to the top after.
 */
async function scrollMiddleToEnd(alertBox: Locator, button: Locator, at: string): Promise<void> {
  const title = alertBox.locator(".prompt-title");
  const body = alertBox.locator(".prompt-body");
  const pinned = { title: await title.boundingBox(), button: await button.boundingBox() };
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const end = await body.evaluate((el) => {
    const last = el.querySelector(".prompt-content")!.lastElementChild!;
    return { last: last.getBoundingClientRect().bottom, view: el.getBoundingClientRect().bottom };
  });
  // Within a pixel: the middle scrolls by whole pixels, and what it holds can end on a fraction.
  expect(end.last, `the end of the middle shows at ${at}`).toBeLessThanOrEqual(end.view + 1);
  expect(await title.boundingBox(), `the title moved at ${at}`).toEqual(pinned.title);
  expect(await button.boundingBox(), `the button moved at ${at}`).toEqual(pinned.button);
  await expect(button, `the button after scrolling at ${at}`).toBeInViewport({ ratio: 1 });
  await body.evaluate((el) => el.scrollTo(0, 0));
}

test("a prompt taller than the window keeps its title and buttons in view and scrolls its middle", async ({
  page,
  isMobile,
}) => {
  // The vote with both of its warnings: on desktop, on a short laptop screen; on a phone, held
  // sideways. (A phone held sideways gives the card its whole width less 32px, where the role alert
  // fits.)
  const { width, height } = page.viewportSize()!;
  const size = isMobile ? { width: height, height: width } : { width: 1280, height: 600 };
  const { alertBox, button } = await openPrompt(page, "vote");
  const at = `${size.width}x${size.height}`;
  const state = await resizeAndCheckFit(page, alertBox, button, isMobile, size);
  expect(state.middleScrolls, `the vote's middle scrolls at ${at}`).toBe(true);
  expect(state.line, `the line above the buttons at ${at}`).toBe(true);
  await scrollMiddleToEnd(alertBox, button, at);
});

test("a prompt that fits shows no line above its buttons and no scroll bar", async ({ page, isMobile }) => {
  // The role alert, on desktop and on a phone held upright or sideways.
  const { width, height } = page.viewportSize()!;
  const sizes = isMobile ? [{ width, height }, { width: height, height: width }] : [{ width: 1600, height: 900 }];
  const { alertBox, button } = await openPrompt(page, "role");
  for (const size of sizes) {
    const at = `${size.width}x${size.height}`;
    // A middle that holds no more than it shows has no scroll bar to draw.
    const state = await resizeAndCheckFit(page, alertBox, button, isMobile, size);
    expect(state.middleScrolls, `the role alert's middle scrolls at ${at}`).toBe(false);
    expect(state.line, `the line above the buttons at ${at}`).toBe(false);
  }
});

/**
 * Opens the policy alert at the page's size and checks, frame by frame, that its middle never
 * scrolls. The folder turns over in 3D, growing as it does, between 1 s and 2 s after it opens.
 */
async function expectFolderNeverScrolls(page: Page): Promise<void> {
  const { alertBox } = await openPrompt(page, "policy-enacted");
  const seen = await alertBox.evaluate(async (box) => {
    const body = box.querySelector(".prompt-body")!;
    const scrolls = new Set<boolean>();
    const start = performance.now();
    while (performance.now() - start < 2_500) {
      scrolls.add(body.scrollHeight > body.clientHeight);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return Array.from(scrolls);
  });
  expect(seen, "whether the middle scrolled, frame by frame").toEqual([false]);
}

// The largest desktop, and the one this first showed at.
for (const size of [DESKTOP_SIZES[0], DESKTOP_SIZES[2]]) {
  test(`the policy alert's folder turns over without making its middle scroll at ${size.width}x${size.height}`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "a desktop size");
    await page.setViewportSize(size);
    await expectFolderNeverScrolls(page);
  });
}

test("the policy alert's folder turns over without making its middle scroll on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone, at its own size");
  await expectFolderNeverScrolls(page);
});

test("the portrait picker's CONFIRM is in view without scrolling", async ({ page, isMobile }, testInfo) => {
  await openFakeGame(page);
  await page.getByRole("button", { name: "CHANGE LOOK" }).click();
  const alertBox = page.locator("#alert-box.appear-custom-alert");
  const label = alertBox.locator("#prompt-label");
  const portraits = alertBox.locator("#icon");
  const button = alertBox.getByRole("button", { name: "CONFIRM", exact: true });
  await button.waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));

  // A phone held sideways is the shortest window the picker opens in.
  const { width, height } = page.viewportSize()!;
  const sideways = isMobile ? [{ width: height, height: width }] : [];
  for (const size of [...promptSizes(page, isMobile, testInfo.project.name), ...sideways]) {
    await resizeAndCheckFit(page, alertBox, button, isMobile, size);
    const at = `${size.width}x${size.height}`;
    await expect(label, `the label at ${at}`).toBeInViewport({ ratio: 1 });
    const row = (await portraits.first().boundingBox())!.height;
    const shown = await alertBox.locator(".prompt-body").evaluate((el) => el.clientHeight);
    expect(shown, `the middle's height at ${at}, against a portrait's ${row}px`).toBeGreaterThanOrEqual(row);

    // Scrolling the middle to its end shows the last portrait, and moves neither the label nor CONFIRM.
    await scrollMiddleToEnd(alertBox, button, at);
    await expect(label, `the label after scrolling at ${at}`).toBeInViewport({ ratio: 1 });
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
    const button = alertBox.getByRole("button", { name: "CONFIRM" });
    await button.waitFor();
    const box = (await alertBox.boundingBox())!;
    expect(box.y, "box top").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "box bottom").toBeLessThanOrEqual(page.viewportSize()!.height);
    await expect(alertBox.locator(".prompt-title"), "the title").toBeInViewport({ ratio: 1 });
    await expect(button, "CONFIRM").toBeInViewport({ ratio: 1 });
  });
}
