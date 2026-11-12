import { expect, type Page } from "@playwright/test";

/** How often guests ping: the server drops a game socket after 30 s without traffic. */
const PING_MS = 10_000;

/** Creates a lobby from the login page as `host`, picks the first free portrait, returns the code. */
export async function createLobby(page: Page, host: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your Name" }).last().fill(host);
  await page.getByRole("button", { name: "CREATE LOBBY" }).click();
  await page.locator("#icon.selectable:not(.disabled)").first().click();
  await page.getByRole("button", { name: "CONFIRM" }).click();
  const link = await page.locator("#linkText").inputValue();
  return new URL(link).searchParams.get("lobby")!;
}

/**
 * Joins `count` extra players to a lobby over the game WebSocket, sending the same messages the
 * browser client sends. Guest i (from 1) is "Long Guest i", twelve characters like the longest
 * name the login form allows, and takes portrait p(i + 1); the host has p1.
 * The guests never act, but they ping until closed: callers close the sockets when they are done.
 */
export async function joinGuests(
  baseURL: string,
  lobby: string,
  count: number
): Promise<WebSocket[]> {
  const guests: WebSocket[] = [];
  for (let i = 1; i <= count; i++) {
    const name = `Long Guest ${i}`;
    const url = new URL("/game", baseURL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("lobby", lobby);
    url.searchParams.set("name", name);

    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error(`${name} could not connect`)), {
        once: true,
      });
    });
    ws.send(JSON.stringify({ name, lobby, command: "select-icon", icon: `p${i + 1}` }));
    const ping = setInterval(() => ws.send(JSON.stringify({ name, lobby, command: "ping" })), PING_MS);
    ws.addEventListener("close", () => clearInterval(ping), { once: true });
    guests.push(ws);
  }
  return guests;
}

/**
 * Starts a game for `players` players as "Host Player": the server adds CPU players up to five,
 * and larger tables get guests. Returns the guests, which the caller closes.
 */
export async function startGame(page: Page, baseURL: string, players: number): Promise<WebSocket[]> {
  const lobby = await createLobby(page, "Host Player");
  // CPU players only fill a lobby up to five, so larger tables need guests.
  const guests = players > 5 ? await joinGuests(baseURL, lobby, players - 1) : [];
  try {
    await expect(page.getByText(`Players (${guests.length + 1}/10)`)).toBeVisible();
    await page.getByRole("button", { name: "START GAME" }).click();
    await expect(page.locator(".game-screen")).toBeVisible();
  } catch (error) {
    guests.forEach((ws) => ws.close());
    throw error;
  }
  return guests;
}

/**
 * Readies the page for measuring: prompts (overlays above the page) are hidden, transitions and
 * animations are off so the layout is final, and fonts and images have loaded.
 */
export async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      #alert { display: none !important; }
      *, *::before, *::after { transition: none !important; animation: none !important; }
    `,
  });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
}
