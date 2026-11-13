import type { Page, WebSocketRoute } from "@playwright/test";
import { makeGameState } from "../src/game/testGameState";
import { LobbyState, type GameState, type PolicyType, type Role } from "../src/types";

/**
 * A scripted game server for opening prompts from known game states. It stands in for the
 * /game socket (and answers /new-lobby), so no real game, no randomness and no server timing
 * are involved. Packets have the shape Lobby.updateUser sends: the game state plus `type`.
 */

/** The user, then nine players with twelve-character names, the longest the login form allows. */
export const TEN = ["Host Player", ...Array.from({ length: 9 }, (_, i) => `Long Guest ${i + 1}`)];
const [USER, G1, G2, G3] = TEN;
const G5 = TEN[5];

const LIBERAL = "LIBERAL" as Role;
const FASCIST = "FASCIST" as Role;
const HITLER = "HITLER" as Role;
const L = "LIBERAL" as PolicyType;
const F = "FASCIST" as PolicyType;

/** Every role known, as players see them at the end of a game, with the user a fascist. */
const ALL_ROLES: Record<string, Role> = Object.fromEntries(
  TEN.map((name) => [name, name === G1 ? HITLER : [USER, G2, G3].includes(name) ? FASCIST : LIBERAL])
);

export type FakeGame = { send(packet: object): void };

/**
 * Creates a lobby of `names` (TEN by default) as names[0] through the login form, with every
 * portrait already chosen, and returns the scripted socket. The client's own messages are ignored.
 */
export async function openFakeGame(page: Page, names: string[] = TEN): Promise<FakeGame> {
  await page.route("**/new-lobby", (route) => route.fulfill({ body: "FAKE" }));
  let connect!: (ws: WebSocketRoute) => void;
  const connected = new Promise<WebSocketRoute>((resolve) => (connect = resolve));
  await page.routeWebSocket(/\/game\?/, (ws) => {
    ws.onMessage(() => {});
    connect(ws);
  });

  await page.goto("/");
  await page.getByRole("textbox", { name: "Your Name" }).last().fill(names[0]);
  await page.getByRole("button", { name: "CREATE LOBBY" }).click();
  const ws = await connected;
  const icon = Object.fromEntries(names.map((name, i) => [name, `p${i + 1}`]));
  ws.send(JSON.stringify({ type: "lobby", usernames: names, icon }));
  await page.getByText(`Players (${names.length}/10)`).waitFor();
  return { send: (packet) => ws.send(JSON.stringify(packet)) };
}

/**
 * A game-state packet for TEN, as makeGameState builds it (the user is president, nobody has a
 * role, policy counts and the tracker are 0), with `overrides` applied.
 * @param roles the roles the user can see; by default only their own, liberal.
 * @param dead players who have been executed.
 */
export function gamePacket(
  overrides: Partial<GameState> = {},
  roles: Record<string, Role> = { [USER]: LIBERAL },
  dead: string[] = []
): object {
  const state = makeGameState(TEN, overrides);
  for (const [name, id] of Object.entries(roles)) state.players[name].id = id;
  for (const name of dead) state.players[name].alive = false;
  return { type: "game", ...state };
}

/**
 * One entry per prompt, in its longest form. Each fixture only changes what opens its own prompt
 * (App.tsx shows a policy-enacted alert whenever the policy counts change in a policy state).
 */
export const PROMPTS: { name: string; packets: object[]; button: string }[] = [
  {
    name: "role",
    packets: [gamePacket({ president: G1 }, ALL_ROLES)],
    button: "OKAY",
  },
  {
    name: "nomination",
    packets: [gamePacket({ electionTracker: 1 })],
    button: "CONFIRM",
  },
  {
    name: "vote",
    packets: [
      gamePacket({
        state: LobbyState.CHANCELLOR_VOTING,
        president: G1,
        chancellor: G2,
        fascistPolicies: 3,
        electionTracker: 2,
      }),
    ],
    button: "CONFIRM",
  },
  {
    name: "president-legislative",
    packets: [
      gamePacket({ state: LobbyState.LEGISLATIVE_PRESIDENT, chancellor: G2, presidentChoices: [F, L, F] }),
    ],
    button: "DISCARD",
  },
  {
    name: "chancellor-legislative",
    packets: [
      gamePacket({
        state: LobbyState.LEGISLATIVE_CHANCELLOR,
        president: G1,
        chancellor: USER,
        fascistPolicies: 5,
        chancellorChoices: [F, L],
      }),
    ],
    button: "ENACT",
  },
  {
    name: "veto",
    packets: [
      gamePacket({
        state: LobbyState.LEGISLATIVE_PRESIDENT_VETO,
        chancellor: G2,
        fascistPolicies: 5,
        electionTracker: 2,
      }),
    ],
    button: "ACCEPT",
  },
  {
    name: "peek",
    packets: [gamePacket({ state: LobbyState.PP_PEEK, chancellor: G2, peek: [F, L, F] })],
    button: "OKAY",
  },
  {
    name: "investigate",
    packets: [gamePacket({ state: LobbyState.PP_INVESTIGATE, chancellor: G2 })],
    button: "CONFIRM",
  },
  {
    name: "investigation-card",
    packets: [
      gamePacket({ state: LobbyState.PP_INVESTIGATE, president: G1 }),
      { type: "investigation", investigation: "FASCIST", target: G5 },
    ],
    button: "OKAY",
  },
  {
    name: "special-election",
    packets: [gamePacket({ state: LobbyState.PP_ELECTION, chancellor: G2 })],
    button: "CONFIRM",
  },
  {
    name: "execution",
    packets: [gamePacket({ state: LobbyState.PP_EXECUTION, chancellor: G2 })],
    button: "CONFIRM",
  },
  {
    name: "special-election-result",
    packets: [
      gamePacket({
        state: LobbyState.POST_LEGISLATIVE,
        lastState: LobbyState.PP_ELECTION,
        president: G1,
        chancellor: G2,
        targetUser: G5,
      }),
    ],
    button: "OKAY",
  },
  {
    name: "execution-result",
    packets: [
      gamePacket(
        {
          state: LobbyState.POST_LEGISLATIVE,
          lastState: LobbyState.PP_EXECUTION,
          president: G1,
          chancellor: G2,
          targetUser: G5,
        },
        undefined,
        [G5]
      ),
    ],
    button: "OKAY",
  },
  {
    name: "executed",
    packets: [
      gamePacket(
        {
          state: LobbyState.POST_LEGISLATIVE,
          lastState: LobbyState.PP_EXECUTION,
          president: G1,
          chancellor: G2,
          targetUser: USER,
        },
        undefined,
        [USER]
      ),
    ],
    button: "CONFIRM",
  },
  {
    name: "investigation-result",
    packets: [
      gamePacket({
        state: LobbyState.POST_LEGISLATIVE,
        lastState: LobbyState.PP_INVESTIGATE,
        president: G1,
        chancellor: G2,
        targetUser: G5,
      }),
    ],
    button: "OKAY",
  },
  {
    name: "policy-enacted",
    packets: [
      gamePacket({
        state: LobbyState.POST_LEGISLATIVE,
        lastState: LobbyState.LEGISLATIVE_CHANCELLOR,
        president: G1,
        liberalPolicies: 1,
        lastPolicy: "LIBERAL",
      }),
    ],
    button: "OKAY",
  },
  {
    // The tracker alert only shows when a policy state moves the tracker: the third failed election.
    name: "election-tracker",
    packets: [
      gamePacket({ president: G1, electionTracker: 2 }),
      gamePacket({
        state: LobbyState.POST_LEGISLATIVE,
        president: G1,
        electionTracker: 0,
        electionTrackerAdvanced: true,
        fascistPolicies: 1,
        lastPolicy: "FASCIST",
      }),
    ],
    button: "OKAY",
  },
  {
    name: "victory",
    packets: [
      gamePacket({ state: LobbyState.FASCIST_VICTORY_POLICY, president: G1, chancellor: G2 }, ALL_ROLES),
    ],
    button: "RETURN TO LOBBY",
  },
];

/** The lobby packet a spectator of the scripted lobby gets: TEN with portraits, one spectator. */
export const WATCHED_LOBBY = {
  type: "lobby",
  usernames: TEN,
  icon: Object.fromEntries(TEN.map((name, i) => [name, `p${i + 1}`])),
  spectatorCount: 1,
};

export type FakeWatch = FakeGame & {
  /** Every socket the page opened, oldest first, so a test can check each was a spectator's. */
  urls: string[];
  /** While down, the server closes the open socket and every new one at once. */
  down(on: boolean): void;
};

/**
 * Watches the scripted lobby "FAKE" through the login form's WATCH button. The socket's first
 * packet is `first`: by default WATCHED_LOBBY; a game packet joins a game already running.
 * `send` goes to the newest socket.
 */
export async function openFakeWatch(page: Page, first: object = WATCHED_LOBBY): Promise<FakeWatch> {
  await page.route(/\/check-login\?/, (route) => route.fulfill({ body: "Spectator login valid." }));
  const urls: string[] = [];
  let latest: WebSocketRoute | undefined;
  let down = false;
  let connect!: () => void;
  const connected = new Promise<void>((resolve) => (connect = resolve));
  await page.routeWebSocket(/\/game\?/, (ws) => {
    urls.push(ws.url());
    if (down) return void ws.close();
    ws.onMessage(() => {});
    latest = ws;
    connect();
  });

  await page.goto("/");
  await page.getByRole("textbox", { name: "Lobby" }).fill("FAKE");
  await page.getByRole("button", { name: "WATCH" }).click();
  await connected;
  latest!.send(JSON.stringify(first));
  if ((first as { type?: string }).type === "lobby") {
    await page.getByText(`Players (${TEN.length}/10)`).waitFor();
  } else {
    await page.locator(".game-screen").waitFor();
  }
  return {
    send: (packet) => latest!.send(JSON.stringify(packet)),
    urls,
    down: (on) => {
      down = on;
      if (on) latest?.close();
    },
  };
}

/** A game-state packet as a spectator receives it: no roles, one spectator watching. */
export function spectatorPacket(overrides: Partial<GameState> = {}, dead: string[] = []): object {
  return { ...gamePacket(overrides, {}, dead), spectatorCount: 1 };
}

/** Every role, as everyone sees them at the end of a game. */
export const EVERY_ROLE = ALL_ROLES;
