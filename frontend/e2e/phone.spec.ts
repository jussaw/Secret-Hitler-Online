import { expect, test } from "@playwright/test";
import { labelShift, overflowX, overlaps, smallTargets } from "./layout";
import { settle, startGame } from "./lobby";

// Runs in the phone projects; each sets its own viewport (360x740 or 412x915).

for (const players of [5, 10]) {
  test(`${players} players get the stacked game screen`, async ({ page, baseURL }) => {
    const { width } = page.viewportSize()!;
    const guests = await startGame(page, baseURL!, players);
    try {
      await settle(page);
      const positions = await page.$$eval(".table-seat", (seats) =>
        seats.map((s) => getComputedStyle(s).position)
      );
      expect(new Set(positions), "the seats form a grid").toEqual(new Set(["static"]));

      const overflow = await overflowX(page);
      expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
      expect(overflow.offscreen, "past the edge").toEqual([]);

      const rows = await page.evaluate(() => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        return {
          seats: Array.from(document.querySelectorAll(".table-seat"), box),
          status: box(document.querySelector(".game-status")!),
          boards: box(document.querySelector("#board-container")!),
          decks: box(document.querySelector(".game-decks")!),
        };
      });
      // Players, then status and END TERM, then the boards, then the decks.
      const lastSeat = Math.max(...rows.seats.map((s) => s.bottom));
      expect(lastSeat, "seats above the status").toBeLessThanOrEqual(rows.status.top + 1);
      expect(rows.status.bottom, "status above the boards").toBeLessThanOrEqual(rows.boards.top + 1);
      expect(rows.boards.bottom, "boards above the decks").toBeLessThanOrEqual(rows.decks.top + 1);
      expect(rows.boards.right - rows.boards.left, "boards at full width").toBeGreaterThanOrEqual(
        width - 24
      );
      rows.seats.forEach((a, i) =>
        rows.seats.slice(i + 1).forEach((b, j) => {
          expect(overlaps(a, b), `seats ${i} and ${i + 1 + j} overlap`).toBe(false);
        })
      );

      expect(await smallTargets(page, ".game-screen"), "small touch targets").toEqual([]);
      expect(await labelShift(page), "a filled label moves a seat").toBeLessThanOrEqual(0.5);
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });
}
