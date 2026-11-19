import { expect, test, type Page } from "@playwright/test";
import { LobbyState } from "../src/types";
import { TEN, gamePacket, openFakeGame } from "./fakeGame";
import { addPngDecoder, type PngDecoder } from "./layout";
import { pickPortrait, waitForPrompt } from "./lobby";
import { measureUntil, type Timed } from "./measureUntil";

// Runs in every project, Firefox included. Firefox could leave a closed prompt's empty box on
// screen until a reload, over the board and taking its presses (issue #27). Each kind of close is
// checked here: a prompt's own button (the box fades out, then empties), the server's OK (the box
// empties at once, then fades out) and the portrait picker in the lobby. Within the fade-out the
// overlay must stop being drawn, stay gone, and let presses through to the page under it.

/** CustomAlert's ALERT_FADE_OUT_MS, which e2e/ cannot import: it would load the page's CSS. */
const FADE_OUT_MS = 1_000;

/**
 * The fade-out's 1 s and room for a slow frame. The first look waits out the fade, and its
 * measurements count by when they began (measureUntil), so a slow one is judged rather than thrown
 * away (#97): only one that began before the box went and outlasted the 1.5 s left can fail the
 * look.
 */
const GONE_WITHIN_MS = 2_500;

/**
 * Below this share of its box changed, a closed prompt has gone: a box left on screen changes
 * nearly all of it.
 */
const GONE_SHARE = 0.01;

/**
 * How long the second look, a second after the box has gone, measures again while the page under
 * the box still changes. It ends at the first share under GONE_SHARE, so only a failure waits it
 * out.
 */
const STAYS_GONE_MS = 5_000;

/**
 * The least share of its box an open prompt changes on screen. The box is a card in the page's own
 * --backgroundDark (CustomAlert.css), so where a plain stretch of it covers a plain stretch of the
 * page's cards (the round tracker, the lobby's) no pixel changes: 0.83 to 1 of the box changes
 * in the measured windows (in CSS pixels, every project), against under 0.01 once it has gone.
 */
const OPEN_SHARE = 0.5;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Hides the prompt overlay. `visibility` with `!important` wins over its animations without
 * restarting them (`display: none` and back would restart the fade-out), and with no transitions
 * the overlay is out of sight at once. Returns a function that takes the style away again.
 */
async function hideOverlay(page: Page): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({
    content: "#alert, #alert * { visibility: hidden !important; transition: none !important; }",
  });
  return async () => {
    await style.evaluate((element) => (element as Element).remove());
  };
}

/**
 * The share of `rect` that the prompt overlay changes on screen: the screenshot as it is against
 * one with the overlay hidden. Most of it while a prompt is up (OPEN_SHARE), and none of it once the
 * prompt has gone. The page's running animations (END TERM's
 * flash, under the box on a phone) are paused where they are for both screenshots, so the overlay
 * is the only difference between them. The overlay's own are left alone: it is hidden in the
 * second screenshot whatever state they are in. Its `at` is when the first screenshot was asked
 * for: the overlay as that screenshot shows it, at that time or just after. Both are in CSS
 * pixels, on a phone 9 (the Galaxy S8) or 6.9 (the Pixel 7) times fewer than its own, so a busy
 * machine takes less long over them.
 */
async function overlayShare(page: Page, rect: Rect): Promise<Timed> {
  const paused = await page.evaluateHandle(() => {
    const running = document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return a.playState === "running" && !target?.closest("#alert");
    });
    running.forEach((a) => a.pause());
    return running;
  });
  const at = Date.now();
  const drawn = await page.screenshot({ clip: rect, scale: "css" });
  const show = await hideOverlay(page);
  const without = await page.screenshot({ clip: rect, scale: "css" });
  await show();
  await paused.evaluate((animations) => animations.forEach((a) => a.play()));
  await paused.dispose();
  await addPngDecoder(page);
  const share = await page.evaluate(
    async ([a, b]) => {
      const { decodePng } = globalThis as unknown as PngDecoder;
      const [pa, pb] = (await Promise.all([decodePng(a), decodePng(b)])).map((image) => image.data);
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const red = Math.abs(pa[i] - pb[i]);
        const green = Math.abs(pa[i + 1] - pb[i + 1]);
        const blue = Math.abs(pa[i + 2] - pb[i + 2]);
        if (red + green + blue > 12) changed++;
      }
      return changed / (pa.length / 4);
    },
    [drawn.toString("base64"), without.toString("base64")]
  );
  return { value: share, at };
}

/** Waits for the open prompt to finish fading in, checks that it is drawn, and returns its box. */
async function openBox(page: Page): Promise<Rect> {
  await waitForPrompt(page);
  const rect = (await page.locator("#alert-box").boundingBox())!;
  const { value: share } = await overlayShare(page, rect);
  expect(share, "the open prompt is drawn").toBeGreaterThan(OPEN_SHARE);
  return rect;
}

/**
 * Checks that the closed prompt is gone within the fade-out, stays gone and takes no press, timed
 * from the call, just after the close. Each look measures again until the box is gone or its time
 * is up, because the page under the box can still be changing between the two screenshots (on a
 * phone the box covers the round tracker, whose line fades to the next one); a box left on screen
 * would change nearly all of its area every time. A look fails on the last share of a measurement
 * that began within its time, however long that measurement took to return (measureUntil): on a
 * busy machine one can take over a second (#97). The first look waits out the fade: a measurement
 * during it could only see the box, and its hidden screenshot (hideOverlay's `transition: none`)
 * would cancel the box's `visibility` transition, ending the fade early.
 */
async function expectGone(page: Page, rect: Rect): Promise<void> {
  const closed = Date.now();
  const look = (deadline: number) =>
    measureUntil(() => overlayShare(page, rect), (share) => share < GONE_SHARE, deadline);
  await page.waitForTimeout(FADE_OUT_MS);
  const drawn = await look(closed + GONE_WITHIN_MS);
  expect(drawn, "the closed prompt is drawn").toBeLessThan(GONE_SHARE);
  await page.waitForTimeout(1_000);
  const back = await look(Date.now() + STAYS_GONE_MS);
  expect(back, "the closed prompt came back").toBeLessThan(GONE_SHARE);
  const hit = await page.evaluate(({ x, y, width, height }) => {
    const element = document.elementFromPoint(x + width / 2, y + height / 2);
    return element?.closest("#alert") ? "the prompt overlay" : "the page";
  }, rect);
  expect(hit, "what a press on the closed box's middle reaches").toBe("the page");
}

test("the role alert is gone once OKAY closes it", async ({ page }) => {
  const game = await openFakeGame(page);
  game.send(gamePacket({ president: TEN[1] }));
  const rect = await openBox(page);
  await page.locator("#alert-box").getByRole("button", { name: "OKAY" }).click();
  await expectGone(page, rect);
});

test("the vote prompt is gone once the server's OK closes it", async ({ page }) => {
  const game = await openFakeGame(page);
  game.send(gamePacket({ president: TEN[1] }));
  await page.locator("#alert-box.appear-custom-alert").getByRole("button", { name: "OKAY" }).click();
  game.send(gamePacket({ state: LobbyState.CHANCELLOR_VOTING, president: TEN[1], chancellor: TEN[2] }));
  const rect = await openBox(page);
  const alertBox = page.locator("#alert-box.appear-custom-alert");
  await alertBox.locator("#voting-card").first().click();
  await alertBox.getByRole("button", { name: "CONFIRM" }).click();
  // The OK empties the box at once, so it fades out empty, at the height it had (CustomAlert): the
  // box upstream saw left behind.
  game.send({ type: "ok" });
  await expectGone(page, rect);
});

test("after the policy alert closes, END TERM takes the president's press", async ({ page }) => {
  const game = await openFakeGame(page);
  game.send(
    gamePacket({
      state: LobbyState.POST_LEGISLATIVE,
      lastState: LobbyState.LEGISLATIVE_CHANCELLOR,
      chancellor: TEN[1],
      liberalPolicies: 1,
      lastPolicy: "LIBERAL",
    })
  );
  const rect = await openBox(page);
  await page.locator("#alert-box").getByRole("button", { name: "OKAY" }).click();
  await expectGone(page, rect);
  await page.getByRole("button", { name: "END TERM" }).click();
  await expect.poll(() => game.received.filter((m) => m.command === "end-term").length).toBe(1);
});

test("END TERM takes a press 300 ms after the policy alert's OKAY, while the alert fades out", async ({
  page,
  hasTouch,
}) => {
  const game = await openFakeGame(page);
  game.send(
    gamePacket({
      state: LobbyState.POST_LEGISLATIVE,
      lastState: LobbyState.LEGISLATIVE_CHANCELLOR,
      chancellor: TEN[1],
      liberalPolicies: 1,
      lastPolicy: "LIBERAL",
    })
  );
  await waitForPrompt(page);
  const endTerm = page.getByRole("button", { name: "END TERM" });
  await expect(endTerm).toBeEnabled();
  const box = (await endTerm.boundingBox())!;
  await page.locator("#alert-box").getByRole("button", { name: "OKAY" }).click();
  await page.waitForTimeout(300);
  // A press at a point, as a person's: Playwright's own click would wait for the overlay to go.
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect
    .poll(() => game.received.filter((m) => m.command === "end-term").length, { timeout: 2_000 })
    .toBe(1);
});

test("the portrait picker is gone once CONFIRM closes it in the lobby", async ({ page }) => {
  await openFakeGame(page);
  await page.getByRole("button", { name: "CHANGE LOOK" }).click();
  const rect = await openBox(page);
  await pickPortrait(page);
  await expectGone(page, rect);
});
