import { expect, test, type Page } from "@playwright/test";
import { MAX_WIDE_GRID_COLUMNS, seatColumns } from "../src/game/seatPositions";
import {
  DESKTOP_SIZES,
  NARROW_WINDOWS,
  labelShift,
  overflowX,
  overlaps,
  pageHeight,
  smallTargets,
} from "./layout";
import { lobbyCode, settle, startGame, watchLobby } from "./lobby";

// The longest status message the game shows; it wraps to two lines at every desktop size.
const LONG_STATUS =
  "Chancellor has motioned to veto the agenda. Waiting for the president to decide.";

function measureTable(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const centre = document.querySelector(".game-centre")!;
    // Cards still in a pile (hidden ones fade out to the left).
    const deckCards = Array.from(document.querySelectorAll(".game-decks #deck-policy")).filter(
      (card) => card.classList.contains("deck-final-show")
    );
    return {
      seats: Array.from(document.querySelectorAll(".table-seat"), box),
      centre: box(centre),
      centreRows: Array.from(centre.children, box),
      boards: box(document.querySelector("#board-container")!),
      status: box(document.querySelector(".game-status")!),
      decks: box(document.querySelector(".game-decks")!),
      endTerm: box(document.querySelector(".game-status button")!),
      deckCards: deckCards.map(box),
    };
  });
}

/** Shows `text` in the status bar, measures the boards, then puts the old text back. */
function boardsWithStatus(page: Page, text: string) {
  return page.evaluate((text) => {
    const status = document.querySelector("#status-bar-text")!;
    // Edit React's own text node so later renders still reach it.
    const node = status.firstChild ?? status.appendChild(document.createTextNode(""));
    const old = node.nodeValue;
    const boards = () => {
      const r = document.querySelector("#board-container")!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const before = boards();
    node.nodeValue = text;
    const after = boards();
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size;
    node.nodeValue = old;
    return { before, after, lines };
  }, text);
}

for (const players of [5, 7, 10]) {
  test(`${players} players fit every desktop size without scrolling`, async ({
    page,
    baseURL,
  }) => {
    const guests = await startGame(page, baseURL!, players);
    try {
      // Prompts are overlays above the table; this test measures the table under them, as laid
      // out for each size rather than mid-transition from the previous one.
      await settle(page);

      for (const size of DESKTOP_SIZES) {
        await page.setViewportSize(size);
        const at = `${size.width}x${size.height}`;
        expect(await pageHeight(page), `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
        const { scrollWidth } = await overflowX(page);
        expect(scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);

        const positions = await page.$$eval(".table-seat", (seats) =>
          seats.map((s) => getComputedStyle(s).position)
        );
        expect(new Set(positions), `the round table at ${at}`).toEqual(new Set(["absolute"]));
        expect(await labelShift(page), `a filled label moves a seat at ${at}`).toBeLessThanOrEqual(
          0.5
        );

        const table = await measureTable(page);
        expect(table.seats, `seats at ${at}`).toHaveLength(players);
        table.seats.forEach((seat, i) => {
          expect(seat.left, `seat ${i} left at ${at}`).toBeGreaterThanOrEqual(0);
          expect(seat.top, `seat ${i} top at ${at}`).toBeGreaterThanOrEqual(0);
          expect(seat.right, `seat ${i} right at ${at}`).toBeLessThanOrEqual(size.width);
          expect(seat.bottom, `seat ${i} bottom at ${at}`).toBeLessThanOrEqual(size.height);
          expect(overlaps(seat, table.centre), `seat ${i} overlaps the centre at ${at}`).toBe(
            false
          );
          table.seats.slice(i + 1).forEach((other, j) => {
            expect(overlaps(seat, other), `seats ${i} and ${i + 1 + j} overlap at ${at}`).toBe(
              false
            );
          });
        });
        for (const card of table.deckCards) {
          expect
            .soft(overlaps(card, table.boards), `a deck card overlaps the boards at ${at}`)
            .toBe(false);
        }

        // What was measured is the final layout, not one still animating from the last size.
        await page.waitForTimeout(500);
        const later = await measureTable(page);
        expect.soft(later.centreRows, `centre rows settle at ${at}`).toEqual(table.centreRows);
        expect.soft(later.endTerm, `END TERM settles at ${at}`).toEqual(table.endTerm);

        // A status message that wraps must not resize the boards mid-game.
        const status = await boardsWithStatus(page, LONG_STATUS);
        expect(status.lines, `the long status wraps at ${at}`).toBeGreaterThanOrEqual(2);
        expect
          .soft(status.after, `boards keep their size when the status wraps at ${at}`)
          .toEqual(status.before);

        for (const row of table.centreRows) {
          expect(row.left, `centre row left at ${at}`).toBeGreaterThanOrEqual(
            table.centre.left - 1
          );
          expect(row.right, `centre row right at ${at}`).toBeLessThanOrEqual(
            table.centre.right + 1
          );
          expect(row.top, `centre row top at ${at}`).toBeGreaterThanOrEqual(
            table.centre.top - 1
          );
          expect(row.bottom, `centre row bottom at ${at}`).toBeLessThanOrEqual(
            table.centre.bottom + 1
          );
        }
      }
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });
}

test("windows narrower than 5:4 stack the table; 5:4 keeps the round table", async ({
  page,
  baseURL,
}) => {
  const guests = await startGame(page, baseURL!, 10);
  try {
    await settle(page);
    for (const [size, layout] of [
      [{ width: 960, height: 1080 }, "static"],
      [{ width: 1279, height: 1024 }, "static"],
      [{ width: 1280, height: 1024 }, "absolute"],
    ] as const) {
      await page.setViewportSize(size);
      const at = `${size.width}x${size.height}`;
      const positions = await page.$$eval(".table-seat", (seats) =>
        seats.map((s) => getComputedStyle(s).position)
      );
      expect(new Set(positions), `layout at ${at}`).toEqual(new Set([layout]));
      expect((await overflowX(page)).offscreen, `overflow at ${at}`).toEqual([]);
      const table = await measureTable(page);
      table.seats.forEach((seat, i) => {
        expect(overlaps(seat, table.boards), `seat ${i} over the boards at ${at}`).toBe(false);
      });
    }
  } finally {
    guests.forEach((ws) => ws.close());
  }
});

for (const players of [5, 7, 10]) {
  test(`${players} players fit narrow windows and upright tablets without scrolling`, async ({
    page,
    baseURL,
  }) => {
    const guests = await startGame(page, baseURL!, players);
    try {
      await settle(page);
      for (const size of NARROW_WINDOWS) {
        await page.setViewportSize(size);
        const at = `${size.width}x${size.height}`;
        expect(await pageHeight(page), `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
        const overflow = await overflowX(page);
        expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
        expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);

        const positions = await page.$$eval(".table-seat", (seats) =>
          seats.map((s) => getComputedStyle(s).position)
        );
        expect(new Set(positions), `the seat grid at ${at}`).toEqual(new Set(["static"]));

        const table = await measureTable(page);
        expect(table.seats, `seats at ${at}`).toHaveLength(players);
        table.seats.forEach((seat, i) => {
          expect(seat.top, `seat ${i} top at ${at}`).toBeGreaterThanOrEqual(0);
          expect(seat.bottom, `seat ${i} bottom at ${at}`).toBeLessThanOrEqual(size.height);
          table.seats.slice(i + 1).forEach((other, j) => {
            expect(overlaps(seat, other), `seats ${i} and ${i + 1 + j} overlap at ${at}`).toBe(
              false
            );
          });
        });
        const rows = new Set(table.seats.map((s) => Math.round(s.top))).size;
        expect(rows, `rows of seats at ${at}`).toBe(
          Math.ceil(players / seatColumns(players, MAX_WIDE_GRID_COLUMNS))
        );

        // Players, then status and END TERM, then the boards with the decks beside them.
        const lastSeat = Math.max(...table.seats.map((s) => s.bottom));
        expect(lastSeat, `seats above the status at ${at}`).toBeLessThanOrEqual(
          table.status.top + 1
        );
        expect(table.status.bottom, `status above the boards at ${at}`).toBeLessThanOrEqual(
          table.boards.top + 1
        );
        expect(table.status.bottom, `status above the decks at ${at}`).toBeLessThanOrEqual(
          table.decks.top + 1
        );
        expect(table.decks.left, `decks beside the boards at ${at}`).toBeGreaterThanOrEqual(
          table.boards.right - 1
        );
        expect(table.boards.bottom, `boards bottom at ${at}`).toBeLessThanOrEqual(size.height);
        expect(table.decks.bottom, `decks bottom at ${at}`).toBeLessThanOrEqual(size.height);
        for (const card of table.deckCards) {
          expect(overlaps(card, table.boards), `deck card over the boards at ${at}`).toBe(false);
          expect(overlaps(card, table.status), `deck card over the status at ${at}`).toBe(false);
        }

        // Tablets are touch screens.
        const targets = await smallTargets(page, ".game-screen");
        expect(targets, `small touch targets at ${at}`).toEqual([]);
        expect(await labelShift(page), `a filled label moves a seat at ${at}`).toBeLessThanOrEqual(
          0.5
        );
      }
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });
}

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
    expect(await page.locator(".table-seat #player-container.highlight").count(), "no seat is the viewer's").toBe(0);

    for (const size of DESKTOP_SIZES) {
      await page.setViewportSize(size);
      const at = `${size.width}x${size.height}`;
      expect(await pageHeight(page), `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
      expect((await overflowX(page)).scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
      const positions = await page.$$eval(".table-seat", (seats) => seats.map((s) => getComputedStyle(s).position));
      expect(new Set(positions), `the round table at ${at}`).toEqual(new Set(["absolute"]));
      const table = await measureTable(page);
      expect(table.seats, `seats at ${at}`).toHaveLength(10);
      table.seats.forEach((seat, i) => {
        expect(seat.left, `seat ${i} left at ${at}`).toBeGreaterThanOrEqual(0);
        expect(seat.top, `seat ${i} top at ${at}`).toBeGreaterThanOrEqual(0);
        expect(seat.right, `seat ${i} right at ${at}`).toBeLessThanOrEqual(size.width);
        expect(seat.bottom, `seat ${i} bottom at ${at}`).toBeLessThanOrEqual(size.height);
        expect(overlaps(seat, table.centre), `seat ${i} overlaps the centre at ${at}`).toBe(false);
        table.seats.slice(i + 1).forEach((other, j) => {
          expect(overlaps(seat, other), `seats ${i} and ${i + 1 + j} overlap at ${at}`).toBe(false);
        });
      });
      for (const row of table.centreRows) {
        expect(row.top, `centre row top at ${at}`).toBeGreaterThanOrEqual(table.centre.top - 1);
        expect(row.bottom, `centre row bottom at ${at}`).toBeLessThanOrEqual(table.centre.bottom + 1);
      }
    }

    for (const size of NARROW_WINDOWS) {
      await page.setViewportSize(size);
      const at = `${size.width}x${size.height}`;
      expect(await pageHeight(page), `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
      const overflow = await overflowX(page);
      expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
      expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);
      const table = await measureTable(page);
      table.seats.forEach((seat, i) =>
        table.seats.slice(i + 1).forEach((other, j) => {
          expect(overlaps(seat, other), `seats ${i} and ${i + 1 + j} overlap at ${at}`).toBe(false);
        })
      );
      const lastSeat = Math.max(...table.seats.map((s) => s.bottom));
      expect(lastSeat, `seats above the status at ${at}`).toBeLessThanOrEqual(table.status.top + 1);
      expect(table.status.bottom, `status above the boards at ${at}`).toBeLessThanOrEqual(table.boards.top + 1);
      expect(table.boards.bottom, `boards bottom at ${at}`).toBeLessThanOrEqual(size.height);
      // The hidden END TERM is no touch target.
      expect(await smallTargets(page, ".game-screen"), `small touch targets at ${at}`).toEqual([]);
    }
  } finally {
    sockets.forEach((ws) => ws.close());
    await host.close();
  }
});
