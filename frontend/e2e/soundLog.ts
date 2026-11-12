import { expect, type Page } from "@playwright/test";
import type { SoundRecord } from "../src/sound/SoundManager";

/** A play() call as the page recorded it, with what was on screen just after it. */
export type Heard = SoundRecord & { t: number; alert: string; eventBar: string; status: string };

/**
 * Records every play() call (SoundManager dispatches "sound-play" on window) with what was on
 * screen just after it: the alert and event bar two frames later, once the animation queued after
 * the sound has rendered, and the status line 350 ms later, once its 250 ms text fade is done.
 * Also counts how many AudioContexts the page creates.
 */
export async function recordSounds(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __sounds: unknown[];
      __audioContexts: number;
      AudioContext?: typeof AudioContext;
    };
    w.__sounds = [];
    w.__audioContexts = 0;
    const Original = w.AudioContext;
    if (Original) {
      w.AudioContext = class extends Original {
        constructor(options?: AudioContextOptions) {
          super(options);
          w.__audioContexts++;
        }
      };
    }
    const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? "";
    window.addEventListener("sound-play", (event) => {
      const entry = {
        ...(event as CustomEvent).detail,
        t: performance.now(),
        alert: "",
        eventBar: "",
        status: "",
      };
      w.__sounds.push(entry);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          entry.alert = text("#alert-box.appear-custom-alert");
          entry.eventBar = text("#event-bar.appear-eventbar");
        })
      );
      setTimeout(() => (entry.status = text("#status-bar-text")), 350);
    });
  });
}

export const soundLog = (page: Page): Promise<Heard[]> =>
  page.evaluate(() => (window as unknown as { __sounds: Heard[] }).__sounds);

/** Waits until the page has recorded `count` sounds, and their screen context. */
export async function heard(page: Page, count: number): Promise<Heard[]> {
  await expect
    .poll(async () => (await soundLog(page)).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(count);
  await page.waitForTimeout(400);
  return soundLog(page);
}
