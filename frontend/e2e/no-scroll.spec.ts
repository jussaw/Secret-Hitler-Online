import { expect, test, type Page } from "@playwright/test";
import {
  BOARD_FLOOR,
  DESKTOP_SIZES,
  LONG_STATUS,
  NARROW_WINDOWS,
  overflowX,
  overlaps,
  pageHeight,
  rowShift,
  smallTargets,
  type Box,
} from "./layout";
import { lobbyCode, settle, startGame, watchLobby } from "./lobby";

type Size = { width: number; height: number };

/** The game page's parts, in viewport px. */
function measureTable(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const one = (selector: string) => box(document.querySelector(selector)!);
    const endTerm = document.querySelector(".game-decks .end-term")!;
    return {
      roster: one(".game-body > .roster"),
      rows: Array.from(document.querySelectorAll(".roster-row"), box),
      userRows: document.querySelectorAll(".roster-row.is-user").length,
      names: Array.from(document.querySelectorAll(".roster-name"), (el) => ({
        text: el.textContent ?? "",
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      })),
      tracker: one(".game-table > .round-tracker"),
      boards: one("#board-container"),
      boardWidth: document.querySelector("#board")!.getBoundingClientRect().width,
      decks: one(".game-decks"),
      endTerm: box(endTerm),
      endTermVisibility: getComputedStyle(endTerm).visibility,
      draw: one(".game-deck.draw #deck-container"),
      // Cards still in a pile (hidden ones fade out to the left).
      deckCards: Array.from(document.querySelectorAll(".game-decks #deck-policy.deck-final-show"), box),
    };
  });
}

/** The furthest any edge of `b` lies from the same edge of `a`, in px. */
const moved = (a: Box, b: Box) =>
  Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.right - b.right),
    Math.abs(a.top - b.top),
    Math.abs(a.bottom - b.bottom)
  );

const centreX = (b: Box) => (b.left + b.right) / 2;

/**
 * Shows `text` as the status line, measures the boards, then puts the old line back. The tracker
 * wraps "president" and "chancellor" in spans, so the line can hold several text nodes: the first
 * takes `text` and the rest are blanked. Only React's own text nodes are edited (or a stand-in
 * added), so later renders still reach them.
 */
function boardsWithStatus(page: Page, text: string): Promise<Box> {
  return page.evaluate((text) => {
    const line = document.querySelector("#status-bar-text")!;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    if (nodes.length === 0) nodes.push(line.appendChild(document.createTextNode("")));
    const old = nodes.map((node) => node.nodeValue);
    nodes.forEach((node, i) => (node.nodeValue = i === 0 ? text : ""));
    const r = document.querySelector("#board-container")!.getBoundingClientRect();
    nodes.forEach((node, i) => (node.nodeValue = old[i]));
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }, text);
}

/**
 * Every layout check at one window size. Desktop sizes put the roster at the left of the boards;
 * the narrow windows put it across the top, above the tracker, and are touch screens.
 */
async function checkLayout(
  page: Page,
  size: Size,
  { players, desktop, spectator = false }: { players: number; desktop: boolean; spectator?: boolean }
) {
  await page.setViewportSize(size);
  const at = `${size.width}x${size.height}`;

  // The page.
  expect(await pageHeight(page), `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
  const overflow = await overflowX(page);
  expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
  expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);

  const table = await measureTable(page);

  // The boards.
  expect(BOARD_FLOOR[at], `a board floor for ${at}`).toBeDefined();
  expect(table.boardWidth, `board width at ${at}`).toBeGreaterThanOrEqual(BOARD_FLOOR[at]);

  // The roster.
  expect(table.rows, `roster rows at ${at}`).toHaveLength(players);
  expect(table.userRows, `the viewer's own row at ${at}`).toBe(spectator ? 0 : 1);
  expect(overlaps(table.roster, table.tracker), `roster over the tracker at ${at}`).toBe(false);
  expect(overlaps(table.roster, table.boards), `roster over the boards at ${at}`).toBe(false);
  expect(overlaps(table.roster, table.decks), `roster over the decks at ${at}`).toBe(false);
  table.rows.forEach((row, i) => {
    table.rows.slice(i + 1).forEach((other, j) => {
      expect(overlaps(row, other), `rows ${i} and ${i + 1 + j} overlap at ${at}`).toBe(false);
    });
  });
  for (const name of table.names) {
    expect(name.scrollWidth, `"${name.text}" is cut off at ${at}`).toBeLessThanOrEqual(name.clientWidth + 1);
  }
  if (desktop) {
    expect(table.roster.right, `roster left of the boards at ${at}`).toBeLessThanOrEqual(table.boards.left);
  } else {
    expect(table.roster.bottom, `roster above the tracker at ${at}`).toBeLessThanOrEqual(table.tracker.top + 1);
    expect(table.tracker.top - table.roster.bottom, `gap under the roster at ${at}`).toBeLessThanOrEqual(24);
  }

  // The tracker.
  expect(Math.abs(centreX(table.tracker) - centreX(table.boards)), `tracker centred on the boards at ${at}`).toBeLessThanOrEqual(1);
  expect(table.tracker.bottom, `tracker above the boards at ${at}`).toBeLessThanOrEqual(table.boards.top + 1);

  // The decks.
  expect(overlaps(table.decks, table.boards), `decks over the boards at ${at}`).toBe(false);
  expect(overlaps(table.decks, table.tracker), `decks over the tracker at ${at}`).toBe(false);
  expect(table.endTerm.bottom, `END TERM above the draw pile at ${at}`).toBeLessThanOrEqual(table.draw.top + 1);
  expect(Math.abs(centreX(table.endTerm) - centreX(table.draw)), `END TERM centred on the draw pile at ${at}`).toBeLessThanOrEqual(1);
  for (const card of table.deckCards) {
    expect(overlaps(card, table.boards), `a deck card over the boards at ${at}`).toBe(false);
    expect(overlaps(card, table.endTerm), `a deck card over END TERM at ${at}`).toBe(false);
  }
  if (spectator) {
    expect(table.endTermVisibility, `a spectator's END TERM at ${at}`).toBe("hidden");
  }

  // The longest status, or none, leaves the boards where they were.
  const withLong = await boardsWithStatus(page, LONG_STATUS);
  expect(moved(table.boards, withLong), `boards move with the longest status at ${at}`).toBeLessThanOrEqual(0.5);
  const withNone = await boardsWithStatus(page, "");
  expect(moved(table.boards, withNone), `boards move with no status at ${at}`).toBeLessThanOrEqual(0.5);

  // A label filling in moves no row and not the boards.
  expect(await rowShift(page), `a filled label moves a row at ${at}`).toBeLessThanOrEqual(0.5);

  // What was measured is the final layout, not one still animating from the last size.
  await page.waitForTimeout(500);
  const later = await measureTable(page);
  expect(later.tracker, `the tracker settles at ${at}`).toEqual(table.tracker);
  expect(later.boards, `the boards settle at ${at}`).toEqual(table.boards);
  expect(later.endTerm, `END TERM settles at ${at}`).toEqual(table.endTerm);

  // Tall windows are touch screens; a spectator's hidden END TERM is no target.
  if (!desktop) {
    expect(await smallTargets(page, ".game-screen"), `small touch targets at ${at}`).toEqual([]);
  }
}

for (const players of [5, 7, 10]) {
  test(`${players} players fit every desktop size without scrolling`, async ({ page, baseURL }) => {
    const guests = await startGame(page, baseURL!, players);
    try {
      // Prompts are overlays above the table; this test measures the table under them, as laid
      // out for each size rather than mid-transition from the previous one.
      await settle(page);
      for (const size of DESKTOP_SIZES) await checkLayout(page, size, { players, desktop: true });
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });

  test(`${players} players fit narrow windows and upright tablets without scrolling`, async ({
    page,
    baseURL,
  }) => {
    const guests = await startGame(page, baseURL!, players);
    try {
      await settle(page);
      for (const size of NARROW_WINDOWS) await checkLayout(page, size, { players, desktop: false });
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });
}

test("windows narrower than 5:4 put the roster above the tracker; 5:4 keeps it at the left", async ({
  page,
  baseURL,
}) => {
  const guests = await startGame(page, baseURL!, 10);
  try {
    await settle(page);
    for (const [size, layout] of [
      [{ width: 1280, height: 1024 }, "left"],
      [{ width: 1279, height: 1024 }, "top"],
      [{ width: 960, height: 1080 }, "top"],
    ] as const) {
      await page.setViewportSize(size);
      const at = `${size.width}x${size.height}`;
      expect((await overflowX(page)).offscreen, `overflow at ${at}`).toEqual([]);
      const table = await measureTable(page);
      if (layout === "left") {
        expect(table.roster.right, `roster left of the boards at ${at}`).toBeLessThanOrEqual(table.boards.left);
      } else {
        expect(table.roster.bottom, `roster above the tracker at ${at}`).toBeLessThanOrEqual(table.tracker.top + 1);
      }
      expect(overlaps(table.roster, table.boards), `roster over the boards at ${at}`).toBe(false);
    }
  } finally {
    guests.forEach((ws) => ws.close());
  }
});

test("a spectator's view of 10 players fits every desktop size and narrow window", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  // The host plays in a page of its own; this page watches, with the project's browser settings.
  const host = await browser.newPage();
  const sockets = await startGame(host, baseURL!, 10, { spectators: 0 });
  try {
    await watchLobby(page, await lobbyCode(host));
    await expect(page.locator(".game-screen .spectator-count")).toHaveText("1");
    await settle(page);
    const options = { players: 10, spectator: true };
    for (const size of DESKTOP_SIZES) await checkLayout(page, size, { ...options, desktop: true });
    for (const size of NARROW_WINDOWS) await checkLayout(page, size, { ...options, desktop: false });
  } finally {
    sockets.forEach((ws) => ws.close());
    await host.close();
  }
});
