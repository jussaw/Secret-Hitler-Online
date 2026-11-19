import { expect, type Locator, type Page } from "@playwright/test";
import { CONTACT_ERROR } from "../src/lobby/joinError";
import type { BotSkill } from "../src/types";
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

/** The lobby roster's rows of people: not the bots' rows after them (#70). */
export const PEOPLE_ROWS = ".lobby-players li.roster-row:not(.is-bot)";

/**
 * Waits for the lobby's roster to list `count` people. The heading counts the bots too, so it is
 * no count of people.
 */
export async function waitForPlayers(page: Page, count: number, options?: { timeout?: number }): Promise<void> {
  await expect(page.locator(PEOPLE_ROWS)).toHaveCount(count, options);
}

/**
 * Every bot row whose box is not a person's row's size (#70), as "<bot>: <w>x<h> against
 * <w>x<h>": empty when the bots' rows match the first person's, or there are none.
 */
export function botRowMismatches(page: Page): Promise<string[]> {
  return page.evaluate((peopleRows) => {
    const person = document.querySelector(peopleRows)?.getBoundingClientRect();
    if (!person) return [];
    const size = (r: DOMRect) => `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`;
    return Array.from(document.querySelectorAll<HTMLElement>(".lobby-players li.roster-row.is-bot")).flatMap((bot) => {
      const r = bot.getBoundingClientRect();
      const same = Math.abs(r.width - person.width) <= 0.5 && Math.abs(r.height - person.height) <= 0.5;
      return same ? [] : [`${bot.dataset.bot}: ${size(r)} against ${size(person)}`];
    });
  }, PEOPLE_ROWS);
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
 * page has no face for (as when fonts.css fails to load), and false for a face no text on the
 * page has used yet. So each face is loaded first, and its family must be in the set.
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
 * One viewer of a lobby layout test: who it is, its page, the people and the bots its lobby has,
 * the buttons it gets (actionLabels), whether it is a player, with a player's four buttons
 * (playerButtonRows), the bots' level it sees (skillShown) and, for a spectator, the note under its
 * buttons (#lobby-note, "" for none).
 */
export type LobbyViewer = {
  viewer: string;
  page: Page;
  players: number;
  bots: number;
  buttons: string[];
  player: boolean;
  skill: BotSkill;
  note?: string;
};

const PLAYER_BUTTONS = ["CHANGE NAME", "CHANGE LOOK", "WATCH INSTEAD", "LEAVE LOBBY"];
/**
 * The host's: the bot stepper's two buttons, by their names, START GAME, the BOT SKILL row's three
 * (#72) and a player's four.
 */
const HOST_BUTTONS = ["Fewer bots", "More bots", "START GAME", "EASY", "NORMAL", "HARD", ...PLAYER_BUTTONS];
const FULL_NOTE = "The lobby is full (10 / 10). You can play when a seat frees up.";

/**
 * Ten seats with a bot among them (#70), and a signed-in spectator's longest note: `host` creates
 * the lobby as uniqueName("Host Player") and picks a look, eight raw guests stay on the default
 * portrait, still picking, the host's stepper adds the one bot nine people leave room for, and the
 * host's BOT SKILL row chooses HARD (#72), which the spectator, watching after it, sees.
 * The host reads the longest line a player gets ("Waiting for <the first guest> and 7 others to
 * pick a look."), and `page`, a signed-in spectator, the longest a spectator gets, then presses
 * PLAY INSTEAD against a /check-login that never answers: CONTACT_ERROR, the longest note, in a
 * lobby with a seat free, where the note is not the full lobby's. Returns the guests' sockets,
 * which the caller closes.
 */
async function failedPlayInstead(baseURL: string, host: Page, page: Page): Promise<WebSocket[]> {
  const lobby = await createLobby(host, uniqueName("Host Player"));
  const guests = await joinGuests(baseURL, lobby, 8, { pickLooks: false });
  try {
    await waitForPlayers(host, 9);
    await host.getByRole("button", { name: "More bots" }).click();
    await expect(host.locator(".lobby-player-count")).toHaveText("10 / 10");
    await expect(host.getByRole("button", { name: "More bots" })).toBeDisabled();
    const hard = host.getByRole("group", { name: "Bot skill" }).getByRole("button", { name: "HARD" });
    await hard.click();
    await expect(hard).toHaveAttribute("aria-pressed", "true");
    const playerLine = `Waiting for ${guests[0].name} and 7 others to pick a look.`;
    await expect(host.locator("#lobby-status-text")).toHaveText(playerLine);
    await signInPage(page, uniqueName("Watcher"));
    await watchLobby(page, lobby);
    await waitForPlayers(page, 9);
    await expect(page.locator(".lobby-players li.roster-row.is-bot")).toHaveCount(1);
    // The server's level, sent to a spectator who came after the press.
    await expect(page.locator(".lobby-skill-level")).toHaveText("HARD");
    await expect(page.locator("#lobby-status-text")).toHaveText(`You are watching. ${playerLine}`);
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
 * (the four player buttons, the host the bot stepper and START GAME above them), and three
 * spectators, signed in (PLAY INSTEAD, off in the full lobby), signed out on a server with Discord
 * sign-in (SIGN IN TO PLAY, a link), and signed out on one without (SIGN IN TO PLAY off); both
 * signed-out pages' /me are stubbed. Two more are in another lobby, of nine people and a bot
 * (failedPlayInstead): `botHost`, its host, and `failed`, a signed-in spectator whose PLAY INSTEAD
 * could not reach the server, the longest note a spectator gets. Returns the raw guests' sockets,
 * which the caller closes.
 */
export async function longestLineViewers(
  baseURL: string,
  pages: {
    host: Page;
    guest: Page;
    signedIn: Page;
    signedOut: Page;
    noDiscord: Page;
    botHost: Page;
    failed: Page;
  }
): Promise<{ sockets: WebSocket[]; viewers: LobbyViewer[] }> {
  const { host, guest, signedIn, signedOut, noDiscord, botHost, failed } = pages;
  await signInPage(signedIn, uniqueName("Watcher"));
  // Both signed-out pages' /me are stubbed, so the server's own Discord setting decides neither.
  await stubMe(signedOut, signedOutMe({ discord: true }));
  await stubMe(noDiscord, signedOutMe({ discord: false }));
  const { sockets } = await longestLineLobby(baseURL, { host, guest, spectators: [signedIn, signedOut, noDiscord] });
  try {
    sockets.push(...(await failedPlayInstead(baseURL, botHost, failed)));
  } catch (error) {
    sockets.forEach((ws) => ws.close());
    throw error;
  }
  return {
    sockets,
    viewers: [
      // NORMAL, the longest level's word, is the line every viewer but the second lobby's has.
      { viewer: "host", page: host, players: 10, bots: 0, buttons: HOST_BUTTONS, player: true, skill: "NORMAL" },
      { viewer: "guest", page: guest, players: 10, bots: 0, buttons: PLAYER_BUTTONS, player: true, skill: "NORMAL" },
      {
        viewer: "signed-in spectator",
        page: signedIn,
        players: 10,
        bots: 0,
        buttons: ["PLAY INSTEAD", "LEAVE LOBBY"],
        player: false,
        skill: "NORMAL",
        note: FULL_NOTE,
      },
      {
        viewer: "signed-out spectator",
        page: signedOut,
        players: 10,
        bots: 0,
        buttons: ["SIGN IN TO PLAY", "LEAVE LOBBY"],
        player: false,
        skill: "NORMAL",
        note: FULL_NOTE,
      },
      {
        viewer: "signed-out spectator without Discord",
        page: noDiscord,
        players: 10,
        bots: 0,
        buttons: ["SIGN IN TO PLAY", "LEAVE LOBBY"],
        player: false,
        skill: "NORMAL",
        note: "Sign-in is not set up on this server.",
      },
      {
        viewer: "host of nine and a bot",
        page: botHost,
        players: 9,
        bots: 1,
        buttons: HOST_BUTTONS,
        player: true,
        skill: "HARD",
      },
      {
        viewer: "signed-in spectator whose PLAY INSTEAD failed",
        page: failed,
        players: 9,
        bots: 1,
        buttons: ["PLAY INSTEAD", "LEAVE LOBBY"],
        player: false,
        skill: "HARD",
        note: CONTACT_ERROR,
      },
    ],
  };
}

/**
 * The labels of the lobby's buttons under its status line (links in a button's look among them),
 * or the accessible name of one that shows only an icon (the bot stepper's). The host's BOT SKILL
 * row (#72) adds EASY, NORMAL and HARD after START GAME.
 */
export async function actionLabels(page: Page): Promise<string[]> {
  return page
    .locator(".lobby-actions")
    .locator("button, .button-link")
    .evaluateAll((buttons) =>
      buttons.map((b) => (b as HTMLElement).innerText.trim() || (b.getAttribute("aria-label") ?? ""))
    );
}

/**
 * A player's four buttons under the status line (CHANGE NAME, CHANGE LOOK, WATCH INSTEAD and LEAVE
 * LOBBY, in two `.lobby-button-pair`s in `.lobby-player-buttons`): how many stand on each line, top
 * to bottom (buttons whose tops are within 2px share a line), and `room`, how many px the column
 * (`.lobby-actions`) leaves beside them in one line at their own widths (each its max-content
 * width, with the gaps the row and the pairs put between them), negative when they do not fit.
 * With `setRoom`, the column is first made just wide enough to leave that room, and put back after:
 * where the browser makes one row from two rows of two. Throws for a page without the four (a
 * spectator's).
 */
export function playerButtonRows(page: Page, setRoom?: number): Promise<{ rows: number[]; room: number }> {
  return page.evaluate((setRoom) => {
    const row = document.querySelector<HTMLElement>(".lobby-player-buttons");
    if (!row) throw new Error("the page has no player buttons");
    const pairs = Array.from(row.querySelectorAll<HTMLElement>(":scope > .lobby-button-pair"));
    const buttons = pairs.flatMap((pair) => Array.from(pair.querySelectorAll<HTMLElement>(":scope > button")));
    if (pairs.length !== 2 || buttons.length !== 4) {
      throw new Error(`${pairs.length} pairs of ${buttons.length} player buttons`);
    }
    // Each button's own width, measured with nothing stretching or squeezing it, then put back.
    const styles = buttons.map((b) => b.getAttribute("style"));
    for (const b of buttons) b.setAttribute("style", "flex: none; width: max-content;");
    const widths = buttons.map((b) => b.getBoundingClientRect().width);
    buttons.forEach((b, i) => {
      const style = styles[i];
      if (style === null) b.removeAttribute("style");
      else b.setAttribute("style", style);
    });
    // The gap between the pairs, then each pair's own (the row's, where a pair draws no box).
    const gapOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).columnGap);
    const gaps = [row, ...pairs].map((el) => (getComputedStyle(el).display === "contents" ? gapOf(row) : gapOf(el)));
    const needed = [...widths, ...gaps].reduce((sum, w) => sum + w, 0);
    const actions = document.querySelector<HTMLElement>(".lobby-actions")!;
    const width = actions.style.width;
    if (setRoom !== undefined) actions.style.width = `${needed + setRoom}px`;
    const room = actions.getBoundingClientRect().width - needed;
    const lines: number[] = [];
    let lastTop = -Infinity;
    for (const top of buttons.map((b) => b.getBoundingClientRect().top).sort((a, b) => a - b)) {
      if (top - lastTop > 2) lines.push(0);
      lines[lines.length - 1] += 1;
      lastTop = top;
    }
    actions.style.width = width;
    return { rows: lines, room };
  }, setRoom);
}

/**
 * The level the lobby shows (#72): the pressed button of the group "Bot skill" (the host's), or the
 * line's `.lobby-skill-level`; "" for neither.
 */
export function skillShown(page: Page): Promise<string> {
  return page.evaluate(() => {
    const pressed = document.querySelector('[role="group"][aria-label="Bot skill"] button[aria-pressed="true"]');
    const level = document.querySelector(".lobby-skill-level");
    return (pressed ?? level)?.textContent?.trim() ?? "";
  });
}

/**
 * How many lines the host's row (its label and three buttons) or another viewer's line (its
 * label and level) takes: parts whose words' vertical centres are within 2px share a line. 0 for
 * neither. A part's words, not its box: a button's box holds its shadow below its face.
 */
export function skillRowLines(page: Page): Promise<number> {
  return page.evaluate(() => {
    const parts = document.querySelectorAll(
      ".lobby-skill .lobby-skill-label, .lobby-skill .lobby-skill-option, .lobby-skill-line .lobby-skill-label, .lobby-skill-line .lobby-skill-level"
    );
    const centres = Array.from(parts, (part) => {
      const words = document.createRange();
      words.selectNodeContents(part);
      const r = words.getBoundingClientRect();
      return (r.top + r.bottom) / 2;
    }).sort((a, b) => a - b);
    let lines = 0;
    let first = -Infinity;
    for (const centre of centres) {
      if (centre - first > 2) {
        lines += 1;
        first = centre;
      }
    }
    return lines;
  });
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
