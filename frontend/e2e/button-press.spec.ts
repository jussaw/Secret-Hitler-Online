import { expect, test, type Locator, type Page } from "@playwright/test";
import { LobbyState } from "../src/types";
import { PROMPTS, TEN, gamePacket, openFakeGame } from "./fakeGame";
import { addPngDecoder, type PngDecoder } from "./layout";
import { waitForPrompt } from "./lobby";

// Runs in desktop and firefox, with a mouse. A button is drawn as a face standing on its shadow,
// and a press anywhere on what is drawn reaches it (issue #29), held as long as a person holds a
// click: at the face's top edge, where a press once moved the button out from under the pointer,
// and in the shadow, which once took no presses. Phones are left out: a phone's touch adjustment
// moves a tap onto a nearby button, so they never missed. A button that eased into its size or
// place as a page appeared would also slide out from under a press made where it was measured,
// which Firefox did (issue #59).

/** How long each press is held: about as long as a person holds a click. */
const HOLD_MS = 150;

/** How far below a button's box its shadow is looked for: it is 5px, and once lay below the box. */
const SHADOW_SEARCH_PX = 12;

/** A run of rows, in viewport px: `bottom` is the first row below it. */
type Rows = { top: number; bottom: number };

/** A place to press, on the button's centre line: its name, and its row from what is drawn. */
type PressAt = { name: string; y: (face: Rows, shadow: Rows) => number };

const PRESSES: PressAt[] = [
  { name: "1px below the top edge", y: (face) => face.top + 1 },
  { name: "3px below the top edge", y: (face) => face.top + 3 },
  { name: "2px into the shadow", y: (_, shadow) => shadow.top + 2 },
  { name: "at the shadow's foot", y: (_, shadow) => shadow.bottom - 1 },
];

/** Starts recording the label of the button each click reaches, or null for a click elsewhere. */
async function recordClicks(page: Page): Promise<() => Promise<(string | null)[]>> {
  await page.evaluate(() => {
    const clicks: (string | null)[] = [];
    (globalThis as unknown as { buttonClicks: typeof clicks }).buttonClicks = clicks;
    document.addEventListener(
      "click",
      (event) => clicks.push((event.target as Element).closest("button")?.textContent?.trim() ?? null),
      true
    );
  });
  return () => page.evaluate(() => (globalThis as unknown as { buttonClicks: (string | null)[] }).buttonClicks);
}

/**
 * Starts recording each transition a button starts on its size or place, as "label: property".
 * Colours are left out: the label's and the face's ease on purpose, as when a button is hovered.
 */
async function recordButtonEases(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const eases: string[] = [];
    (globalThis as unknown as { buttonEases: typeof eases }).buttonEases = eases;
    document.addEventListener(
      "transitionrun",
      (event) => {
        const button = (event.target as Element).closest("button");
        if (!button || event.propertyName.endsWith("color")) return;
        const label = button.getAttribute("aria-label") ?? button.textContent?.trim();
        eases.push(`${label}: ${event.propertyName}`);
      },
      true
    );
  });
  return () => page.evaluate(() => (globalThis as unknown as { buttonEases: string[] }).buttonEases);
}

/**
 * Where `button` is drawn, in viewport px, down its centre line: the face from its box's top, and
 * the shadow as the first run of rows in the shadow's colour below that. Read from a screenshot, so
 * it is what a person sees whatever draws it.
 */
async function whereDrawn(page: Page, button: Locator): Promise<{ x: number; face: Rows; shadow: Rows }> {
  // A deck's image sets its height, and so where the decks column, END TERM included, is centred.
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
  const box = (await button.boundingBox())!;
  const x = Math.floor(box.x + box.width / 2);
  const clip = { x, y: Math.floor(box.y), width: 1, height: Math.ceil(box.height) + SHADOW_SEARCH_PX };
  const png = await page.screenshot({ clip, scale: "css" });
  await addPngDecoder(page);
  const inShadow = await page.evaluate(async (base64) => {
    const { decodePng } = globalThis as unknown as PngDecoder;
    const hex = getComputedStyle(document.documentElement).getPropertyValue("--buttonShadowFill").trim();
    const shadow = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const { width, height, data } = await decodePng(base64);
    return Array.from({ length: height }, (_, row) =>
      shadow.every((value, c) => Math.abs(data[row * width * 4 + c] - value) <= 6)
    );
  }, png.toString("base64"));
  const top = inShadow.indexOf(true);
  expect(top, "the drawn shadow").toBeGreaterThanOrEqual(0);
  let bottom = top;
  while (inShadow[bottom]) bottom++;
  expect(bottom - top, "rows of the drawn shadow").toBeGreaterThanOrEqual(3);
  return { x: x + 0.5, face: { top: box.y, bottom: clip.y + top }, shadow: { top: clip.y + top, bottom: clip.y + bottom } };
}

/** Presses at (x, y) with the mouse and holds the press for HOLD_MS. */
async function holdPress(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  await page.mouse.up();
}

/** Opens the veto prompt, whose REJECT and ACCEPT share a line, and waits for it to settle. */
async function openVeto(page: Page) {
  const game = await openFakeGame(page);
  PROMPTS.find((p) => p.name === "veto")!.packets.forEach((packet) => game.send(packet));
  await waitForPrompt(page);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const alertBox = page.locator("#alert-box");
  return {
    game,
    reject: alertBox.getByRole("button", { name: "REJECT" }),
    accept: alertBox.getByRole("button", { name: "ACCEPT" }),
  };
}

// Firefox styles a page that has just appeared with its container units measured against the
// window, then again against their containers. A button that eased every change of size or place
// would slide from there into its place, out from under a press made where it is drawn (issue #59).
test("no button eases into its size or place as the game page appears", async ({ page }) => {
  const game = await openFakeGame(page);
  await page.addStyleTag({ content: "#alert { display: none !important; }" });
  const eases = await recordButtonEases(page);
  // END TERM, the president's countdown and the header's speaker all take their size from a
  // container.
  game.send(
    gamePacket({
      state: LobbyState.POST_LEGISLATIVE,
      chancellor: TEN[2],
      termTimer: { remainingMs: 10_000, paused: true },
    })
  );
  await expect(page.getByRole("button", { name: "END TERM" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Resume the countdown" })).toBeVisible();
  // Two frames: the restyle against the containers comes with the first layout.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await eases()).toEqual([]);
});

test("END TERM takes a held press anywhere it is drawn", async ({ page }) => {
  const game = await openFakeGame(page);
  await page.addStyleTag({ content: "#alert { display: none !important; }" });
  game.send(gamePacket({ state: LobbyState.POST_LEGISLATIVE, chancellor: TEN[2] }));
  const endTerm = page.getByRole("button", { name: "END TERM" });
  await expect(endTerm).toBeEnabled();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const { x, face, shadow } = await whereDrawn(page, endTerm);
  const clicks = await recordClicks(page);

  for (const [i, press] of PRESSES.entries()) {
    await holdPress(page, x, press.y(face, shadow));
    expect((await clicks())[i], `a press ${press.name}`).toBe("END TERM");
  }
  expect(game.received.filter((m) => m.command === "end-term")).toHaveLength(PRESSES.length);
});

test("a held press moves no button's box, its own or the one beside it, in any frame", async ({ page }) => {
  const { reject } = await openVeto(page);
  const { x, face } = await whereDrawn(page, reject);
  // Both boxes in every frame, from before the press until it has been held well past its look's
  // 0.15s ease.
  const frames = page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const buttons = Array.from(document.querySelectorAll("#alert-box button"));
        const seen = new Set<string>();
        const start = performance.now();
        const frame = () => {
          seen.add(JSON.stringify(buttons.map((button) => button.getBoundingClientRect().toJSON())));
          if (performance.now() - start < 700) requestAnimationFrame(frame);
          else resolve([...seen]);
        };
        frame();
      })
  );
  await page.mouse.move(x, (face.top + face.bottom) / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  const seen = await frames;
  await page.mouse.up();
  expect(seen, "REJECT's and ACCEPT's boxes over every frame of a press on REJECT").toHaveLength(1);
});

for (const press of PRESSES) {
  test(`a prompt's button takes a held press ${press.name}`, async ({ page }) => {
    const { game, reject } = await openVeto(page);
    const { x, face, shadow } = await whereDrawn(page, reject);
    const clicks = await recordClicks(page);

    await holdPress(page, x, press.y(face, shadow));
    expect(await clicks(), `a press ${press.name}`).toEqual(["REJECT"]);
    expect(game.received.filter((m) => m.command === "president-veto")).toHaveLength(1);
  });
}
