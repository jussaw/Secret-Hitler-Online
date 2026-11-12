import type { Page } from "@playwright/test";

export const DESKTOP_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1920, height: 937 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

/**
 * Windows narrower than 5:4 but wider than a phone, where the stacked game screen fits one
 * screen with round-table-size tiles.
 */
export const NARROW_WINDOWS = [
  { width: 960, height: 1080 }, // half a 1080p screen
  { width: 1280, height: 1440 }, // half a 1440p screen
  { width: 1080, height: 1920 }, // a 1080p monitor turned upright
  { width: 1279, height: 1024 }, // just narrower than 5:4
  { width: 1024, height: 1366 }, // iPad Pro, upright
  { width: 820, height: 1180 }, // iPad Air, upright
  { width: 744, height: 1133 }, // iPad mini, upright
  { width: 700, height: 900 }, // the narrowest
  { width: 800, height: 700 }, // a short window
];

/** Touch targets on phones are at least this many CSS px wide and tall. */
export const MIN_TARGET = 44;

export type Box = { left: number; right: number; top: number; bottom: number };

export const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Horizontal overflow. App.css hides overflow-x on html and body, so body clips anything too
 * wide and only body.scrollWidth shows it; `offscreen` also lists every visible element that
 * reaches more than 1px past either side of the viewport, clipped or not.
 */
export function overflowX(page: Page): Promise<{ scrollWidth: number; offscreen: string[] }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offscreen: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility !== "visible") continue;
      if (r.left < -1 || r.right > width + 1) {
        const id = el.id ? `#${el.id}` : "";
        offscreen.push(`${el.tagName.toLowerCase()}${id} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
      }
    }
    return {
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      offscreen,
    };
  });
}

/**
 * Visible buttons, text fields and selectable tiles or cards inside `scope` that are smaller
 * than MIN_TARGET in either direction, as `tag#id "text" WxH`.
 */
export function smallTargets(page: Page, scope: string): Promise<string[]> {
  return page.evaluate(
    ({ scope, min }) =>
      Array.from(document.querySelectorAll(scope), (root) =>
        Array.from(root.querySelectorAll("button, input, .selectable"))
      )
        .flat()
        .flatMap((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility !== "visible") return [];
          if (r.width >= min && r.height >= min) return [];
          const text = (el.textContent ?? "").trim().slice(0, 20);
          return [`${el.tagName.toLowerCase()}#${el.id} "${text}" ${Math.round(r.width)}x${Math.round(r.height)}`];
        }),
    { scope, min: MIN_TARGET }
  );
}

/**
 * Fills every empty seat label with "CHANCELLOR" and empties every full one, then puts the text
 * back. Returns how far, in px, the furthest seat box moved: a seat must not move when its
 * player becomes president or chancellor.
 */
export function labelShift(page: Page): Promise<number> {
  return page.evaluate(() => {
    const seats = Array.from(document.querySelectorAll(".table-seat"));
    const boxes = () => seats.map((seat) => seat.getBoundingClientRect());
    const before = boxes();
    const labels = seats.map((seat) => seat.querySelector("#player-display-label")!);
    // Edit React's own text node (or a stand-in) so later renders still reach it.
    const nodes = labels.map((label) => label.firstChild ?? label.appendChild(document.createTextNode("")));
    const old = nodes.map((node) => node.nodeValue);
    nodes.forEach((node, i) => (node.nodeValue = old[i] ? "" : "CHANCELLOR"));
    const after = boxes();
    nodes.forEach((node, i) => (node.nodeValue = old[i]));
    return Math.max(
      0,
      ...before.map((b, i) =>
        Math.max(
          Math.abs(after[i].left - b.left),
          Math.abs(after[i].top - b.top),
          Math.abs(after[i].right - b.right),
          Math.abs(after[i].bottom - b.bottom)
        )
      )
    );
  });
}
