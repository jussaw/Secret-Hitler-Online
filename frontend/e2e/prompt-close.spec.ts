import { expect, test, type Page } from "@playwright/test";
import { LobbyState } from "../src/types";
import { TEN, gamePacket, openFakeGame } from "./fakeGame";
import { pickPortrait } from "./lobby";

// Runs in every project, Firefox included. Firefox could leave a closed prompt's empty box on
// screen until a reload, over the board and taking its presses (issue #27). Each kind of close is
// checked here: a prompt's own button (the box fades out, then empties), the server's OK (the box
// empties at once, then fades out) and the portrait picker in the lobby. Within the fade-out the
// overlay must stop being drawn, stay gone, and let presses through to the page under it.

/** CustomAlert's ALERT_FADE_OUT_MS is 1 s; the rest is room for a slow frame. */
const GONE_WITHIN_MS = 2_500;

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
 * one with the overlay hidden. Nearly all of it while a prompt is up (the box, and the dimmed page
 * around it), and none of it once the prompt has gone. The page's running animations (END TERM's
 * flash, under the box on a phone) are paused where they are for both screenshots, so the overlay
 * is the only difference between them. The overlay's own are left alone: it is hidden in the
 * second screenshot whatever state they are in.
 */
async function overlayShare(page: Page, rect: Rect): Promise<number> {
  const paused = await page.evaluateHandle(() => {
    const running = document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return a.playState === "running" && !target?.closest("#alert");
    });
    running.forEach((a) => a.pause());
    return running;
  });
  const drawn = await page.screenshot({ clip: rect });
  const show = await hideOverlay(page);
  const without = await page.screenshot({ clip: rect });
  await show();
  await paused.evaluate((animations) => animations.forEach((a) => a.play()));
  await paused.dispose();
  return page.evaluate(
    async ([a, b]) => {
      const pixels = async (data: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(img, 0, 0);
        return context.getImageData(0, 0, img.width, img.height).data;
      };
      const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
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
}

/**
 * Waits for the open prompt to finish fading in, checks that it is drawn, and returns its box.
 * The event bar, which passes over the box between prompts, is hidden so it cannot move between
 * the two screenshots of a measurement.
 */
async function openBox(page: Page): Promise<Rect> {
  await page.addStyleTag({ content: "#event-bar { display: none !important; }" });
  const box = page.locator("#alert-box.appear-custom-alert");
  await box.waitFor();
  await page.waitForFunction(() =>
    document
      .getElementById("alert")!
      .getAnimations({ subtree: true })
      .every((a) => a.playState === "finished")
  );
  const rect = (await box.boundingBox())!;
  expect(await overlayShare(page, rect), "the open prompt is drawn").toBeGreaterThan(0.9);
  return rect;
}

/**
 * Checks that the closed prompt is gone within the fade-out, stays gone and takes no press. Each
 * measurement is retried for a while, because the page under the box can still be changing between
 * the two screenshots (on a phone the box covers the round tracker, whose line fades to the next
 * one); a box left on screen would change nearly all of its area every time.
 */
async function expectGone(page: Page, rect: Rect): Promise<void> {
  await expect
    .poll(() => overlayShare(page, rect), { message: "the closed prompt is drawn", timeout: GONE_WITHIN_MS })
    .toBeLessThan(0.01);
  await page.waitForTimeout(1_000);
  await expect
    .poll(() => overlayShare(page, rect), { message: "the closed prompt came back", timeout: 1_500 })
    .toBeLessThan(0.01);
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
  // The OK empties the box at once, so it fades out empty: the box upstream saw left behind.
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

test("the portrait picker is gone once CONFIRM closes it in the lobby", async ({ page }) => {
  await openFakeGame(page);
  await page.getByRole("button", { name: "CHANGE LOOK" }).click();
  const rect = await openBox(page);
  await pickPortrait(page);
  await expectGone(page, rect);
});
