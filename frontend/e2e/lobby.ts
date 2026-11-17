import { expect, type Locator, type Page } from "@playwright/test";
import { CONTACT_ERROR } from "../src/lobby/joinError";
import type { Box } from "./layout";
import {
  LONGEST_DISCORD_NAME,
  playerSocket,
  signInPage,
  signInRaw,
  signedInMe,
  signedOutMe,
  stubMe,
  uniqueName,
} from "./accounts";

/** How often guests ping: the server drops a game socket after 30 s without traffic. */
const PING_MS = 10_000;

/** The login page's lobby code field, which JOIN and WATCH share. */
export function codeField(page: Page): Locator {
  return page.getByRole("textbox", { name: "Lobby code", exact: true });
}

/** Picks the first free portrait in the open portrait picker and confirms it. */
export async function pickPortrait(page: Page): Promise<void> {
  await page.locator("#icon.selectable:not(.disabled)").first().click();
  await page.getByRole("button", { name: "CONFIRM" }).click();
}

/**
 * Signs `page` in as `host` (a name from uniqueName), creates a lobby from the login page, picks
 * the first free portrait, and returns the code.
 */
export async function createLobby(page: Page, host: string): Promise<string> {
  await signInPage(page, host);
  await page.goto("/");
  await page.getByRole("button", { name: "CREATE LOBBY" }).click();
  await pickPortrait(page);
  const link = await page.locator("#linkText").inputValue();
  return new URL(link).searchParams.get("lobby")!;
}

/** Waits for the lobby's heading to count `count` players. */
export async function waitForPlayers(page: Page, count: number): Promise<void> {
  await expect(page.locator(".lobby-player-count")).toHaveText(`${count} / 10`);
}

/** A raw guest's socket, with the name its account plays under. */
export type Guest = WebSocket & { name: string };

/**
 * Joins `count` extra players to a lobby over the game WebSocket, each signed in as an account of
 * its own, sending the same messages the browser client sends. Guest i (from 1) is
 * uniqueName("Long Guest i"), twelve characters like the longest name an account can have, and
 * takes portrait p(i + 1); the host has p1. With `pickLooks` false the guests send no
 * `select-icon` and stay on the default portrait, still picking. The guests never act, but they
 * ping until closed: callers close the sockets when they are done.
 */
export async function joinGuests(
  baseURL: string,
  lobby: string,
  count: number,
  { pickLooks = true }: { pickLooks?: boolean } = {}
): Promise<Guest[]> {
  const guests: Guest[] = [];
  try {
    for (let i = 1; i <= count; i++) {
      const name = uniqueName(`Long Guest ${i}`);
      const socket = await playerSocket(baseURL, lobby, await signInRaw(baseURL, name));
      const ws = Object.assign(socket, { name });
      if (pickLooks) {
        ws.send(JSON.stringify({ name, lobby, command: "select-icon", icon: `p${i + 1}` }));
      }
      const ping = setInterval(() => ws.send(JSON.stringify({ name, lobby, command: "ping" })), PING_MS);
      ws.addEventListener("close", () => clearInterval(ping), { once: true });
      guests.push(ws);
    }
  } catch (error) {
    guests.forEach((ws) => ws.close()); // a failed join must not leave the earlier guests pinging
    throw error;
  }
  return guests;
}

/**
 * Starts a game for `players` players as uniqueName("Host Player"): the server adds CPU players up
 * to five, and larger tables get guests. `spectators` raw spectator sockets watch from the lobby on
 * (one by default, so the players' headers show the spectator count). Returns the guests' and
 * spectators' sockets, which the caller closes.
 */
export async function startGame(
  page: Page,
  baseURL: string,
  players: number,
  { spectators = 1 }: { spectators?: number } = {}
): Promise<WebSocket[]> {
  const lobby = await createLobby(page, uniqueName("Host Player"));
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

/** Waits for a prompt to open and for every animation of the prompt overlay to finish. */
export async function waitForPrompt(page: Page): Promise<void> {
  await page.locator("#alert-box.appear-custom-alert").waitFor();
  await page.waitForFunction(() =>
    document
      .getElementById("alert")!
      .getAnimations({ subtree: true })
      .every((a) => a.playState === "finished")
  );
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

/**
 * Signs `page` in as `name` (a name from uniqueName), joins `lobby` from the login page, picks the
 * first free portrait, and waits for the lobby.
 */
export async function joinLobby(page: Page, lobby: string, name: string): Promise<void> {
  await signInPage(page, name);
  await page.goto("/");
  await codeField(page).fill(lobby);
  await page.getByRole("button", { name: "JOIN" }).click();
  await pickPortrait(page);
  await page.locator("#linkText").waitFor();
}

/**
 * Ten players and the longest status line: `host` creates the lobby as uniqueName("Host Player")
 * and picks a look, eight raw guests stay on the default portrait, still picking, and `guest` joins
 * from the login page as uniqueName("Long Guest 9") and picks a look; then each of `spectators`
 * watches, signed in or not as the caller left it. Every name has twelve characters, the longest
 * an account can have. Returns the raw guests' sockets, which the caller closes, and the line a
 * spectator reads ("You are watching. Waiting for <the first raw guest> and 7 others to pick a
 * look."); the host and the guest read it without its "You are watching. ".
 */
export async function longestLineLobby(
  baseURL: string,
  { host, guest, spectators }: { host: Page; guest: Page; spectators: Page[] }
): Promise<{ sockets: WebSocket[]; line: string }> {
  const lobby = await createLobby(host, uniqueName("Host Player"));
  const guests = await joinGuests(baseURL, lobby, 8, { pickLooks: false });
  try {
    await joinLobby(guest, lobby, uniqueName("Long Guest 9"));
    for (const spectator of spectators) await watchLobby(spectator, lobby);
    const playerLine = `Waiting for ${guests[0].name} and 7 others to pick a look.`;
    const line = `You are watching. ${playerLine}`;
    for (const page of [host, guest, ...spectators]) await waitForPlayers(page, 10);
    await expect(host.locator("#lobby-status-text")).toHaveText(playerLine);
    await expect(guest.locator("#lobby-status-text")).toHaveText(playerLine);
    for (const spectator of spectators) {
      await expect(spectator.locator("#lobby-status-text")).toHaveText(line);
    }
    return { sockets: guests, line };
  } catch (error) {
    guests.forEach((ws) => ws.close());
    throw error;
  }
}

/**
 * One viewer of a lobby layout test: who it is, its page, the players its lobby has, the buttons it
 * gets (actionLabels) and, for a spectator, the note under them (#lobby-note, "" for none).
 */
export type LobbyViewer = { viewer: string; page: Page; players: number; buttons: string[]; note?: string };

const PLAYER_BUTTONS = ["CHANGE NAME", "CHANGE LOOK", "WATCH INSTEAD", "LEAVE LOBBY"];
const FULL_NOTE = "The lobby is full (10 / 10). You can play when a seat frees up.";

/**
 * A signed-in spectator's longest note, on `page`: PLAY INSTEAD's CONTACT_ERROR, from a
 * /check-login that never answers, in a lobby with a seat free, where the note is not the full
 * lobby's. The lobby has nine raw guests, all still picking a look, so the spectator reads the
 * longest line too ("You are watching. Waiting for <the first guest> and 8 others to pick a
 * look."); a raw account that never joins makes it. Returns the guests' sockets, which the caller
 * closes.
 */
async function failedPlayInstead(baseURL: string, page: Page): Promise<WebSocket[]> {
  const maker = await signInRaw(baseURL, uniqueName("Maker"));
  const made = await fetch(new URL("/new-lobby", baseURL), { headers: { Cookie: maker } });
  if (made.status !== 200) throw new Error(`/new-lobby answered ${made.status}: ${await made.text()}`);
  const lobby = await made.text();
  const guests = await joinGuests(baseURL, lobby, 9, { pickLooks: false });
  try {
    await signInPage(page, uniqueName("Watcher"));
    await watchLobby(page, lobby);
    await waitForPlayers(page, 9);
    await expect(page.locator("#lobby-status-text")).toHaveText(
      `You are watching. Waiting for ${guests[0].name} and 8 others to pick a look.`
    );
    await page.route("**/check-login?**", (route) => route.abort());
    await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
    await expect(page.locator("#lobby-note")).toHaveText(CONTACT_ERROR);
    return guests;
  } catch (error) {
    guests.forEach((ws) => ws.close());
    throw error;
  }
}

/**
 * longestLineLobby, seen by every kind of viewer, each on a page of its own: the host and a guest
 * (the four player buttons, the host START GAME above them), and three spectators, signed in
 * (PLAY INSTEAD, off in the full lobby), signed out on a server with Discord sign-in (SIGN IN TO
 * PLAY, a link), and signed out on one without (SIGN IN TO PLAY off); both signed-out pages' /me
 * are stubbed. A sixth, `failed`, is a signed-in spectator of another lobby, with a seat free,
 * whose PLAY INSTEAD could not reach the server: the longest note a spectator gets
 * (failedPlayInstead). Returns the raw guests' sockets, which the caller closes.
 */
export async function longestLineViewers(
  baseURL: string,
  pages: { host: Page; guest: Page; signedIn: Page; signedOut: Page; noDiscord: Page; failed: Page }
): Promise<{ sockets: WebSocket[]; viewers: LobbyViewer[] }> {
  const { host, guest, signedIn, signedOut, noDiscord, failed } = pages;
  await signInPage(signedIn, uniqueName("Watcher"));
  // Both signed-out pages' /me are stubbed, so the server's own Discord setting decides neither.
  await stubMe(signedOut, signedOutMe({ discord: true }));
  await stubMe(noDiscord, signedOutMe({ discord: false }));
  const { sockets } = await longestLineLobby(baseURL, { host, guest, spectators: [signedIn, signedOut, noDiscord] });
  try {
    sockets.push(...(await failedPlayInstead(baseURL, failed)));
  } catch (error) {
    sockets.forEach((ws) => ws.close());
    throw error;
  }
  return {
    sockets,
    viewers: [
      { viewer: "host", page: host, players: 10, buttons: ["START GAME", ...PLAYER_BUTTONS] },
      { viewer: "guest", page: guest, players: 10, buttons: PLAYER_BUTTONS },
      {
        viewer: "signed-in spectator",
        page: signedIn,
        players: 10,
        buttons: ["PLAY INSTEAD", "LEAVE LOBBY"],
        note: FULL_NOTE,
      },
      {
        viewer: "signed-out spectator",
        page: signedOut,
        players: 10,
        buttons: ["SIGN IN TO PLAY", "LEAVE LOBBY"],
        note: FULL_NOTE,
      },
      {
        viewer: "signed-out spectator without Discord",
        page: noDiscord,
        players: 10,
        buttons: ["SIGN IN TO PLAY", "LEAVE LOBBY"],
        note: "Sign-in is not set up on this server.",
      },
      {
        viewer: "signed-in spectator whose PLAY INSTEAD failed",
        page: failed,
        players: 9,
        buttons: ["PLAY INSTEAD", "LEAVE LOBBY"],
        note: CONTACT_ERROR,
      },
    ],
  };
}

/** The labels of the lobby's buttons under its status line (links in a button's look among them). */
export async function actionLabels(page: Page): Promise<string[]> {
  const labels = await page.locator(".lobby-actions").locator("button, .button-link").allInnerTexts();
  return labels.map((label) => label.trim());
}

/**
 * The lobby's status card: its height and its computed `min-height`, which keeps it two lines tall
 * whatever its line holds.
 */
export function lobbyStatusCard(page: Page): Promise<{ height: number; minHeight: number }> {
  return page.evaluate(() => {
    const card = document.querySelector(".lobby-status")!;
    return {
      height: card.getBoundingClientRect().height,
      minHeight: parseFloat(getComputedStyle(card).minHeight),
    };
  });
}

/**
 * How the login page's account card is shown: signed out on a server with Discord sign-in, signed
 * out on one without (SIGN IN WITH DISCORD off), signed in with the widest Discord username
 * (Sign out on the third line of its paragraph), or signed in with the shortest (Sign out on the
 * line just under CHANGE NAME). The tests' server has the test sign-in, so signed out the card has
 * TEST SIGN-IN too.
 */
export type LoginState = "signed out" | "signed out, no Discord" | "signed in" | "signed in, short Discord name";

export const LOGIN_STATES: LoginState[] = [
  "signed out",
  "signed out, no Discord",
  "signed in",
  "signed in, short Discord name",
];

/** The shortest Discord username Discord allows. */
const SHORTEST_DISCORD_NAME = "ab";

/**
 * Opens the login page at its fullest in `state`, with a lobby code and the longest error under
 * every card that can show one: under the account card, the server unreachable (TEST SIGN-IN
 * failing signed out, Sign out failing signed in); under JOIN and WATCH, the server unreachable
 * (WATCH signed out, JOIN signed in); and signed in, under CREATE LOBBY, the server refusing a new
 * lobby. Signed in, the account is a Discord one named in wide capitals, with the widest Discord
 * username or the shortest. /me and every request are stubbed, so nothing reaches the server.
 */
export async function longestLogin(page: Page, state: LoginState): Promise<void> {
  await page.route("**/check-login?**", (route) => route.abort());
  await page.route("**/new-lobby", (route) => route.fulfill({ status: 500 }));
  await page.route("**/auth/test-sign-in", (route) => route.abort());
  await page.route("**/auth/sign-out", (route) => route.fulfill({ status: 500 }));
  const signedIn = state.startsWith("signed in");
  const discordName = state === "signed in" ? LONGEST_DISCORD_NAME : SHORTEST_DISCORD_NAME;
  await stubMe(
    page,
    signedIn ? signedInMe("WOLFGANG MAX", discordName) : signedOutMe({ discord: state === "signed out" })
  );
  await page.goto("/?lobby=ABCD");
  const error = (card: string) => page.locator(`.login-${card} .login-error`);
  if (signedIn) {
    await page.getByRole("button", { name: "JOIN" }).click();
    await page.getByRole("button", { name: "CREATE LOBBY" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(error("start")).toHaveText(/error connecting to the server/);
  } else {
    await page.getByRole("button", { name: "WATCH" }).click();
    await page.getByRole("button", { name: "TEST SIGN-IN" }).click();
  }
  await expect(error("join")).toHaveText(/error contacting the server/);
  await expect(error("account")).toHaveText(/error contacting the server/);
  if (signedIn) await expect(page.locator(".login-account-name")).toHaveText("WOLFGANG MAX");
}

/**
 * Signed in, the boxes of the account card's Sign out and CHANGE NAME. Sign out's 44px target
 * reaches past its line, and must not cover CHANGE NAME's face or the shadow under it, which take
 * CHANGE NAME's presses.
 */
export function accountTargets(page: Page): Promise<{ signOut: Box; changeName: Box }> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return { signOut: box(".login-account .login-sign-out"), changeName: box(".login-account .login-change-name") };
  });
}

/** Watches `lobby` from the login page, and waits for its lobby or game page. */
export async function watchLobby(page: Page, lobby: string): Promise<void> {
  await page.goto("/");
  await codeField(page).fill(lobby);
  await page.getByRole("button", { name: "WATCH" }).click();
  await page.locator("#linkText, .game-screen").first().waitFor();
}
