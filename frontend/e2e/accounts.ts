import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

/**
 * Accounts for the browser tests. Playing needs a signed-in account with a name, and the tests'
 * server has the test sign-in (TEST_SIGN_IN in playwright.config.ts), which makes the account
 * `test-<id>`, names it and sets the `session` cookie. Tests run in parallel against one server,
 * and names are unique ignoring case across every account, so each test's names are its own
 * (uniqueName).
 */

const TEST_SIGN_IN = "/auth/test-sign-in";

/** The longest name an account can have: src/constants' MAX_NAME_LENGTH (which needs a page). */
export const MAX_NAME_LENGTH = 12;

let made = 0;

/**
 * A name of exactly MAX_NAME_LENGTH (12) characters that no other name of the run has, ignoring
 * case: `stem`, cut (or padded with "_") to four characters, then a space and a tag in lower-case
 * base 36, "Long 3fk0001" or "Ann_ 3fk07pt". The tag is the run's own three characters (E2E_RUN,
 * which playwright.config.ts draws once for the whole run, so a run against a server an earlier
 * run used, as DEVELOPMENT.md's "Browser tests on Linux" does, takes none of its names), then four
 * or more from the worker's index and a count of the names the worker has made. It is the text
 * after the last space, and stands for one worker and one count, so no two names share it.
 */
export function uniqueName(stem: string): string {
  made += 1;
  if (made >= 10_000) throw new Error("uniqueName: a worker made 10,000 names");
  const worker = Number(process.env.TEST_WORKER_INDEX ?? 0);
  const tag = (process.env.E2E_RUN ?? "000") + (worker * 10_000 + made).toString(36).padStart(4, "0");
  const room = MAX_NAME_LENGTH - tag.length - 1;
  // No space at the head's end: the server makes a run of spaces one, which would shorten the name.
  const head = stem.slice(0, room).trimEnd().padEnd(room, "_");
  return `${head} ${tag}`;
}

/** The test account a name signs in as (`test-<this>` on the server); null, a new one. */
const accountFor = (name: string | null) =>
  name === null ? `e2e-${randomUUID()}` : `e2e-${encodeURIComponent(name.toLowerCase())}`;

type Answer = { status: number; text: () => Promise<string> };

/**
 * Signs in as `name`'s account and names it, through `post` (the test sign-in's POST, with its
 * JSON body). `name` null signs in a new account with no name yet.
 */
async function signIn(post: (body: object) => Promise<Answer>, name: string | null): Promise<void> {
  const id = accountFor(name);
  const answer = await post(name === null ? { id } : { id, username: name });
  if (answer.status !== 200) {
    throw new Error(`The test sign-in as "${name}" answered ${answer.status}: ${await answer.text()}`);
  }
}

/**
 * Signs `page`'s browser context in as `name` (null: a new account with no name yet). The request
 * is the context's own, so the context keeps the `session` cookie; a page already open asks /me
 * again only when it next loads.
 */
export async function signInPage(page: Page, name: string | null): Promise<void> {
  await signIn(async (data) => {
    const response = await page.request.post(TEST_SIGN_IN, { data });
    return { status: response.status(), text: () => response.text() };
  }, name);
}

/** Signs in as `name` outside a browser, for a raw socket. Returns the `Cookie` header's value. */
export async function signInRaw(baseURL: string, name: string): Promise<string> {
  let cookies: string[] = [];
  await signIn(async (body) => {
    const response = await fetch(new URL(TEST_SIGN_IN, baseURL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    cookies = response.headers.getSetCookie();
    return response;
  }, name);
  const session = cookies.map((cookie) => cookie.split(";")[0]).find((pair) => pair.startsWith("session="));
  if (!session) throw new Error(`The test sign-in as "${name}" set no session cookie.`);
  return session;
}

/** The longest Discord username, 32 characters, in wide letters. */
export const LONGEST_DISCORD_NAME = "maximilian.wolfgang_mcwilliamsww";

/** GET /me's answer (src/account/account.ts's Me) for a Discord account named `username`. */
export function signedInMe(username: string | null, discordUsername = "sam.discord"): object {
  return {
    signedIn: true,
    id: "123456789012345678",
    username,
    discordUsername,
    test: false,
    discord: true,
    testSignIn: true,
  };
}

/** GET /me's answer signed out, on a server with Discord sign-in (or without) and the test sign-in. */
export function signedOutMe({ discord }: { discord: boolean }): object {
  return { signedIn: false, discord, testSignIn: true };
}

/**
 * Answers `page`'s GET /me with `me`, so the page shows that account whatever its cookies: for a
 * page whose requests are scripted, and for a Discord account, which the tests' server cannot
 * make. Call it before the page loads.
 */
export async function stubMe(page: Page, me: object): Promise<void> {
  await page.route(/\/me$/, (route) => route.fulfill({ json: me }));
}

/** Node's WebSocket (undici's), which takes the handshake's headers, as the DOM's does not. */
type NodeWebSocket = new (url: URL, init: { headers: Record<string, string> }) => WebSocket;

/**
 * Opens a player's socket on `lobby` as the account of `cookie` (signInRaw), as the page does: the
 * session cookie, the server's own origin (outside debug mode the server refuses a player's socket
 * from any other) and a rejoin key of its own. Resolves once the server has taken the socket (its
 * first packet), and rejects with the server's reason if it refuses it.
 */
export async function playerSocket(baseURL: string, lobby: string, cookie: string): Promise<WebSocket> {
  const url = new URL("/game", baseURL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("lobby", lobby);
  url.searchParams.set("rejoinKey", randomUUID());
  const ws = new (WebSocket as unknown as NodeWebSocket)(url, {
    headers: { Cookie: cookie, Origin: new URL(baseURL).origin },
  });
  await new Promise<void>((resolve, reject) => {
    const refused = (event: CloseEvent) =>
      reject(new Error(`The server refused a player's socket: ${event.code} ${event.reason}`));
    ws.addEventListener("close", refused, { once: true });
    ws.addEventListener(
      "message",
      () => {
        ws.removeEventListener("close", refused);
        resolve();
      },
      { once: true }
    );
  });
  return ws;
}
