import { expect, test, type Page } from "@playwright/test";
import { LobbyState, type GameState, type TermTimerState } from "../src/types";
import { openTable, play } from "./driveGame";
import { TEN, gamePacket, openFakeGame, openFakeWatch, spectatorPacket } from "./fakeGame";
import {
  DESKTOP_SIZES,
  NARROW_PHONE,
  NARROW_WINDOWS,
  SQUARE_DESKTOPS,
  overflowX,
  overlaps,
  pageHeight,
  smallTargets,
  type Box,
} from "./layout";
import { settle, watchLobby } from "./lobby";

/**
 * The END TERM countdown: the president's pause button, everyone else's view of it, where it
 * stands beside END TERM in every layout, and the server ending a term nobody ends.
 */

const [USER, OTHER] = TEN;

/** The game at END TERM with `president` in office, and the countdown as the server sends it. */
const endTerm = (termTimer: TermTimerState | undefined, president = USER): Partial<GameState> => ({
  state: LobbyState.POST_LEGISLATIVE,
  president,
  chancellor: TEN[2],
  // A game holds at most 8 discards at END TERM without late vetoes: 10 is more than that.
  drawSize: 5,
  discardSize: 10,
  termTimer,
});

const RUNNING = { remainingMs: 10_000, paused: false };

/** Hides prompts, which are overlays over the page, so the page under them can be used. */
async function hideAlerts(page: Page) {
  await page.addStyleTag({ content: "#alert { display: none !important; }" });
}

/** The commands the page has sent. */
const commands = (sent: Record<string, unknown>[]) => sent.map((message) => message.command);

test("the president pauses and resumes the countdown, and END TERM flashes only while it runs", async ({
  page,
}) => {
  const game = await openFakeGame(page);
  await hideAlerts(page);
  game.send(gamePacket(endTerm(RUNNING)));

  const endTermButton = page.getByRole("button", { name: "END TERM" });
  const pause = page.getByRole("button", { name: "Pause the countdown" });
  await expect(pause).toHaveText(/^(10|9)$/);
  await expect(pause, "the page counts down").toHaveText("8", { timeout: 4_000 });
  await expect(endTermButton).toHaveCSS("animation-name", "end-term-flash");

  await pause.click();
  await expect.poll(() => commands(game.received)).toContain("pause-term-timer");
  game.send(gamePacket(endTerm({ remainingMs: 7_400, paused: true })));
  const resume = page.getByRole("button", { name: "Resume the countdown" });
  await expect(resume).toHaveText("8");
  await expect(endTermButton).toHaveCSS("animation-name", "none");
  await page.waitForTimeout(1_500);
  await expect(resume, "a paused countdown holds its time").toHaveText("8");

  await resume.click();
  await expect.poll(() => commands(game.received)).toContain("resume-term-timer");
  game.send(gamePacket(endTerm({ remainingMs: 7_400, paused: false })));
  await expect(endTermButton).toHaveCSS("animation-name", "end-term-flash");
  await expect(pause).toHaveText("7", { timeout: 2_000 });

  // The term ends: the countdown goes, and END TERM stops flashing.
  game.send(gamePacket({ president: OTHER }));
  await expect(page.locator(".term-timer")).toHaveCount(0);
  await expect(endTermButton).toHaveCSS("animation-name", "none");
});

test("a player who is not president sees the countdown and END TERM flashing, and cannot pause", async ({
  page,
}) => {
  const game = await openFakeGame(page);
  await hideAlerts(page);
  game.send(gamePacket(endTerm(RUNNING, OTHER)));

  await expect(page.getByRole("timer", { name: "Time left in the term" })).toHaveText(/^(10|9)$/);
  await expect(page.getByRole("button", { name: /countdown/ })).toHaveCount(0);
  const endTermButton = page.getByRole("button", { name: "END TERM" });
  await expect(endTermButton).toBeDisabled();
  await expect(endTermButton).toHaveCSS("animation-name", "end-term-flash");

  game.send(gamePacket(endTerm({ remainingMs: 2_500, paused: true }, OTHER)));
  await expect(page.getByRole("timer", { name: "The countdown to the end of the term is paused" })).toHaveText("3");
  await expect(endTermButton).toHaveCSS("animation-name", "none");
});

test("a spectator sees the countdown, and whether it is paused, beside the hidden END TERM", async ({ page }) => {
  const watch = await openFakeWatch(page, spectatorPacket(endTerm(RUNNING, OTHER)));
  await hideAlerts(page);

  await expect(page.getByRole("timer", { name: "Time left in the term" })).toBeVisible();
  await expect(page.locator(".game-decks .end-term")).toHaveCSS("visibility", "hidden");
  watch.send(spectatorPacket(endTerm({ remainingMs: 4_100, paused: true }, OTHER)));
  await expect(page.getByRole("timer", { name: "The countdown to the end of the term is paused" })).toHaveText("5");
  await expect(page.getByRole("button", { name: /countdown/ })).toHaveCount(0);
  expect(commands(watch.received).filter((c) => c !== "ping" && c !== "get-state")).toEqual([]);
});

type Placement = "above" | "right";
type Size = { width: number; height: number };

/** The sizes each project measures, where the countdown goes, and whether they are touch screens. */
function layouts(project: string, viewport: Size): { sizes: Size[]; placement: Placement; touch: boolean }[] {
  if (project === "desktop") {
    return [
      { sizes: [...DESKTOP_SIZES, ...SQUARE_DESKTOPS], placement: "above", touch: false },
      { sizes: NARROW_WINDOWS, placement: "above", touch: true },
    ];
  }
  // Phones, held upright and sideways (phone-360 also at the narrowest phone supported).
  const sideways = { width: viewport.height, height: viewport.width };
  const sizes = project === "phone-360" ? [viewport, NARROW_PHONE, sideways] : [viewport, sideways];
  return [{ sizes, placement: "right", touch: true }];
}

/** The parts of the table the countdown must keep clear of, in viewport px. */
function measure(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const timer = document.querySelector(".term-timer");
    return {
      timer: box(timer),
      timerFits: timer ? timer.scrollWidth <= timer.clientWidth + 1 : true,
      endTerm: box(document.querySelector(".game-decks .end-term"))!,
      header: box(document.querySelector(".game-screen > header"))!,
      roster: box(document.querySelector(".game-body > .roster"))!,
      tracker: box(document.querySelector(".game-table > .round-tracker"))!,
      boards: box(document.querySelector("#board-container"))!,
      counts: box(document.querySelector(".game-decks #pps-container"))!,
      draw: box(document.querySelector(".game-deck.draw #deck-container"))!,
      deckCards: Array.from(document.querySelectorAll(".game-decks #deck-policy.deck-final-show"), (el) => box(el)!),
    };
  });
}

const centreX = (b: Box) => (b.left + b.right) / 2;
const centreY = (b: Box) => (b.top + b.bottom) / 2;
// END TERM's flash is an outline 2px out and 3px wide: the countdown keeps clear of it.
const FLASH = 5;

async function checkPlacement(page: Page, size: Size, placement: Placement, touch: boolean, who: string) {
  await page.setViewportSize(size);
  const at = `${size.width}x${size.height} for ${who}`;

  // Without the countdown first: it must move nothing and add no scroll.
  const show = (on: boolean) =>
    page.evaluate((on) => {
      (document.querySelector(".term-timer-anchor") as HTMLElement).style.display = on ? "" : "none";
    }, on);
  await show(false);
  const without = await measure(page);
  const heightWithout = await pageHeight(page);
  await show(true);
  const parts = await measure(page);
  const timer = parts.timer!;
  expect(timer, `the countdown at ${at}`).not.toBeNull();
  expect(parts.endTerm, `END TERM moves with the countdown at ${at}`).toEqual(without.endTerm);
  expect(await pageHeight(page), `the countdown adds scroll at ${at}`).toBe(heightWithout);
  const overflow = await overflowX(page);
  expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
  expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);
  expect(parts.timerFits, `the countdown's text fits at ${at}`).toBe(true);

  if (placement === "above") {
    expect(timer.bottom, `the countdown above END TERM's flash at ${at}`).toBeLessThanOrEqual(parts.endTerm.top - FLASH);
    expect(parts.endTerm.top - timer.bottom, `the countdown just above END TERM at ${at}`).toBeLessThanOrEqual(24);
    expect(Math.abs(centreX(timer) - centreX(parts.endTerm)), `the countdown centred on END TERM at ${at}`).toBeLessThanOrEqual(1);
    expect(timer.top, `the countdown under the header at ${at}`).toBeGreaterThanOrEqual(parts.header.bottom);
  } else {
    expect(timer.left, `the countdown right of END TERM's flash at ${at}`).toBeGreaterThanOrEqual(parts.endTerm.right + FLASH);
    expect(Math.abs(centreY(timer) - centreY(parts.endTerm)), `the countdown level with END TERM at ${at}`).toBeLessThanOrEqual(1);
  }
  for (const [name, part] of [
    ["the roster", parts.roster],
    ["the tracker", parts.tracker],
    ["the boards", parts.boards],
    ["the counts box", parts.counts],
    ["the draw pile", parts.draw],
  ] as const) {
    expect(overlaps(timer, part), `the countdown over ${name} at ${at}`).toBe(false);
  }
  for (const card of parts.deckCards) {
    expect(overlaps(timer, card), `the countdown over a deck card at ${at}`).toBe(false);
  }
  if (touch) {
    expect(await smallTargets(page, ".game-screen"), `small touch targets at ${at}`).toEqual([]);
    expect(timer.bottom - timer.top, `the countdown's height at ${at}`).toBeGreaterThanOrEqual(44);
  }
}

for (const who of ["the president", "a spectator"] as const) {
  test(`the countdown stands beside END TERM in every layout for ${who}, and moves nothing`, async ({
    page,
  }, testInfo) => {
    if (who === "the president") {
      const game = await openFakeGame(page);
      game.send(gamePacket(endTerm({ remainingMs: 10_000, paused: true })));
    } else {
      await openFakeWatch(page, spectatorPacket(endTerm({ remainingMs: 10_000, paused: true }, OTHER)));
    }
    await page.locator(".term-timer").waitFor();
    await settle(page);
    // The discard pile shows its cards once the page has animated them in.
    await expect(page.locator(".game-deck.discard #deck-policy.deck-final-show")).toHaveCount(10, { timeout: 10_000 });

    const viewport = page.viewportSize()!;
    for (const { sizes, placement, touch } of layouts(testInfo.project.name, viewport)) {
      for (const size of sizes) await checkPlacement(page, size, placement, touch, who);
    }
  });
}

test("the server ends a term that nobody ends when its countdown runs out", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  test.setTimeout(90_000);
  const table = await openTable(baseURL!, 5);
  try {
    // The first election fails, so the game soon waits for its first president's END TERM.
    const waiting = await play(table, { until: (g) => g.state === LobbyState.POST_LEGISLATIVE });
    const reached = Date.now();
    expect(waiting.state).toBe(LobbyState.POST_LEGISLATIVE);
    expect(waiting.termTimer?.paused).toBe(false);

    await watchLobby(page, table.lobby);
    await expect(page.getByRole("timer", { name: "Time left in the term" })).toBeVisible();
    await expect(page.locator(".term-timer")).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => table.latest()!.state).toBe(LobbyState.CHANCELLOR_NOMINATION);
    const elapsed = Date.now() - reached;
    expect(elapsed, "the term ended after about 10 s").toBeGreaterThan(9_000);
    expect(elapsed).toBeLessThan(14_000);
    const next = table.latest()!;
    expect(next.president, "the next president").not.toBe(waiting.president);
    expect(next.termTimer).toBeUndefined();
  } finally {
    table.close();
  }
});
