import { expect, test, type Page } from "@playwright/test";
import { makeGameState } from "../src/game/testGameState";
import { LobbyState, type Role } from "../src/types";
import { gamePacket, openFakeGame } from "./fakeGame";
import {
  BOARD_FLOOR,
  DESKTOP_SIZES,
  LONG_STATUS,
  NARROW_WINDOWS,
  SQUARE_DESKTOPS,
  overflowX,
  overlaps,
  pageHeight,
  rowShift,
  smallFieldText,
  smallTargets,
  trackerReserved,
  withStatus,
  wrappedLabels,
  type Box,
} from "./layout";
import { lobbyCode, lobbyStatusCard, longestLineLobby, settle, startGame, watchLobby } from "./lobby";

type Size = { width: number; height: number };

/** The game page's parts, in viewport px, and the height the table keeps for the tracker. */
async function measureTable(page: Page) {
  const parts = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const one = (selector: string) => box(document.querySelector(selector)!);
    const fit = (el: Element) => ({
      text: (el.textContent ?? "").trim(),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    });
    const endTerm = document.querySelector(".game-decks .end-term")!;
    const status = document.querySelector("#status-bar-text")!.textContent ?? "";
    return {
      roster: one(".game-body > .roster"),
      rows: Array.from(document.querySelectorAll(".roster-row"), box),
      userRows: document.querySelectorAll(".roster-row.is-user").length,
      // A name's own text box: a name cut short has more text than box.
      names: Array.from(document.querySelectorAll(".roster-name-text"), fit),
      // Where each row's name, its role icon and its vote slot sit.
      nameBoxes: Array.from(document.querySelectorAll(".roster-row"), (row) => {
        const icon = row.querySelector(".roster-role-icon");
        return {
          player: row.getAttribute("data-player") ?? "",
          title: row.getAttribute("title") ?? "",
          row: box(row),
          name: box(row.querySelector(".roster-name")!),
          text: box(row.querySelector(".roster-name-text")!),
          icon: icon ? box(icon) : null,
          slot: box(row.querySelector(".roster-status")!),
        };
      }),
      tracker: one(".game-table > .round-tracker"),
      status,
      boards: one("#board-container"),
      boardWidth: document.querySelector("#board")!.getBoundingClientRect().width,
      decks: one(".game-decks"),
      endTerm: box(endTerm),
      endTermVisibility: getComputedStyle(endTerm).visibility,
      draw: one(".game-deck.draw #deck-container"),
      discard: one(".game-deck.discard #deck-container"),
      countsBox: one(".game-decks #pps-container"),
      // The counts box, and each of its lines.
      counts: [
        fit(document.querySelector("#pps-container")!),
        ...Array.from(document.querySelectorAll("#pps-container > *"), fit),
      ],
      // Cards still in a pile (hidden ones fade out to the left).
      deckCards: Array.from(document.querySelectorAll(".game-decks #deck-policy.deck-final-show"), box),
    };
  });
  return { ...parts, trackerReserved: await trackerReserved(page) };
}

/** Waits for a status line in words, in place of the "---" the page starts with. */
async function statusUp(page: Page) {
  await expect(page.locator("#status-bar-text"), "the status line").toHaveText(/[a-z]/i);
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
 * The decks column, top to bottom: on desktops END TERM, the counts box, the draw pile and the
 * discard pile; tall windows keep the counts box between the piles. No pile's cards reach the
 * counts box.
 */
function checkDecksOrder(table: Awaited<ReturnType<typeof measureTable>>, desktop: boolean, at: string) {
  const { endTerm, countsBox, draw, discard } = table;
  if (desktop) {
    expect(endTerm.bottom, `END TERM above the counts box at ${at}`).toBeLessThanOrEqual(countsBox.top + 1);
    expect(countsBox.bottom, `the counts box above the draw pile at ${at}`).toBeLessThanOrEqual(draw.top + 1);
    expect(draw.bottom, `the draw pile above the discard pile at ${at}`).toBeLessThanOrEqual(discard.top + 1);
  } else {
    expect(endTerm.bottom, `END TERM above the draw pile at ${at}`).toBeLessThanOrEqual(draw.top + 1);
    expect(draw.bottom, `the draw pile above the counts box at ${at}`).toBeLessThanOrEqual(countsBox.top + 1);
    expect(countsBox.bottom, `the counts box above the discard pile at ${at}`).toBeLessThanOrEqual(discard.top + 1);
  }
  for (const card of table.deckCards) {
    expect(overlaps(card, countsBox), `a deck card over the counts box at ${at}`).toBe(false);
  }
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

  // The tracker, exactly as tall as the room the table keeps for it.
  expect(
    Math.abs(table.tracker.bottom - table.tracker.top - table.trackerReserved),
    `tracker height against its reserved ${table.trackerReserved}px at ${at}`
  ).toBeLessThanOrEqual(0.5);
  expect(Math.abs(centreX(table.tracker) - centreX(table.boards)), `tracker centred on the boards at ${at}`).toBeLessThanOrEqual(1);
  expect(table.tracker.bottom, `tracker above the boards at ${at}`).toBeLessThanOrEqual(table.boards.top + 1);

  // The decks.
  expect(overlaps(table.decks, table.boards), `decks over the boards at ${at}`).toBe(false);
  expect(overlaps(table.decks, table.tracker), `decks over the tracker at ${at}`).toBe(false);
  checkDecksOrder(table, desktop, at);
  expect(Math.abs(centreX(table.endTerm) - centreX(table.draw)), `END TERM centred on the draw pile at ${at}`).toBeLessThanOrEqual(1);
  for (const card of table.deckCards) {
    expect(overlaps(card, table.boards), `a deck card over the boards at ${at}`).toBe(false);
    expect(overlaps(card, table.endTerm), `a deck card over END TERM at ${at}`).toBe(false);
  }
  for (const line of table.counts) {
    expect(line.scrollWidth, `"${line.text}" fits the counts box at ${at}`).toBeLessThanOrEqual(line.clientWidth + 1);
  }
  if (spectator) {
    expect(table.endTermVisibility, `a spectator's END TERM at ${at}`).toBe("hidden");
  }

  // The longest status, or none, leaves the boards where they were.
  const withLong = (await withStatus(page, LONG_STATUS)).boards;
  expect(moved(table.boards, withLong), `boards move with the longest status at ${at}`).toBeLessThanOrEqual(0.5);
  const withNone = (await withStatus(page, "")).boards;
  expect(moved(table.boards, withNone), `boards move with no status at ${at}`).toBeLessThanOrEqual(0.5);

  // A label filling in moves no row and not the boards.
  expect(await rowShift(page), `a filled label moves a row at ${at}`).toBeLessThanOrEqual(0.5);

  // What was measured is the final layout, not one still animating from the last size. The card
  // is as wide as its line, so when a new line arrives in the live game meanwhile, measure again
  // until two measurements 500ms apart show the same line, then compare them exactly.
  let before = table;
  await page.waitForTimeout(500);
  let later = await measureTable(page);
  for (let tries = 0; later.status !== before.status && tries < 10; tries++) {
    before = later;
    await page.waitForTimeout(500);
    later = await measureTable(page);
  }
  expect(later.status, `the status line settles at ${at}`).toBe(before.status);
  expect(later.tracker, `the tracker settles at ${at}`).toEqual(before.tracker);
  expect(later.boards, `the boards settle at ${at}`).toEqual(table.boards);
  expect(later.endTerm, `END TERM settles at ${at}`).toEqual(table.endTerm);
  if (before !== table) {
    // The tracker checks above measured the earlier line's card; the new line's card holds them too.
    expect(
      Math.abs(later.tracker.bottom - later.tracker.top - later.trackerReserved),
      `the new line's tracker height at ${at}`
    ).toBeLessThanOrEqual(0.5);
    expect(Math.abs(centreX(later.tracker) - centreX(later.boards)), `the new line's tracker centred at ${at}`).toBeLessThanOrEqual(1);
    expect(later.tracker.bottom, `the new line's tracker above the boards at ${at}`).toBeLessThanOrEqual(later.boards.top + 1);
  }

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

/**
 * Twelve characters each, the longest the login form allows. Names in capitals and in wide mixed
 * case must fit whole wherever the game is shown. Twelve Ws cannot fit at 12px or more, so that
 * name is cut short inside its own box.
 */
const WIDE_NAMES = [
  "WOLFGANG MAX",
  "ALEXANDRA MW",
  "Wilma Wombat",
  "MARGARET ANN",
  "Long Guest 4",
  "Long Guest 5",
  "Long Guest 6",
  "Long Guest 7",
  "Long Guest 8",
];
const TOO_WIDE = "WWWWWWWWWWWW";

test("every name fits beside its role icon, on 16:9 and squarer desktops and in narrow windows", async ({
  page,
}) => {
  // A scripted game at its end, when everyone sees every role, with two players in office and one
  // executed: every name has its icon, and every kind of detail line shows. Settling hides the
  // victory screen.
  const names = [...WIDE_NAMES, TOO_WIDE];
  const game = await openFakeGame(page, names);
  const state = makeGameState(names, {
    state: LobbyState.FASCIST_VICTORY_POLICY,
    president: names[3],
    chancellor: names[6],
  });
  const roles = ["FASCIST", "HITLER", "LIBERAL", "FASCIST", "LIBERAL"] as Role[];
  names.forEach((name, i) => (state.players[name].id = roles[i % roles.length]));
  state.players[names[7]].alive = false;
  game.send({ type: "game", ...state });
  await page.locator(".game-screen").waitFor();
  await settle(page);
  expect(await page.locator(".roster-name .roster-role-icon").count(), "role icons").toBe(names.length);

  for (const [sizes, desktop] of [
    [DESKTOP_SIZES, true],
    [SQUARE_DESKTOPS, true],
    [NARROW_WINDOWS, false],
  ] as const) {
    for (const size of sizes) {
      await page.setViewportSize(size);
      const at = `${size.width}x${size.height}`;
      expect(await pageHeight(page), `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
      const overflow = await overflowX(page);
      expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
      expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);

      const table = await measureTable(page);
      for (const name of table.names.filter((n) => n.text !== TOO_WIDE)) {
        expect(name.scrollWidth, `"${name.text}" is cut off at ${at}`).toBeLessThanOrEqual(name.clientWidth + 1);
      }
      // Every name, cut short or not, its icon included, stays inside its row and clear of the
      // vote slot, and the row's title holds the whole name.
      for (const row of table.nameBoxes) {
        const of = `"${row.player}" at ${at}`;
        expect(row.title, `the title of ${of}`).toBe(row.player);
        expect(row.icon, `the role icon of ${of}`).not.toBeNull();
        for (const [part, b] of [["name", row.name], ["text", row.text], ["icon", row.icon!]] as const) {
          expect(b.right, `${part} right of ${of}, against its vote slot`).toBeLessThanOrEqual(row.slot.left);
          expect(b.left, `${part} left of ${of}, against its row`).toBeGreaterThanOrEqual(row.row.left);
        }
        expect(row.icon!.left, `the role icon after the name of ${of}`).toBeGreaterThanOrEqual(row.text.right);
      }
      for (const line of table.counts) {
        expect(line.scrollWidth, `"${line.text}" fits the counts box at ${at}`).toBeLessThanOrEqual(line.clientWidth + 1);
      }
      checkDecksOrder(table, desktop, at);
      if (desktop) {
        expect(table.roster.right, `roster left of the boards at ${at}`).toBeLessThanOrEqual(table.boards.left);
      } else {
        expect(table.roster.bottom, `roster above the tracker at ${at}`).toBeLessThanOrEqual(table.tracker.top + 1);
      }
      expect(
        Math.abs(table.tracker.bottom - table.tracker.top - table.trackerReserved),
        `tracker height against its reserved ${table.trackerReserved}px at ${at}`
      ).toBeLessThanOrEqual(0.5);
    }
  }

  // At the smallest desktop size twelve Ws really are cut short, so the checks above held for a
  // name that does not fit.
  await page.setViewportSize({ width: 1280, height: 720 });
  const tooWide = (await measureTable(page)).names.find((n) => n.text === TOO_WIDE)!;
  expect(tooWide.scrollWidth, "twelve Ws at 1280x720 are cut short").toBeGreaterThan(tooWide.clientWidth + 1);
  // Its box clips the text with an ellipsis, so none of it paints past the box.
  const clip = await page.evaluate((name) => {
    const text = document.querySelector(`.roster-row[data-player="${name}"] .roster-name-text`)!;
    const style = getComputedStyle(text);
    return { overflow: style.overflowX, ellipsis: style.textOverflow };
  }, TOO_WIDE);
  expect(clip, "how twelve Ws are cut short").toEqual({ overflow: "hidden", ellipsis: "ellipsis" });

  // The executed player's line is as readable as their greyed name.
  const executed = await page.evaluate(() => {
    const row = document.querySelector(".roster-row.is-disabled")!;
    const detail = row.querySelector(".roster-detail")!;
    return {
      text: detail.textContent,
      colour: getComputedStyle(detail).color,
      name: getComputedStyle(row.querySelector(".roster-name")!).color,
    };
  });
  expect(executed.text).toBe("EXECUTED");
  expect(executed.colour, "the EXECUTED line's colour").toBe(executed.name);
});

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

test("every media query in the page's styles parses, the phone-only query among them", async ({ page }) => {
  const game = await openFakeGame(page);
  game.send(gamePacket());
  await page.locator(".game-screen").waitFor();
  const queries = await page.evaluate(() => {
    const found: string[] = [];
    const collect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) found.push(rule.media.mediaText);
        // Grouping rules (@media, @supports, @layer) hold more rules.
        const inner = (rule as CSSGroupingRule).cssRules;
        if (inner) collect(inner);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        collect(sheet.cssRules);
      } catch {
        // A cross-origin sheet (a font stylesheet) can't be read.
      }
    }
    return Array.from(new Set(found));
  });
  expect(queries.length).toBeGreaterThan(0);
  // A browser serializes a query it can't parse as "not all", also inside a comma list.
  const parts = queries.flatMap((text) => text.split(",").map((part) => part.trim()));
  expect(parts.filter((part) => part === "not all")).toEqual([]);

  // The phone-only query is the one that matches phones, in either orientation, and not a tall
  // window. The stacked query also matches the tall window, and App.css's (max-width: 768px) misses
  // the phone held sideways.
  const matches = async (size: Size) => {
    await page.setViewportSize(size);
    return page.evaluate((texts) => texts.map((text) => matchMedia(text).matches), queries);
  };
  const portrait = await matches({ width: 360, height: 740 });
  const sideways = await matches({ width: 915, height: 412 });
  const tall = await matches({ width: 960, height: 1080 });
  const phoneOnly = queries.filter((_, i) => portrait[i] && sideways[i] && !tall[i]);
  expect(phoneOnly.length, "a query that matches phones but not tall windows").toBeGreaterThan(0);
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
    await statusUp(page);
    const options = { players: 10, spectator: true };
    for (const size of DESKTOP_SIZES) await checkLayout(page, size, { ...options, desktop: true });
    for (const size of NARROW_WINDOWS) await checkLayout(page, size, { ...options, desktop: false });
  } finally {
    sockets.forEach((ws) => ws.close());
    await host.close();
  }
});

/** The lobby page's parts, in viewport px. */
function measureLobby(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      players: box(".lobby-players"),
      main: box(".lobby-main"),
      codeCard: box(".lobby-code-card"),
      rows: document.querySelectorAll(".lobby-players .roster-row").length,
      // A name's own text box: a name cut short has more text than box.
      names: Array.from(document.querySelectorAll(".lobby-players .roster-name-text"), (el) => ({
        text: (el.textContent ?? "").trim(),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      })),
    };
  });
}

/**
 * Every lobby check at one window size. Windows 5:4 or wider put the roster in the column at the
 * left; narrower ones put it across the top, and are touch screens.
 */
async function checkLobby(page: Page, size: Size, viewer: string) {
  await page.setViewportSize(size);
  const at = `${size.width}x${size.height} for the ${viewer}`;

  expect(await pageHeight(page), `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
  const overflow = await overflowX(page);
  expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
  expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);

  const lobby = await measureLobby(page);
  expect(lobby.rows, `roster rows at ${at}`).toBe(10);
  // The status card keeps two lines' height, so the longest line does not grow it.
  const status = await lobbyStatusCard(page);
  expect(
    Math.abs(status.height - status.minHeight),
    `status card ${status.height}px against its min-height ${status.minHeight}px at ${at}`
  ).toBeLessThanOrEqual(1);
  expect(await wrappedLabels(page, ".lobby-screen"), `wrapped button labels at ${at}`).toEqual([]);
  // Twelve-character names fit whole, as they do in the game.
  for (const name of lobby.names) {
    expect(name.scrollWidth, `"${name.text}" is cut off at ${at}`).toBeLessThanOrEqual(name.clientWidth + 1);
  }
  if (size.width * 4 >= size.height * 5) {
    expect(Math.abs(lobby.players.left), `roster at the left edge at ${at}`).toBeLessThanOrEqual(0.5);
    expect(lobby.players.right, `roster left of the main column at ${at}`).toBeLessThanOrEqual(lobby.main.left);
  } else {
    expect(lobby.players.bottom, `roster above the code card at ${at}`).toBeLessThanOrEqual(lobby.codeCard.top);
    expect(await smallTargets(page, ".lobby-screen"), `small touch targets at ${at}`).toEqual([]);
    expect(await smallFieldText(page, ".lobby-screen"), `small text in text fields at ${at}`).toEqual([]);
  }
}

test("the lobby fits every desktop size and narrow window, for the host, a guest and a spectator", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  // Each viewer has a page (and cookies) of its own, with the project's browser settings.
  const guest = await browser.newPage();
  const spectator = await browser.newPage();
  try {
    const sockets = await longestLineLobby(baseURL!, { host: page, guest, spectator });
    try {
      for (const [viewer, viewerPage] of [
        ["host", page],
        ["guest", guest],
        ["spectator", spectator],
      ] as const) {
        await settle(viewerPage);
        for (const size of [...DESKTOP_SIZES, ...SQUARE_DESKTOPS, ...NARROW_WINDOWS]) {
          await checkLobby(viewerPage, size, viewer);
        }
      }
    } finally {
      sockets.forEach((ws) => ws.close());
    }
  } finally {
    await guest.close();
    await spectator.close();
  }
});
