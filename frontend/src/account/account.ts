import {
  AUTH_DISCORD,
  AUTH_SIGN_OUT,
  AUTH_TEST_SIGN_IN,
  LOBBY_CODE_LENGTH,
  ME,
  ME_USERNAME,
  SERVER_ADDRESS_HTTP,
} from "../constants";
import { CONTACT_ERROR } from "../lobby/joinError";
import { normalizeCode } from "../lobby/normalizeCode";

/** What GET /me says about this page's session. */
export type Me =
  | { signedIn: false; discord: boolean; testSignIn: boolean }
  | {
      signedIn: true;
      id: string;
      /** null until the person has chosen a name. */
      username: string | null;
      discordUsername: string;
      test: boolean;
      discord: boolean;
      testSignIn: boolean;
    };

export type SaveResult =
  { ok: true; username: string } | { ok: false; error: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

const post = (path: string, body: unknown) =>
  fetch(SERVER_ADDRESS_HTTP + path, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

/** Throws unless `body` has the shape of GET /me's answer. */
function parseMe(body: unknown): Me {
  const me = body as Record<string, unknown> | null;
  const ok =
    typeof me === "object" &&
    me !== null &&
    typeof me.signedIn === "boolean" &&
    (!me.signedIn ||
      (typeof me.id === "string" &&
        typeof me.discordUsername === "string" &&
        (me.username === null || typeof me.username === "string")));
  if (!ok) throw new Error("The server's account answer is malformed.");
  return me as Me;
}

/** 128 random bits in hex; crypto.randomUUID needs a secure context, getRandomValues does not. */
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Rejects when the server cannot be reached or does not answer 200. */
export async function fetchMe(): Promise<Me> {
  const response = await fetch(SERVER_ADDRESS_HTTP + ME);
  if (!response.ok) throw new Error("GET /me answered " + response.status);
  return parseMe(await response.json());
}

/** Saves the person's name. The error is the server's message, or CONTACT_ERROR. */
export async function saveUsername(name: string): Promise<SaveResult> {
  let response: Response;
  try {
    response = await post(ME_USERNAME, { username: name });
  } catch {
    return { ok: false, error: CONTACT_ERROR };
  }
  try {
    if (response.ok) {
      const body = (await response.json()) as { username: string };
      return { ok: true, username: body.username };
    }
    const message =
      response.status >= 500 ? "" : (await response.text()).trim();
    return { ok: false, error: message || CONTACT_ERROR };
  } catch {
    return { ok: false, error: CONTACT_ERROR };
  }
}

/** Rejects when the server cannot be reached or does not answer 204. */
export async function signOut(): Promise<void> {
  const response = await post(AUTH_SIGN_OUT, {});
  if (!response.ok)
    throw new Error("POST /auth/sign-out answered " + response.status);
}

/** Signs in as a new test account (a random ID per call). Rejects on any failure. */
export async function testSignIn(): Promise<Me> {
  const response = await post(AUTH_TEST_SIGN_IN, { id: randomId() });
  if (!response.ok)
    throw new Error("POST /auth/test-sign-in answered " + response.status);
  return parseMe(await response.json());
}

/** The link that signs in with Discord; with a full lobby code, it brings the person back to it. */
export function discordSignInHref(lobby: string): string {
  const code = normalizeCode(lobby);
  return (
    SERVER_ADDRESS_HTTP +
    AUTH_DISCORD +
    (code.length === LOBBY_CODE_LENGTH ? "?lobby=" + code : "")
  );
}
