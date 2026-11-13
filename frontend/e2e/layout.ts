import type { Page } from "@playwright/test";

export const DESKTOP_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1920, height: 937 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

/**
 * Desktop windows squarer than 16:9 (5:4, 4:3 and 16:10 screens), where the roster column's width,
 * not the window's height, sets the size of the roster's text.
 */
export const SQUARE_DESKTOPS = [
  { width: 1280, height: 1024 },
  { width: 1280, height: 960 },
  { width: 1440, height: 900 },
  { width: 1600, height: 1280 },
  { width: 1680, height: 1050 },
];

/**
 * Windows narrower than 5:4 and at least 700px wide (half-screen desktop windows, upright monitors
 * and tablets, and near-square windows): the roster runs across the top, above the tracker, and
 * the game fits one screen.
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
  // Dragged windows, near square.
  { width: 903, height: 903 },
  { width: 990, height: 793 },
];

/** The narrowest phone supported, where the page may scroll down (but never sideways). */
export const NARROW_PHONE = { width: 320, height: 568 };

/**
 * The narrowest each board (the first #board image) may be, in CSS px, keyed "WxH", for every
 * player count. At the five desktop sizes these are 90% of the design mockup's widths; in the
 * other windows, the widths the round table reached before the roster replaced it.
 */
export const BOARD_FLOOR: Record<string, number> = {
  "1920x1080": 999,
  "1920x937": 867,
  "1600x900": 833,
  "1366x768": 710,
  "1280x720": 666,
  "1279x1024": 690,
  "1080x1920": 768,
  "1280x1440": 1023,
  "1024x1366": 775,
  "960x1080": 739,
  "820x1180": 592,
  "744x1133": 522,
  "700x900": 506,
  "800x700": 439,
  "903x903": 597,
  "990x793": 513,
};

/** The longest status line the game shows. */
export const LONG_STATUS =
  "Chancellor has motioned to veto the agenda. Waiting for the president to decide.";

/** Touch targets on phones are at least this many CSS px wide and tall. */
export const MIN_TARGET = 44;

/** Text fields' text is at least this many CSS px, so iOS Safari does not zoom in on focus. */
export const MIN_FIELD_TEXT = 16;

export type Box = { left: number; right: number; top: number; bottom: number };

/** Firefox lays boxes out unrounded, so boxes that touch can share a few millionths of a px. */
const TOUCHING = 0.01;

export const overlaps = (a: Box, b: Box) =>
  a.left < b.right - TOUCHING &&
  b.left < a.right - TOUCHING &&
  a.top < b.bottom - TOUCHING &&
  b.top < a.bottom - TOUCHING;

/**
 * How far the page scrolls vertically. `body` scrolls by itself (App.css hides its overflow-x, so
 * its overflow-y is auto), so a page that fits the window can still grow `body`.
 */
export function pageHeight(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  );
}

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
 * Text fields inside `scope` whose text is smaller than MIN_FIELD_TEXT, as `input#id 13px`. Throws
 * when `scope` holds no text field, so a check that finds none small has measured something.
 */
export function smallFieldText(page: Page, scope: string): Promise<string[]> {
  return page.evaluate(
    ({ scope, min }) => {
      const fields = Array.from(document.querySelectorAll(`${scope} input`));
      if (fields.length === 0) throw new Error(`no text field in ${scope}`);
      return fields.flatMap((el) => {
        const size = parseFloat(getComputedStyle(el).fontSize);
        return size >= min ? [] : [`${el.tagName.toLowerCase()}#${el.id} ${size}px`];
      });
    },
    { scope, min: MIN_FIELD_TEXT }
  );
}

/**
 * Button labels inside `scope` that wrap onto more than one line, as `"text" n lines`. Each text
 * node is measured by itself, one rect per line, so a button's icon is never counted as a line.
 */
export function wrappedLabels(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((scope) => {
    const wrapped: string[] = [];
    for (const button of Array.from(document.querySelectorAll(`${scope} button`))) {
      const r = button.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(button).visibility !== "visible") continue;
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.nodeValue ?? "").trim();
        if (!text) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const lines = range.getClientRects().length;
        if (lines > 1) wrapped.push(`"${text}" ${lines} lines`);
      }
    }
    return wrapped;
  }, scope);
}

/**
 * The height the game table keeps for the round tracker (`--tracker-height`, GameScreen.css), read
 * from a hidden probe that takes it.
 */
export function trackerReserved(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position: absolute; visibility: hidden; height: var(--tracker-height);";
    document.querySelector(".game-table")!.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
}

/**
 * Shows `text` as the status line, measures the tracker, the boards and the page's height (as
 * pageHeight does), then puts the old line back. The tracker wraps "president" and "chancellor" in
 * spans, so the line can hold several text nodes: the first takes `text` and the rest are blanked.
 * Only React's own text nodes are edited (or a stand-in added), so later renders still reach them.
 */
export function withStatus(
  page: Page,
  text: string
): Promise<{ tracker: Box; boards: Box; height: number }> {
  return page.evaluate((text) => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const line = document.querySelector("#status-bar-text")!;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    if (nodes.length === 0) nodes.push(line.appendChild(document.createTextNode("")));
    const old = nodes.map((node) => node.nodeValue);
    nodes.forEach((node, i) => (node.nodeValue = i === 0 ? text : ""));
    const measured = {
      tracker: box(document.querySelector(".game-table > .round-tracker")!),
      boards: box(document.querySelector("#board-container")!),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    };
    nodes.forEach((node, i) => (node.nodeValue = old[i]));
    return measured;
  }, text);
}

/**
 * Fills every empty `selector` element (default: the roster detail line) with `text` and empties
 * every full one, then puts the text back. Returns how far, in px, the furthest roster row or the
 * boards moved: nothing may move when a player becomes president or chancellor, is executed or
 * has their role shown.
 */
export function rowShift(
  page: Page,
  selector = ".roster-detail",
  text = "CHANCELLOR"
): Promise<number> {
  return page.evaluate(([target, fill]) => {
    const watched = [
      ...Array.from(document.querySelectorAll(".roster-row")),
      document.querySelector("#board-container")!,
    ];
    const boxes = () => watched.map((el) => el.getBoundingClientRect());
    const before = boxes();
    const details = Array.from(document.querySelectorAll(target));
    // Edit React's own text node (or a stand-in) so later renders still reach it.
    const nodes = details.map(
      (detail) => detail.firstChild ?? detail.appendChild(document.createTextNode(""))
    );
    const old = nodes.map((node) => node.nodeValue);
    nodes.forEach((node, i) => (node.nodeValue = old[i] ? "" : fill));
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
  }, [selector, text]);
}
