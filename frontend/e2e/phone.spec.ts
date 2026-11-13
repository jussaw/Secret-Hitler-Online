import { expect, test, type Page } from "@playwright/test";
import { LONG_STATUS, overflowX, overlaps, pageHeight, smallTargets, type Box } from "./layout";
import { createLobby, joinGuests, settle, startGame, watchLobby } from "./lobby";

// Runs in the phone projects; each sets its own viewport (360x740 or 412x915).

test("the login page fits the phone", async ({ page }) => {
  const { width } = page.viewportSize()!;
  await page.goto("/");
  await settle(page);
  const overflow = await overflowX(page);
  expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
  expect(overflow.offscreen, "past the edge").toEqual([]);
  expect(await smallTargets(page, "body"), "small touch targets").toEqual([]);
});

test("text fields use 16px text, so iOS Safari does not zoom in on focus", async ({ page }) => {
  await page.goto("/");
  const sizes = await page.$$eval("input", (inputs) =>
    inputs.map((input) => parseFloat(getComputedStyle(input).fontSize))
  );
  expect(sizes.length, "login text fields").toBeGreaterThan(0);
  for (const size of sizes) expect(size, "text field font size").toBeGreaterThanOrEqual(16);
});

test("the lobby and its portrait picker fit the phone", async ({ page, baseURL }) => {
  const { width } = page.viewportSize()!;
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your Name" }).last().fill("Host Player");
  await page.getByRole("button", { name: "CREATE LOBBY" }).click();
  const portraits = page.locator("#icon.selectable:not(.disabled)");
  await portraits.first().waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  let overflow = await overflowX(page);
  expect(overflow.scrollWidth, "scrollWidth with the picker open").toBeLessThanOrEqual(width);
  expect(overflow.offscreen, "picker past the edge").toEqual([]);
  expect(await smallTargets(page, "#alert-box"), "small targets in the picker").toEqual([]);

  await portraits.first().click();
  await page.getByRole("button", { name: "CONFIRM" }).click();
  const link = await page.locator("#linkText").inputValue();
  const guests = await joinGuests(baseURL!, new URL(link).searchParams.get("lobby")!, 9);
  try {
    await expect(page.getByText("Players (10/10)")).toBeVisible();
    await settle(page);
    overflow = await overflowX(page);
    expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
    expect(overflow.offscreen, "past the edge").toEqual([]);
    expect(await smallTargets(page, "body"), "small touch targets").toEqual([]);
  } finally {
    guests.forEach((ws) => ws.close());
  }
});

/** The game page's parts, in viewport px. */
function measureGame(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const one = (selector: string) => box(document.querySelector(selector)!);
    // The height the table keeps for the tracker, read from a probe that takes it.
    const table = document.querySelector(".game-table")!;
    const probe = document.createElement("div");
    probe.style.cssText = "position: absolute; visibility: hidden; height: var(--tracker-height);";
    table.appendChild(probe);
    const trackerReserved = probe.getBoundingClientRect().height;
    probe.remove();
    const endTerm = document.querySelector(".game-decks .end-term")!;
    return {
      roster: one(".game-body > .roster"),
      rows: Array.from(document.querySelectorAll(".roster-row"), box),
      // Detail lines shown: phones show the office as a tag beside the name instead.
      details: Array.from(document.querySelectorAll(".roster-detail")).filter(
        (el) => getComputedStyle(el).display !== "none"
      ).length,
      tracker: one(".game-table > .round-tracker"),
      trackerReserved,
      decks: one(".game-decks"),
      endTerm: box(endTerm),
      endTermVisibility: getComputedStyle(endTerm).visibility,
      counts: one(".game-decks #pps-container"),
      boards: one("#board-container"),
    };
  });
}

/**
 * Shows `text` as the status line, measures the page's height and the tracker, then puts the old
 * line back. The tracker wraps "president" and "chancellor" in spans, so the line can hold several
 * text nodes: the first takes `text` and the rest are blanked. Only React's own text nodes are
 * edited (or a stand-in added), so later renders still reach them.
 */
function withStatus(page: Page, text: string): Promise<{ height: number; tracker: Box }> {
  return page.evaluate((text) => {
    const line = document.querySelector("#status-bar-text")!;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    if (nodes.length === 0) nodes.push(line.appendChild(document.createTextNode("")));
    const old = nodes.map((node) => node.nodeValue);
    nodes.forEach((node, i) => (node.nodeValue = i === 0 ? text : ""));
    const r = document.querySelector(".game-table > .round-tracker")!.getBoundingClientRect();
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    nodes.forEach((node, i) => (node.nodeValue = old[i]));
    return { height, tracker: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
  }, text);
}

const centreX = (b: Box) => (b.left + b.right) / 2;

/**
 * Every check of the phone's game page: one column of the roster, the tracker, the decks row and
 * the boards, with no scroll in either direction, even with the longest status.
 */
async function checkGame(
  page: Page,
  { players, spectator = false }: { players: number; spectator?: boolean }
) {
  const { width, height } = page.viewportSize()!;

  // The page.
  expect(await pageHeight(page), "scrollHeight").toBeLessThanOrEqual(height);
  const overflow = await overflowX(page);
  expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
  expect(overflow.offscreen, "past the edge").toEqual([]);

  const game = await measureGame(page);

  // Top to bottom: the roster, the tracker, the decks row and the boards, at full width.
  expect(game.roster.bottom, "roster above the tracker").toBeLessThanOrEqual(game.tracker.top + 1);
  expect(game.tracker.bottom, "tracker above the decks").toBeLessThanOrEqual(game.decks.top + 1);
  expect(game.decks.bottom, "decks above the boards").toBeLessThanOrEqual(game.boards.top + 1);
  expect(game.boards.right - game.boards.left, "boards at full width").toBeGreaterThanOrEqual(
    width - 24
  );

  // END TERM, centred over the counts box.
  expect(
    Math.abs(centreX(game.endTerm) - centreX(game.counts)),
    "END TERM centred on the counts box"
  ).toBeLessThanOrEqual(1);
  expect(game.endTerm.bottom, "END TERM above the counts box").toBeLessThanOrEqual(
    game.counts.top + 1
  );
  if (spectator) expect(game.endTermVisibility, "a spectator's END TERM").toBe("hidden");

  // The compact roster.
  expect(game.rows, "roster rows").toHaveLength(players);
  expect(game.details, "detail lines shown").toBe(0);
  game.rows.forEach((a, i) =>
    game.rows.slice(i + 1).forEach((b, j) => {
      expect(overlaps(a, b), `rows ${i} and ${i + 1 + j} overlap`).toBe(false);
    })
  );

  // A spectator's hidden END TERM is no target.
  expect(await smallTargets(page, ".game-screen"), "small touch targets").toEqual([]);

  // The tracker keeps the height reserved for it, so the longest status cannot make it grow or
  // the page scroll.
  expect(
    Math.abs(game.tracker.bottom - game.tracker.top - game.trackerReserved),
    `tracker height against its reserved ${game.trackerReserved}px`
  ).toBeLessThanOrEqual(0.5);
  const long = await withStatus(page, LONG_STATUS);
  expect(long.height, "scrollHeight with the longest status").toBeLessThanOrEqual(height);
  expect(
    Math.abs(long.tracker.bottom - long.tracker.top - game.trackerReserved),
    `tracker height with the longest status against its reserved ${game.trackerReserved}px`
  ).toBeLessThanOrEqual(0.5);
}

for (const players of [5, 10]) {
  test(`${players} players fit the phone without scrolling`, async ({ page, baseURL }) => {
    const guests = await startGame(page, baseURL!, players);
    try {
      await settle(page);
      await checkGame(page, { players });
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });
}

test("a phone held sideways gets the phone layout", async ({ page, baseURL }) => {
  const guests = await startGame(page, baseURL!, 10);
  try {
    await settle(page);
    const size = { width: 915, height: 412 };
    await page.setViewportSize(size);
    // The page may scroll down here, but not sideways, and it is still a touch screen.
    const overflow = await overflowX(page);
    expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(size.width);
    expect(overflow.offscreen, "past the edge").toEqual([]);
    const game = await measureGame(page);
    expect(game.roster.bottom, "roster above the tracker").toBeLessThanOrEqual(game.tracker.top + 1);
    expect(await smallTargets(page, ".game-screen"), "small touch targets").toEqual([]);
  } finally {
    guests.forEach((ws) => ws.close());
  }
});

test("a spectator's lobby and game fit the phone", async ({ page, browser, baseURL }) => {
  const { width } = page.viewportSize()!;
  // The host plays in a desktop page of its own; this phone watches.
  const host = await browser.newPage();
  const code = await createLobby(host, "Host Player");
  const guests = await joinGuests(baseURL!, code, 9);
  try {
    await watchLobby(page, code);
    await expect(page.getByText("You are watching. The game starts when the VIP starts it.")).toBeVisible();
    await expect(page.getByText("Players (10/10)")).toBeVisible();
    await settle(page);
    const overflow = await overflowX(page);
    expect(overflow.scrollWidth, "lobby scrollWidth").toBeLessThanOrEqual(width);
    expect(overflow.offscreen, "lobby past the edge").toEqual([]);
    expect(await smallTargets(page, "body"), "small touch targets in the lobby").toEqual([]);

    await host.getByRole("button", { name: "START GAME" }).click();
    await expect(page.locator(".game-screen")).toBeVisible();
    await settle(page);
    await checkGame(page, { players: 10, spectator: true });
  } finally {
    guests.forEach((ws) => ws.close());
    await host.close();
  }
});
