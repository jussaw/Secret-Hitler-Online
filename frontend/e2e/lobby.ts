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

/** Waits for the lobby's heading to count `count` players. */
export async function waitForPlayers(page: Page, count: number): Promise<void> {
  await expect(page.locator(".lobby-player-count")).toHaveText(`${count} / 10`);
}

/**
 * Joins `count` extra players to a lobby over the game WebSocket, sending the same messages the
 * browser client sends. Guest i (from 1) is "Long Guest i", twelve characters like the longest
 * name the login form allows, and takes portrait p(i + 1); the host has p1. With `pickLooks`
 * false the guests send no `select-icon` and stay on the default portrait, still picking.
 * The guests never act, but they ping until closed: callers close the sockets when they are done.
 */
export async function joinGuests(
  baseURL: string,
  lobby: string,
  count: number,
  { pickLooks = true }: { pickLooks?: boolean } = {}
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
    if (pickLooks) {
      ws.send(JSON.stringify({ name, lobby, command: "select-icon", icon: `p${i + 1}` }));
    }
    const ping = setInterval(() => ws.send(JSON.stringify({ name, lobby, command: "ping" })), PING_MS);
    ws.addEventListener("close", () => clearInterval(ping), { once: true });
    guests.push(ws);
  }
  return guests;
}

/**
 * Starts a game for `players` players as "Host Player": the server adds CPU players up to five,
 * and larger tables get guests. `spectators` raw spectator sockets watch from the lobby on (one by
 * default, so the players' headers show the spectator count). Returns the guests' and spectators'
 * sockets, which the caller closes.
 */
export async function startGame(
  page: Page,
  baseURL: string,
  players: number,
  { spectators = 1 }: { spectators?: number } = {}
): Promise<WebSocket[]> {
  const lobby = await createLobby(page, "Host Player");
  // CPU players only fill a lobby up to five, so larger tables need guests.
  const guests = players > 5 ? await joinGuests(baseURL, lobby, players - 1) : [];
  const watchers: WebSocket[] = [];
  try {
    for (let i = 0; i < spectators; i++) watchers.push(await joinSpectator(baseURL, lobby));
    await waitForPlayers(page, guests.length + 1);
    await page.getByRole("button", { name: "START GAME" }).click();
    await expect(page.locator(".game-screen")).toBeVisible();
    if (spectators > 0) {
      await expect(page.locator(".game-screen .spectator-count")).toHaveText(String(spectators));
    }
  } catch (error) {
    [...guests, ...watchers].forEach((ws) => ws.close());
    throw error;
  }
  return [...guests, ...watchers];
}

/** The lobby code a page last joined, watched or created (the client keeps it in a cookie). */
export async function lobbyCode(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((c) => c.name === "lobby");
  if (!cookie) throw new Error("the page has joined no lobby");
  return cookie.value;
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
  expect(await missingFonts(page), "the web fonts failed to load").toEqual([]);
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
}

/** The web fonts the layouts are measured in (fonts.css), as `font` shorthands. */
const WEB_FONTS = ['16px "Germania One"', "500 16px Montserrat", "bold 16px Montserrat"];

/**
 * The WEB_FONTS that have not loaded. check() alone is not enough: it is true for a family the
 * page has no face for (when the Google Fonts stylesheet fails), and false for a face no text on
 * the page has used yet. So each face is loaded first, and its family must be in the set.
 */
function missingFonts(page: Page): Promise<string[]> {
  return page.evaluate(async (fonts) => {
    await Promise.all(fonts.map((font) => document.fonts.load(font).catch(() => [])));
    const families = new Set<string>();
    document.fonts.forEach((face) => families.add(face.family.replace(/"/g, "")));
    return fonts.filter((font) => {
      const family = font.replace(/^.*px /, "").replace(/"/g, "");
      return !families.has(family) || !document.fonts.check(font);
    });
  }, WEB_FONTS);
}

/** Opens a raw spectator socket on `lobby` that pings until closed; the caller closes it. */
export async function joinSpectator(baseURL: string, lobby: string): Promise<WebSocket> {
  const url = new URL("/game", baseURL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("lobby", lobby);
  url.searchParams.set("spectator", "true");
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("the spectator could not connect")), { once: true });
  });
  const ping = setInterval(() => ws.send(JSON.stringify({ name: "", lobby, command: "ping" })), PING_MS);
  ws.addEventListener("close", () => clearInterval(ping), { once: true });
  return ws;
}

/** Joins `lobby` from the login form as `name`, picks the first free portrait, and waits for the lobby. */
export async function joinLobby(page: Page, lobby: string, name: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Lobby" }).fill(lobby);
  await page.getByRole("textbox", { name: "Your Name" }).first().fill(name);
  await page.getByRole("button", { name: "JOIN" }).click();
  await page.locator("#icon.selectable:not(.disabled)").first().click();
  await page.getByRole("button", { name: "CONFIRM" }).click();
  await page.locator("#linkText").waitFor();
}

/** What a spectator reads in `longestLineLobby`, the longest status line the lobby shows. */
export const LONGEST_LOBBY_LINE =
  "You are watching. Waiting for Long Guest 1 and 7 others to pick a look.";

/**
 * Ten players and the longest status line: `host` creates the lobby as "Host Player" and picks a
 * look, eight raw guests stay on the default portrait, still picking, and `guest` joins from the
 * login form as "Long Guest 9" and picks a look; then `spectator` watches. The host and the guest
 * read the line without its "You are watching. ". Returns the raw guests' sockets, which the
 * caller closes.
 */
export async function longestLineLobby(
  baseURL: string,
  { host, guest, spectator }: { host: Page; guest: Page; spectator: Page }
): Promise<WebSocket[]> {
  const lobby = await createLobby(host, "Host Player");
  const guests = await joinGuests(baseURL, lobby, 8, { pickLooks: false });
  try {
    await joinLobby(guest, lobby, "Long Guest 9");
    await watchLobby(spectator, lobby);
    const playerLine = LONGEST_LOBBY_LINE.replace("You are watching. ", "");
    for (const page of [host, guest, spectator]) await waitForPlayers(page, 10);
    await expect(host.locator("#lobby-status-text")).toHaveText(playerLine);
    await expect(guest.locator("#lobby-status-text")).toHaveText(playerLine);
    await expect(spectator.locator("#lobby-status-text")).toHaveText(LONGEST_LOBBY_LINE);
  } catch (error) {
    guests.forEach((ws) => ws.close());
    throw error;
  }
  return guests;
}

/** Watches `lobby` from the login form, and waits for its lobby or game page. */
export async function watchLobby(page: Page, lobby: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Lobby" }).fill(lobby);
  await page.getByRole("button", { name: "WATCH" }).click();
  await page.locator("#linkText, .game-screen").first().waitFor();
}
