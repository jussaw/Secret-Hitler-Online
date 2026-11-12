import { expect, test, type Page } from "@playwright/test";
import { joinGuests } from "./guests";

const DESKTOP_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1920, height: 937 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

type Box = { left: number; right: number; top: number; bottom: number };

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function createLobby(page: Page, host: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your Name" }).last().fill(host);
  await page.getByRole("button", { name: "CREATE LOBBY" }).click();
  await page.locator("#icon.selectable:not(.disabled)").first().click();
  await page.getByRole("button", { name: "CONFIRM" }).click();
  const link = await page.locator("#linkText").inputValue();
  return new URL(link).searchParams.get("lobby")!;
}

function measureTable(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const centre = document.querySelector(".game-centre")!;
    return {
      seats: Array.from(document.querySelectorAll(".table-seat"), box),
      centre: box(centre),
      centreRows: Array.from(centre.children, box),
    };
  });
}

for (const players of [5, 7, 10]) {
  test(`${players} players fit every desktop size without scrolling`, async ({
    page,
    baseURL,
  }) => {
    const lobby = await createLobby(page, "Host Player");
    // CPU players only fill a lobby up to five, so larger tables need guests.
    const guests = players > 5 ? await joinGuests(baseURL!, lobby, players - 1) : [];
    try {
      await expect(page.getByText(`Players (${guests.length + 1}/10)`)).toBeVisible();
      await page.getByRole("button", { name: "START GAME" }).click();
      await expect(page.locator(".game-screen")).toBeVisible();
      // Prompts are overlays above the table; this test measures the table under them.
      await page.addStyleTag({ content: "#alert { display: none !important; }" });
      await page.waitForFunction(() =>
        Array.from(document.images).every((img) => img.complete)
      );

      for (const size of DESKTOP_SIZES) {
        await page.setViewportSize(size);
        const at = `${size.width}x${size.height}`;
        const scroll = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }));
        expect(scroll.height, `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
        expect(scroll.width, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);

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
