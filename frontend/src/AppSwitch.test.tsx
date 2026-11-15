import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Cookies from "js-cookie";
import React, { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import {
  PACKET_GAME_STATE,
  PACKET_LOBBY,
  PACKET_OK,
  PARAM_ICON,
  PARAM_PACKET_TYPE,
  PARAM_USERNAMES,
  PARAM_YOU,
  PING_INTERVAL,
  RECONNECT_DELAYS,
  REPLY_TIMEOUT,
} from "./constants";
import { makeGameState } from "./game/testGameState";
import { CONNECT_ERROR, CONTACT_ERROR } from "./lobby/joinError";
import { RoundStep } from "./game/roundStep";
import ButtonPrompt from "./custom-alert/ButtonPrompt";
import { LobbyState, Role, WSCommandType } from "./types";
import IconSelection from "./custom-alert/IconSelection";
import NamePrompt from "./custom-alert/NamePrompt";
import RoleAlert from "./custom-alert/RoleAlert";
import { defaultPortrait } from "./assets";
import type { Me } from "./account/account";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static failNext = false;
  /** When true, new sockets start CONNECTING (readyState 0) and throw on send until open(). */
  static connecting = false;
  OPEN = 1;
  closed = false;
  readyState?: number = undefined;
  onclose: ((event?: Partial<CloseEvent>) => void) | null = null;
  onmessage: ((msg: MessageEvent) => void) | null = null;
  openListeners: (() => void)[] = [];
  send = vi.fn((_data: string) => {
    if (this.readyState === 0) throw new DOMException("Still in CONNECTING state.", "InvalidStateError");
  });
  constructor(public url: string) {
    if (FakeSocket.failNext) {
      FakeSocket.failNext = false;
      throw new Error("cannot open");
    }
    if (FakeSocket.connecting) this.readyState = 0;
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }) {
    expect(type).toBe("open");
    expect(options?.once).toBe(true);
    this.openListeners.push(listener);
  }
  open() {
    this.readyState = 1;
    const listeners = this.openListeners;
    this.openListeners = [];
    listeners.forEach((listener) => listener());
  }
  close() {
    this.closed = true;
  }
}

let checkStatus = 200;
let checkRejects = false;
/** While set, each /check-login waits until the test answers it with a status, in order. */
let heldChecks: ((status: number) => void)[] | undefined;
/** While set, each POST /me/username waits until the test lets it save. */
let heldSaves: (() => void)[] | undefined;

/** A signed-in account with a name, as GET /me describes it. */
const account = (username: string): Extract<Me, { signedIn: true }> => ({
  signedIn: true,
  id: "id-" + username,
  username,
  discordUsername: username.toLowerCase(),
  test: false,
  discord: true,
  testSignIn: false,
});

/** A signed-in account that has not chosen a name yet. */
const noName = (id: string): Me => ({ ...account(id), username: null });

const SIGNED_OUT: Me = { signedIn: false, discord: true, testSignIn: false };

/** What GET /me answers: the page's account. */
let me: Me = account("Ann");

/** GET /me's answer. */
const meResponse = () => new Response(JSON.stringify(me), { status: 200 });

/** The server: GET /me, a name saved, a sign-out and the login checks; anything else is an empty 200. */
function stubFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = new URL(String(input), "http://host").pathname;
  if (path.endsWith("/me")) return Promise.resolve(meResponse());
  if (path.endsWith("/me/username")) {
    const { username } = JSON.parse(String(init?.body));
    const save = () => {
      if (me.signedIn) me = { ...me, username };
      return new Response(JSON.stringify({ username }), { status: 200 });
    };
    if (heldSaves) {
      const held = heldSaves;
      return new Promise((resolve) => held.push(() => resolve(save())));
    }
    return Promise.resolve(save());
  }
  if (path.endsWith("/auth/sign-out")) {
    me = SIGNED_OUT;
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (path.endsWith("/check-login")) {
    if (checkRejects) return Promise.reject(new Error("down"));
    if (heldChecks) {
      const held = heldChecks;
      return new Promise((resolve) => held.push((status) => resolve(new Response(null, { status }))));
    }
    return Promise.resolve(new Response(null, { status: checkStatus }));
  }
  return Promise.resolve(new Response(null, { status: 200 }));
}

beforeEach(() => {
  FakeSocket.instances = [];
  FakeSocket.failNext = false;
  FakeSocket.connecting = false;
  checkStatus = 200;
  checkRejects = false;
  heldChecks = undefined;
  heldSaves = undefined;
  me = account("Ann");
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", vi.fn(stubFetch));
});

afterEach(() => {
  vi.useRealTimers();
  for (const name of ["name", "lobby", "spectator"]) Cookies.remove(name);
  vi.unstubAllGlobals();
});

async function deliver(app: App, packet: object) {
  await act(() =>
    app.onWebSocketMessage(new MessageEvent("message", { data: JSON.stringify(packet) }))
  );
}

const lobbyPacket = {
  [PARAM_PACKET_TYPE]: PACKET_LOBBY,
  [PARAM_USERNAMES]: ["Ann", "Ben"],
  [PARAM_ICON]: { Ann: "p1", Ben: "p2" },
};

/** Renders the page and lets its GET /me answer come in. */
async function renderApp() {
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  for (let i = 0; i < 50 && app.state.account === undefined; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  expect(app.state.account).toEqual(me);
  return app;
}

async function playerInLobby() {
  const app = await renderApp();
  act(() => {
    app.tryOpenWebSocket("Ann", "HBIA");
  });
  await deliver(app, lobbyPacket);
  return app;
}

async function spectatorInLobby() {
  me = account("Sam");
  Cookies.set("spectator", "true");
  const app = await renderApp();
  act(() => {
    app.tryOpenWebSocket("", "HBIA", true);
  });
  await deliver(app, lobbyPacket);
  return app;
}

function promptProps(app: App) {
  const content = app.state.alertContent as React.ReactElement<
    React.ComponentProps<typeof NamePrompt>
  >;
  expect(content.type).toBe(NamePrompt);
  return content.props;
}

/** Lets the stubbed requests' promises settle (fake timers or real). */
async function settle() {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** The player checks (/check-login without spectator=true) the page has made, in order. */
const playerChecks = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([url]) => new URL(String(url), "http://host"))
    .filter((url) => url.pathname.endsWith("/check-login") && !url.searchParams.has("spectator"));

/** The names the page has saved (POST /me/username), in order. */
const savedNames = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => new URL(String(url), "http://host").pathname.endsWith("/me/username"))
    .map(([, init]) => JSON.parse(String(init?.body)).username as string);

/** The note under a spectator's buttons ("" for none). */
const note = () => document.querySelector(".lobby-note")?.textContent ?? "";

/** The name prompt's title, while one is on screen ("" for none). */
const promptTitle = (app: App) =>
  app.state.showAlert && (app.state.alertContent as React.ReactElement).type === NamePrompt
    ? promptProps(app).title
    : "";

const alertBox = () => within(document.getElementById("alert-box")!);

/** Types a name into the name prompt and presses its confirm button (CONTINUE or SAVE). */
async function confirmName(name: string, label = "CONTINUE") {
  fireEvent.change(alertBox().getByRole("textbox", { name: "Your name" }), { target: { value: name } });
  fireEvent.click(alertBox().getByRole("button", { name: label }));
  await settle();
}

/** A spectator signed in with no name yet, in the lobby, where CHOOSE A NAME has opened by itself. */
async function namelessSpectatorInLobby() {
  me = noName("Sam");
  Cookies.set("spectator", "true");
  const app = await renderApp();
  act(() => {
    app.tryOpenWebSocket("", "HBIA", true);
  });
  await deliver(app, lobbyPacket);
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
  return app;
}

/** The roster row marked as the viewer's, by name ("" for none). */
const markedRow = () =>
  [...document.querySelectorAll<HTMLElement>(".lobby-players li.roster-row.is-user")]
    .map((row) => row.dataset.player)
    .join(",");

const gameStatePacket = () => ({
  ...makeGameState(["Ann", "Ben", "Cat", "Dan", "Eve"]),
  [PARAM_PACKET_TYPE]: PACKET_GAME_STATE,
});

const lastUrl = () => lastSocket().url;
const lastSocket = () => FakeSocket.instances[FakeSocket.instances.length - 1];

/** Closes each new socket and waits out each reconnect (on fake timers) until the page gives up. */
function loseConnectionForGood(app: App) {
  if (!vi.isFakeTimers()) vi.useFakeTimers();
  for (let i = 0; i < 20 && app.state.page !== "login"; i++) {
    act(() => lastSocket().onclose?.());
    act(() => vi.advanceTimersByTime(Math.max(...RECONNECT_DELAYS)));
  }
}

test("WATCH INSTEAD opens a spectator socket and remembers it", async () => {
  const app = await playerInLobby();
  act(() => app.onClickWatchInstead());
  expect(lastUrl()).toContain("spectator=true");
  expect(lastUrl()).toContain("lobby=HBIA");
  expect(lastUrl()).not.toContain("name=");
  expect(FakeSocket.instances[0].closed).toBe(true);
  expect(Cookies.get("spectator")).toBe("true");
  expect(app.state.spectator).toBe(true);
  expect(app.state.page).toBe("lobby");
});

const playerCount = () => document.querySelector(".lobby-player-count")?.textContent;

test("WATCH INSTEAD keeps the lobby's players on screen until the first packet", async () => {
  const app = await playerInLobby();
  expect(playerCount()).toBe("2 / 10");
  act(() => app.onClickWatchInstead());
  expect(app.state.spectator).toBe(true);
  expect(playerCount()).toBe("2 / 10");
  expect(document.querySelectorAll(".lobby-players li.roster-row")).toHaveLength(2);
});

test("PLAY INSTEAD keeps the lobby's players on screen until the first packet", async () => {
  const app = await spectatorInLobby();
  await act(() => app.onClickPlayInstead());
  expect(app.state.spectator).toBe(false);
  expect(playerCount()).toBe("2 / 10");
  expect(document.querySelectorAll(".lobby-players li.roster-row")).toHaveLength(2);
});

test("the old socket closing stays in the lobby", async () => {
  const app = await playerInLobby();
  act(() => app.onClickWatchInstead());
  const before = FakeSocket.instances.length;
  act(() => FakeSocket.instances[0].onclose?.());
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.reconnectAttempts).toBe(0);
  expect(app.state.page).toBe("lobby");
});

test("PLAY INSTEAD takes a seat under the account's name at once, with no prompt", async () => {
  const app = await spectatorInLobby();
  const watching = lastSocket();
  fireEvent.click(screen.getByRole("button", { name: "PLAY INSTEAD" }));
  expect(app.state.showAlert).toBe(false);
  await settle();
  expect(playerChecks().map((url) => url.search)).toEqual(["?lobby=HBIA"]);
  expect(lastSocket()).not.toBe(watching);
  expect(lastUrl()).not.toContain("spectator=true");
  expect(lastUrl()).toContain("rejoinKey="); // a player's socket
  expect(lastUrl()).not.toContain("name=");
  expect(app.state.name).toBe("Sam");
  expect(Cookies.get("name")).toBeUndefined();
  expect(Cookies.get("lobby")).toBe("HBIA");
  expect(Cookies.get("spectator")).toBeUndefined();
  expect(app.state.showAlert).toBe(false);
  expect((app.state.alertContent as React.ReactElement).type).not.toBe(NamePrompt);
  expect(app.state.spectator).toBe(false);
  expect(watching.closed).toBe(true);
  expect(savedNames()).toEqual([]);
});

test("a seat refused after its check leaves the person watching", async () => {
  const app = await spectatorInLobby();
  await act(() => app.onClickPlayInstead());
  const seat = FakeSocket.instances[FakeSocket.instances.length - 1];
  expect(seat.url).toContain("rejoinKey="); // a player's socket
  expect(seat.url).not.toContain("spectator=true");
  // The game started (or the last seat went) between the check and the join: the server closes it.
  act(() => seat.onclose?.());
  expect(lastUrl()).toContain("spectator=true");
  expect(lastUrl()).not.toContain("name=");
  expect(Cookies.get("spectator")).toBe("true");
  expect(app.state.spectator).toBe(true);
  expect(app.state.page).toBe("lobby");
  expect(app.state.snackbarMessage).toBe("Could not take a seat. You are still watching.");
});

test("LEAVE LOBBY before the seat's first packet still leaves", async () => {
  const app = await spectatorInLobby();
  await act(() => app.onClickPlayInstead());
  const before = FakeSocket.instances.length;
  act(() => app.onClickLeaveLobby());
  act(() => FakeSocket.instances[before - 1].onclose?.());
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.page).toBe("login");
});

test("a seat that has delivered a packet reconnects as a player when it closes", async () => {
  const app = await spectatorInLobby();
  await act(() => app.onClickPlayInstead());
  await deliver(app, { ...lobbyPacket, [PARAM_USERNAMES]: ["Ann", "Ben", "Sam"] });
  act(() => FakeSocket.instances[FakeSocket.instances.length - 1].onclose?.());
  expect(lastUrl()).toContain("rejoinKey=");
  expect(lastUrl()).not.toContain("spectator=true");
  expect(app.reconnectAttempts).toBe(1);
  expect(app.state.spectator).toBe(false);
  expect(app.state.page).toBe("lobby");
  expect(Cookies.get("spectator")).toBeUndefined();
});

test("a check that says no keeps the spectator watching, with the reason in the note", async () => {
  const app = await spectatorInLobby();
  checkStatus = 403;
  const before = FakeSocket.instances.length;
  await act(() => app.onClickPlayInstead());
  expect(note()).toBe("You're already in this lobby in another tab or window.");
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.spectator).toBe(true);
  expect(app.state.showAlert).toBe(false);
  expect(Cookies.get("spectator")).toBe("true");
  expect(Cookies.get("lobby")).toBeUndefined();

  // The next press starts afresh: the line goes at once, and this time the seat is taken.
  heldChecks = [];
  checkStatus = 200;
  const pending = app.onClickPlayInstead();
  await settle();
  expect(note()).toBe("");
  await act(async () => {
    heldChecks![0](200);
    await pending;
  });
  expect(app.state.spectator).toBe(false);
});

test("the server unreachable shows the contact error in the note", async () => {
  const app = await spectatorInLobby();
  checkRejects = true;
  await act(() => app.onClickPlayInstead());
  expect(note()).toBe(CONTACT_ERROR);
  expect(app.state.spectator).toBe(true);
});

test("a 401 asks /me again, and a session that has ended shows SIGN IN TO PLAY", async () => {
  const app = await spectatorInLobby();
  checkStatus = 401;
  me = SIGNED_OUT; // signed out in another tab
  await act(() => app.onClickPlayInstead());
  await settle();
  expect(app.state.account).toEqual(SIGNED_OUT);
  expect(screen.getByRole("link", { name: "SIGN IN TO PLAY" })).toHaveAttribute(
    "href",
    expect.stringMatching(/\/auth\/discord\?lobby=HBIA$/)
  );
  expect(screen.queryByRole("button", { name: "PLAY INSTEAD" })).toBeNull();
  expect(app.state.spectator).toBe(true);
});

test("PLAY INSTEAD takes one press at a time", async () => {
  const app = await spectatorInLobby();
  heldChecks = [];
  const first = app.onClickPlayInstead();
  void app.onClickPlayInstead();
  fireEvent.click(screen.getByRole("button", { name: "PLAY INSTEAD" }));
  expect(playerChecks()).toHaveLength(1);
  const before = FakeSocket.instances.length;
  await act(async () => {
    heldChecks![0](200);
    await first;
  });
  expect(FakeSocket.instances.length).toBe(before + 1);
  expect(app.state.spectator).toBe(false);
});

test("a lobby packet while the check is on its way keeps the seat coming", async () => {
  const app = await spectatorInLobby();
  heldChecks = [];
  const pending = app.onClickPlayInstead();
  await deliver(app, { ...lobbyPacket, [PARAM_USERNAMES]: ["Ann", "Ben", "Cat"] });
  await act(async () => {
    heldChecks![0](200);
    await pending;
  });
  expect(app.state.spectator).toBe(false);
  expect(lastUrl()).toContain("rejoinKey=");
});

test("a check that returns after the game started opens no player socket", async () => {
  const app = await spectatorInLobby();
  heldChecks = [];
  const pending = app.onClickPlayInstead();
  await deliver(app, gameStatePacket());
  const before = FakeSocket.instances.length;
  await act(async () => {
    heldChecks![0](200);
    await pending;
  });
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.spectator).toBe(true);
});

test("a check begun before a game seats no one after it, and the next press's check does", async () => {
  const app = await spectatorInLobby();
  heldChecks = [];
  const first = app.onClickPlayInstead();
  await deliver(app, gameStatePacket());
  await deliver(app, lobbyPacket); // the game is over: back in the lobby, watching
  const second = app.onClickPlayInstead();
  expect(playerChecks()).toHaveLength(2);
  const before = FakeSocket.instances.length;
  await act(async () => {
    heldChecks![0](200);
    await first;
  });
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.spectator).toBe(true);
  await act(async () => {
    heldChecks![1](200);
    await second;
  });
  expect(FakeSocket.instances.length).toBe(before + 1);
  expect(app.state.spectator).toBe(false);
});

test("LEAVE LOBBY while the check is on its way opens no seat", async () => {
  const app = await spectatorInLobby();
  const watching = lastSocket();
  heldChecks = [];
  const pending = app.onClickPlayInstead();
  act(() => app.onClickLeaveLobby());
  await act(async () => {
    heldChecks![0](200);
    await pending;
  });
  expect(FakeSocket.instances).toHaveLength(1);
  expect(Cookies.get("lobby")).toBeUndefined();
  act(() => watching.onclose?.({ code: 1000 }));
  expect(app.state.page).toBe("login");
  expect(FakeSocket.instances).toHaveLength(1);
});

test("PLAY INSTEAD's error does not follow the person into the next lobby they watch", async () => {
  const app = await spectatorInLobby();
  checkStatus = 488;
  await act(() => app.onClickPlayInstead());
  expect(note()).toBe("The lobby is currently in a game.");
  act(() => app.onClickLeaveLobby());
  act(() => lastSocket().onclose?.({ code: 1000 }));
  expect(app.state.page).toBe("login");
  act(() => {
    app.openWatch("HBIA");
  });
  await deliver(app, lobbyPacket);
  expect(app.state.spectator).toBe(true);
  expect(note()).toBe("");
});

test("a failed Discord sign-in shows in the lobby a spectator comes back to, and nothing else does", async () => {
  const start = window.location.href;
  window.history.replaceState({}, "", "/?signin=failed&lobby=HBIA");
  try {
    me = SIGNED_OUT;
    Cookies.set("lobby", "HBIA");
    Cookies.set("spectator", "true");
    const app = await renderApp();
    await settle(); // the spectator check, then the socket
    expect(app.state.page).toBe("lobby");
    expect(app.state.spectator).toBe(true);
    await deliver(app, lobbyPacket);
    expect(note()).toBe("Signing in with Discord failed. Please try again.");
    expect(screen.getByRole("link", { name: "SIGN IN TO PLAY" })).toBeInTheDocument();

    // The card's other error, a /me that could not be reached, is not the lobby's to show.
    act(() => app.setState({ accountError: CONTACT_ERROR }));
    expect(note()).toBe("");
  } finally {
    window.history.replaceState({}, "", start);
  }
});

test("where sign-in is not set up, a signed-out spectator's SIGN IN TO PLAY is off and says why", async () => {
  me = { signedIn: false, discord: false, testSignIn: true };
  const app = await renderApp();
  act(() => {
    app.tryOpenWebSocket("", "HBIA", true);
  });
  await deliver(app, lobbyPacket);
  const off = screen.getByRole("button", { name: "SIGN IN TO PLAY" });
  expect(off).toBeDisabled();
  expect(off).toHaveAccessibleDescription("Sign-in is not set up on this server.");
  expect(note()).toBe("Sign-in is not set up on this server.");
});

const TEN = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jo"];
const FULL_NOTE = "The lobby is full (10 / 10). You can play when a seat frees up.";

/** A lobby packet with these players, each with a portrait. */
const lobbyWith = (names: string[]) => ({
  ...lobbyPacket,
  [PARAM_USERNAMES]: names,
  [PARAM_ICON]: Object.fromEntries(names.map((name, i) => [name, `p${i + 1}`])),
});

test("a full lobby's note takes the place of PLAY INSTEAD's error, which then goes for good", async () => {
  const app = await spectatorInLobby();
  checkStatus = 489;
  await act(() => app.onClickPlayInstead());
  expect(note()).toBe("The lobby is currently full.");
  await deliver(app, lobbyWith(TEN));
  expect(note()).toBe(FULL_NOTE);
  await deliver(app, lobbyPacket); // a seat frees up
  expect(note()).toBe("");
  expect(screen.getByRole("button", { name: "PLAY INSTEAD" })).toBeEnabled();
});

test("an error that lands behind the full lobby's note does not come back when a seat frees", async () => {
  const app = await spectatorInLobby();
  await deliver(app, lobbyWith(TEN.slice(0, 9)));
  heldChecks = [];
  const pending = app.onClickPlayInstead(); // at 9 / 10
  await deliver(app, lobbyWith(TEN)); // the tenth player joins first
  await act(async () => {
    heldChecks![0](489); // then the check says the lobby is full
    await pending;
  });
  expect(note()).toBe(FULL_NOTE);
  await deliver(app, lobbyWith(TEN.slice(0, 9))); // a seat frees up
  expect(note()).toBe("");
  expect(screen.getByRole("button", { name: "PLAY INSTEAD" })).toBeEnabled();
});

test("the portrait picker opens after PLAY INSTEAD, even when the lobby packet is quick", async () => {
  vi.useFakeTimers();
  const app = await spectatorInLobby();
  await act(() => app.onClickPlayInstead());
  await deliver(app, {
    ...lobbyPacket,
    [PARAM_USERNAMES]: ["Ann", "Sam"],
    [PARAM_ICON]: { Ann: "p1", Sam: defaultPortrait },
  });
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(app.state.showAlert).toBe(true);
  expect((app.state.alertContent as React.ReactElement).type).toBe(IconSelection);
});

test("a return under the same name keeps the remembered portrait and opens no picker", async () => {
  vi.useFakeTimers();
  const app = await spectatorInLobby();
  await act(() => app.onClickPlayInstead());
  // The server restored Sam's old portrait, so the first packet already carries it.
  const back = {
    ...lobbyPacket,
    [PARAM_USERNAMES]: ["Ann", "Sam"],
    [PARAM_ICON]: { Ann: "p1", Sam: "p2" },
  };
  await deliver(app, back);
  expect((app.state.alertContent as React.ReactElement | null)?.type).not.toBe(IconSelection);
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect((app.state.alertContent as React.ReactElement | null)?.type).not.toBe(IconSelection);
  expect(app.state.showAlert).toBe(false);
});

test("a lasting disconnect while the check is on its way opens no seat", async () => {
  const app = await spectatorInLobby();
  heldChecks = [];
  const pending = app.onClickPlayInstead();
  loseConnectionForGood(app);
  expect(app.state.page).toBe("login");
  const before = FakeSocket.instances.length;
  await act(async () => {
    heldChecks![0](200);
    await pending;
  });
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.page).toBe("login");
  expect(app.state.showAlert).toBe(false);
});

// PLAY INSTEAD for an account with no name yet: CHOOSE A NAME first, then the seat.

test("with no name yet, PLAY INSTEAD waits for CHOOSE A NAME, and CONTINUE takes the seat", async () => {
  const app = await namelessSpectatorInLobby();
  await act(() => app.onClickPlayInstead());
  expect(playerChecks()).toHaveLength(0);
  expect(app.state.spectator).toBe(true);
  expect(promptTitle(app)).toBe("CHOOSE A NAME");

  await confirmName("Sam");
  expect(savedNames()).toEqual(["Sam"]);
  expect(playerChecks()).toHaveLength(1);
  const calls = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url), "http://host").pathname);
  expect(calls.findIndex((path) => path.endsWith("/me/username"))).toBeLessThan(
    calls.findIndex((path) => path.endsWith("/check-login"))
  );
  expect(app.state.spectator).toBe(false);
  expect(app.state.name).toBe("Sam");
  expect(lastUrl()).toContain("rejoinKey=");
  expect(app.namePromptOpen).toBe(false);
});

test("PLAY INSTEAD pressed while CHOOSE A NAME waits in the queue takes the seat after its CONTINUE", async () => {
  vi.useFakeTimers();
  const app = await namelessSpectatorInLobby();
  // A game is watched to its end (the game page drops CHOOSE A NAME), and RETURN TO LOBBY fades
  // the victory screen out while the lobby packet queues CHOOSE A NAME behind it. A press goes
  // through the fading overlay to PLAY INSTEAD.
  await deliver(app, victoryPacket());
  await act(async () => {
    vi.advanceTimersByTime(10_000);
  });
  const victory = app.state.alertContent as React.ReactElement<{ buttonOnClick: () => void }>;
  expect(victory.type).toBe(ButtonPrompt);
  act(() => victory.props.buttonOnClick());
  await deliver(app, lobbyPacket);
  expect(app.namePromptOpen).toBe(true);
  expect(app.namePromptShown).toBe(false);
  await act(() => app.onClickPlayInstead());
  expect(playerChecks()).toHaveLength(0);
  await act(async () => {
    vi.advanceTimersByTime(1100);
  });
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
  await confirmName("Sam");
  expect(playerChecks()).toHaveLength(1);
  expect(app.state.spectator).toBe(false);
});

test("a queued CHOOSE A NAME dropped with the queue ends the PLAY INSTEAD waiting for it", async () => {
  vi.useFakeTimers();
  const app = await namelessSpectatorInLobby();
  await deliver(app, victoryPacket());
  await act(async () => {
    vi.advanceTimersByTime(10_000);
  });
  const victory = app.state.alertContent as React.ReactElement<{ buttonOnClick: () => void }>;
  act(() => victory.props.buttonOnClick());
  await deliver(app, lobbyPacket); // CHOOSE A NAME waits behind the victory screen's fade
  await act(() => app.onClickPlayInstead());
  act(() => app.clearAnimationQueue()); // and goes with the queue
  expect(app.namePromptOpen).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(1100);
  });
  await deliver(app, lobbyPacket); // asked again by itself
  await settle();
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
  await confirmName("Sam");
  expect(playerChecks()).toHaveLength(0);
  expect(app.state.spectator).toBe(true);
});

test("with no name and no prompt waiting, PLAY INSTEAD opens CHOOSE A NAME itself", async () => {
  const app = await spectatorInLobby();
  // The page's account has lost its name meanwhile, with no prompt asked for (set by hand).
  act(() => app.setState({ account: noName("Sam") }));
  expect(app.namePromptOpen).toBe(false);
  await act(() => app.onClickPlayInstead());
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
  expect(playerChecks()).toHaveLength(0);
  await confirmName("Sam");
  expect(app.state.spectator).toBe(false);
});

test("CONTINUE in a CHOOSE A NAME that opened by itself takes no seat", async () => {
  const app = await namelessSpectatorInLobby();
  await confirmName("Sam");
  expect(savedNames()).toEqual(["Sam"]);
  expect(app.state.showAlert).toBe(false);
  expect(playerChecks()).toHaveLength(0);
  expect(app.state.spectator).toBe(true);
  expect(screen.getByRole("button", { name: "PLAY INSTEAD" })).toBeEnabled();
});

test("SIGN OUT in CHOOSE A NAME after PLAY INSTEAD signs out and leaves the person watching", async () => {
  const app = await namelessSpectatorInLobby();
  const watching = lastSocket();
  await act(() => app.onClickPlayInstead());
  fireEvent.click(alertBox().getByRole("button", { name: "SIGN OUT" }));
  await settle();
  expect(app.state.account).toEqual(SIGNED_OUT);
  expect(screen.getByRole("link", { name: "SIGN IN TO PLAY" })).toBeInTheDocument();
  expect(playerChecks()).toHaveLength(0);
  expect(app.state.spectator).toBe(true);
  expect(lastSocket()).toBe(watching);
  expect(watching.closed).toBe(false);

  // Signed in again (with a name now), PLAY INSTEAD works: the one before holds nothing up.
  me = account("Sam");
  await act(() => app.loadAccount());
  await act(() => app.onClickPlayInstead());
  expect(playerChecks()).toHaveLength(1);
  expect(app.state.spectator).toBe(false);
});

test("a game starting while CHOOSE A NAME waits for PLAY INSTEAD drops the seat", async () => {
  vi.useFakeTimers();
  const app = await namelessSpectatorInLobby();
  await act(() => app.onClickPlayInstead());
  await deliver(app, gameStatePacket());
  expect(app.namePromptOpen).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(10_000); // the spectator's status lines run their course
  });
  await deliver(app, lobbyPacket); // back in the lobby, CHOOSE A NAME is asked again by itself
  await settle();
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
  await confirmName("Sam");
  expect(savedNames()).toEqual(["Sam"]);
  expect(playerChecks()).toHaveLength(0);
  expect(app.state.spectator).toBe(true);
  // PLAY INSTEAD works again: the dropped one holds nothing up.
  await act(() => app.onClickPlayInstead());
  expect(playerChecks()).toHaveLength(1);
  expect(app.state.spectator).toBe(false);
});

test("a name saved after the game started takes no seat", async () => {
  const app = await namelessSpectatorInLobby();
  await act(() => app.onClickPlayInstead());
  heldSaves = [];
  await confirmName("Sam");
  expect(heldSaves).toHaveLength(1);
  await deliver(app, gameStatePacket());
  const before = FakeSocket.instances.length;
  await act(async () => {
    heldSaves![0]();
  });
  await settle();
  expect(playerChecks()).toHaveLength(0);
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.spectator).toBe(true);
  expect(app.accountName()).toBe("Sam"); // the name was saved all the same
});

test("a name saved by an earlier CHOOSE A NAME answers the one PLAY INSTEAD waits for, and takes the seat", async () => {
  const app = await namelessSpectatorInLobby();
  heldSaves = [];
  await confirmName("Sam"); // its save is on its way...
  act(() => app.toLoginPage("Disconnected from the lobby.")); // ...as the page leaves: asked again
  await settle();
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
  act(() => {
    app.openWatch("HBIA"); // watching again, the prompt still open
  });
  await deliver(app, lobbyPacket);
  await act(() => app.onClickPlayInstead());
  expect(playerChecks()).toHaveLength(0);
  await act(async () => {
    heldSaves![0]();
  });
  await settle();
  expect(app.namePromptOpen).toBe(false);
  expect(playerChecks()).toHaveLength(1);
  expect(app.state.spectator).toBe(false);
  expect(app.state.name).toBe("Sam");
});

// The viewer's own name comes from the packets' `you`.

test("a lobby packet's `you` names the viewer, so a rename moves the mark and START GAME with the host", async () => {
  const app = await playerInLobby();
  await deliver(app, { ...lobbyPacket, [PARAM_YOU]: "Ann" });
  expect(markedRow()).toBe("Ann");
  expect(screen.getByRole("button", { name: "START GAME" })).toBeInTheDocument();

  // Renamed (here, or in another tab): the server sends the lobby again, the host still first.
  await deliver(app, {
    ...lobbyPacket,
    [PARAM_USERNAMES]: ["Anna", "Ben"],
    [PARAM_ICON]: { Anna: "p1", Ben: "p2" },
    [PARAM_YOU]: "Anna",
  });
  expect(app.state.name).toBe("Anna");
  expect(markedRow()).toBe("Anna");
  expect(screen.getByRole("button", { name: "START GAME" })).toBeInTheDocument();
  expect(app.state.showAlert).toBe(false); // Anna has her portrait: no picker
});

test("a guest renamed in another tab: the mark follows, and START GAME stays the host's", async () => {
  const app = await renderApp();
  act(() => {
    app.tryOpenWebSocket("Ben", "HBIA");
  });
  await deliver(app, { ...lobbyPacket, [PARAM_YOU]: "Ben" });
  expect(markedRow()).toBe("Ben");
  await deliver(app, {
    ...lobbyPacket,
    [PARAM_USERNAMES]: ["Ann", "Benny"],
    [PARAM_ICON]: { Ann: "p1", Benny: "p2" },
    [PARAM_YOU]: "Benny",
  });
  expect(app.state.name).toBe("Benny");
  expect(markedRow()).toBe("Benny");
  expect(screen.queryByRole("button", { name: "START GAME" })).toBeNull();
});

test("a spectator's packets carry no `you`: the name stays empty and no row is marked", async () => {
  const app = await spectatorInLobby();
  await deliver(app, lobbyPacket);
  expect(app.state.name).toBe("");
  expect(markedRow()).toBe("");
  // Nor does a stray one name a spectator, in the lobby or in a game.
  await deliver(app, { ...lobbyPacket, [PARAM_YOU]: "Ann" });
  expect(app.state.name).toBe("");
  await deliver(app, { ...gameStatePacket(), [PARAM_YOU]: "Ann" });
  expect(app.state.name).toBe("");
});

test("a game packet's `you` is the seat's name, which the game and its prompts use", async () => {
  vi.useFakeTimers();
  const app = await renderApp();
  act(() => {
    app.tryOpenWebSocket("Zed", "HBIA"); // a name the page last knew, from before a rename
  });
  await deliver(app, { ...gameStatePacket(), [PARAM_YOU]: "Ann" });
  expect(app.state.name).toBe("Ann");
  expect(app.state.page).toBe("game");
  const role = app.state.alertContent as React.ReactElement<React.ComponentProps<typeof RoleAlert>>;
  expect(role.type).toBe(RoleAlert);
  expect(role.props.name).toBe("Ann");
  expect(document.querySelector(".roster-row.is-user")).toHaveAttribute("data-player", "Ann");
});

// CHANGE NAME in the lobby.

test("CHANGE NAME in the lobby saves the name, and the server's lobby packet shows it", async () => {
  const app = await playerInLobby();
  fireEvent.click(screen.getByRole("button", { name: "CHANGE NAME" }));
  expect(promptTitle(app)).toBe("CHANGE NAME");
  expect(alertBox().getByRole("textbox", { name: "Your name" })).toHaveValue("Ann");
  await confirmName("Anna", "SAVE");
  expect(savedNames()).toEqual(["Anna"]);
  expect(app.state.showAlert).toBe(false);
  await deliver(app, {
    ...lobbyPacket,
    [PARAM_USERNAMES]: ["Anna", "Ben"],
    [PARAM_ICON]: { Anna: "p1", Ben: "p2" },
    [PARAM_YOU]: "Anna",
  });
  expect(markedRow()).toBe("Anna");
  expect(screen.getByRole("button", { name: "START GAME" })).toBeInTheDocument();
});

test("CHANGE NAME in the lobby starts from the name the lobby shows, after a rename in another tab", async () => {
  const app = await playerInLobby();
  await deliver(app, {
    ...lobbyPacket,
    [PARAM_USERNAMES]: ["Anna", "Ben"],
    [PARAM_ICON]: { Anna: "p1", Ben: "p2" },
    [PARAM_YOU]: "Anna",
  });
  fireEvent.click(screen.getByRole("button", { name: "CHANGE NAME" }));
  expect(alertBox().getByRole("textbox", { name: "Your name" })).toHaveValue("Anna");
});

test("a portrait picker queued before WATCH INSTEAD does not open for the spectator", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  // An alert fades out for a second, holding the queue.
  act(() => app.queueAlert(<div />, false));
  act(() => app.hideAlertAndFinish());
  // Meanwhile a lobby packet with the default portrait queues the picker behind it.
  await deliver(app, { ...lobbyPacket, [PARAM_ICON]: { Ann: defaultPortrait, Ben: "p2" } });
  await act(async () => {
    vi.advanceTimersByTime(600);
  });
  act(() => app.onClickWatchInstead());
  await act(async () => {
    vi.advanceTimersByTime(600);
  });
  expect(app.state.spectator).toBe(true);
  expect(app.state.showAlert).toBe(false);
  expect((app.state.alertContent as React.ReactElement).type).not.toBe(IconSelection);
  expect(app.allAnimationsFinished).toBe(true);
});

test("WATCH INSTEAD that cannot open a socket lands on the login page with the lobby", async () => {
  const app = await playerInLobby();
  FakeSocket.failNext = true;
  act(() => app.onClickWatchInstead());
  expect(app.state.page).toBe("login");
  expect(app.state.joinLobby).toBe("HBIA");
  expect(app.state.joinError).toBe(CONNECT_ERROR);
  expect(FakeSocket.instances[0].closed).toBe(true);
});

test("PLAY INSTEAD that cannot open a socket keeps the spectator watching", async () => {
  const app = await spectatorInLobby();
  FakeSocket.failNext = true;
  await act(() => app.onClickPlayInstead());
  expect(note()).toBe(CONNECT_ERROR);
  expect(FakeSocket.instances[0].closed).toBe(false);
  expect(app.state.spectator).toBe(true);
  expect(app.state.showAlert).toBe(false);
  expect(Cookies.get("spectator")).toBe("true");
  expect(Cookies.get("lobby")).toBeUndefined();
});

test("a fade timer from an earlier alert does not blank a new prompt", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  // A portrait confirmed: the queue is cleared and the alert fades for a second.
  act(() => {
    app.clearAnimationQueue();
    app.hideAlertAndFinish();
  });
  act(() => app.onClickChangeName());
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(app.state.showAlert).toBe(true);
  expect(app.namePromptOpen).toBe(true);
  expect(promptTitle(app)).toBe("CHANGE NAME");
});

test("CANCEL, CHANGE NAME and a game start within a second leave no name prompt", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => app.onClickChangeName());
  act(() => promptProps(app).onSecondary()); // CANCEL: the prompt fades for a second
  act(() => app.onClickChangeName()); // queued behind the fading prompt
  await deliver(app, gameStatePacket());
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(app.namePromptOpen).toBe(false);
  expect((app.state.alertContent as React.ReactElement).type).not.toBe(NamePrompt);
});

test("a reopened CHANGE NAME starts fresh, even after a save was cut off by CANCEL", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  heldSaves = [];
  act(() => app.onClickChangeName());
  fireEvent.change(alertBox().getByRole("textbox"), { target: { value: "Zed" } });
  fireEvent.click(alertBox().getByRole("button", { name: "SAVE" }));
  fireEvent.click(alertBox().getByRole("button", { name: "CANCEL" }));
  await act(async () => {
    vi.advanceTimersByTime(1100);
  });
  act(() => app.onClickChangeName());
  await act(async () => {
    vi.advanceTimersByTime(600);
  });
  expect(alertBox().getByRole("textbox")).toHaveValue("Ann");
  expect(alertBox().getByRole("button", { name: "SAVE" })).toBeEnabled();
});

test("a reconnect that cannot build a socket ends on the login page", async () => {
  const app = await playerInLobby();
  FakeSocket.failNext = true;
  act(() => FakeSocket.instances[0].onclose?.());
  expect(app.state.page).toBe("login");
  expect(app.state.joinLobby).toBe("HBIA");
  expect(app.state.joinError).toBe("Disconnected from the lobby.");
});

const victoryPacket = () => {
  const names = ["Ann", "Ben", "Cat", "Dan", "Eve"];
  const state = makeGameState(names, { state: LobbyState.LIBERAL_VICTORY_POLICY });
  names.forEach((name, i) => {
    state.players[name].id = i === 0 ? Role.HITLER : i === 1 ? Role.FASCIST : Role.LIBERAL;
  });
  return { ...state, [PARAM_PACKET_TYPE]: PACKET_GAME_STATE };
};

test("a portrait CONFIRM's fade does not cut short the game's first step", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  await deliver(app, { ...lobbyPacket, [PARAM_ICON]: { Ann: defaultPortrait, Ben: "p2" } });
  const picker = app.state.alertContent as React.ReactElement<{ onConfirm: () => void }>;
  expect(picker.type).toBe(IconSelection);
  act(() => picker.props.onConfirm()); // the queue is cleared and the picker fades for a second
  act(() => app.onClickWatchInstead());
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
  // The game starts: a spectator gets no role alert, so its first step is the event bar (2.5 s).
  await deliver(app, gameStatePacket());
  expect(app.state.showEventBar).toBe(true);
  await act(async () => {
    vi.advanceTimersByTime(1500); // past the picker's fade
  });
  expect(app.state.showEventBar).toBe(true);
  expect(app.allAnimationsFinished).toBe(false);
  expect(app.state.statusBarText).toBe("---");
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(app.allAnimationsFinished).toBe(true);
  expect(app.state.statusBarText).not.toBe("---");
});

test("a fade timer from an earlier alert does not blank the victory screen", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => {
    app.clearAnimationQueue();
    app.hideAlertAndFinish();
  });
  await deliver(app, victoryPacket());
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(app.state.showAlert).toBe(true);
  expect((app.state.alertContent as React.ReactElement).type).toBe(ButtonPrompt);
});

test("RETURN TO LOBBY that cannot build a socket goes to the login page with the lobby", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  await deliver(app, victoryPacket());
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  const prompt = app.state.alertContent as React.ReactElement<{ buttonOnClick: () => void }>;
  expect(prompt.type).toBe(ButtonPrompt);
  act(() => app.setState({ statusBarText: "Liberals win", statusStep: RoundStep.ELECTION }));
  FakeSocket.failNext = true;
  act(() => prompt.props.buttonOnClick());
  expect(app.state.page).toBe("login");
  expect(app.state.joinLobby).toBe("HBIA");
  expect(app.state.joinError).toBe(CONNECT_ERROR);
  expect(app.state.statusBarText).toBe("---");
  expect(app.state.statusStep).toBeNull();
});

test("RETURN TO LOBBY starts from an empty lobby until the first packet", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  await deliver(app, victoryPacket());
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  const prompt = app.state.alertContent as React.ReactElement<{ buttonOnClick: () => void }>;
  expect(prompt.type).toBe(ButtonPrompt);
  act(() => prompt.props.buttonOnClick());
  expect(app.state.page).toBe("lobby");
  expect(app.state.usernames).toEqual([]);
});

test("a join after giving up still retries a socket that closes before its first message", async () => {
  const app = await playerInLobby();
  loseConnectionForGood(app);
  expect(app.state.page).toBe("login");
  expect(app.reconnectAttempts).toBeGreaterThan(0);
  await act(async () => {
    app.setState({ joinLobby: "HBIA" });
    app.onClickJoin();
  });
  const before = FakeSocket.instances.length;
  act(() => FakeSocket.instances[before - 1].onclose?.());
  expect(FakeSocket.instances.length).toBe(before + 1);
  expect(app.state.page).toBe("lobby");
});

test("JOIN checks and joins as the account, sending no name", async () => {
  me = account("Sam");
  const app = await renderApp();
  await act(async () => {
    app.setState({ joinLobby: "HBIA" });
  });
  await act(async () => {
    app.onClickJoin();
  });
  const check = vi
    .mocked(fetch)
    .mock.calls.map(([url]) => new URL(String(url), "http://host"))
    .find((url) => url.pathname.endsWith("/check-login"));
  expect(check?.search).toBe("?lobby=HBIA");
  const socket = new URL(lastUrl(), "http://host").searchParams;
  expect([...socket.keys()]).toEqual(["lobby", "rejoinKey"]);
  expect(socket.get("lobby")).toBe("HBIA");
  expect(app.state.name).toBe("Sam");
  expect(app.state.page).toBe("lobby");
  expect(Cookies.get("lobby")).toBe("HBIA");
  expect(Cookies.get("name")).toBeUndefined();
});

test("CREATE LOBBY joins the new lobby as the account, sending no name", async () => {
  me = account("Sam Lee");
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(String(url).endsWith("/me") ? meResponse() : new Response("HBIA", { status: 200 }))
    )
  );
  const app = await renderApp();
  await act(async () => {
    app.onClickCreateLobby();
  });
  const socket = new URL(lastUrl(), "http://host").searchParams;
  expect([...socket.keys()]).toEqual(["lobby", "rejoinKey"]);
  expect(socket.get("lobby")).toBe("HBIA");
  expect(app.state.name).toBe("Sam Lee");
  expect(Cookies.get("name")).toBeUndefined();
});

test("LEAVE LOBBY puts the code back in the login page's field", async () => {
  const app = await playerInLobby();
  act(() => app.onClickLeaveLobby());
  act(() => lastSocket().onclose?.({ code: 1000 }));
  expect(app.state.page).toBe("login");
  expect(app.state.joinLobby).toBe("HBIA");
  expect(document.getElementById("login-lobby-field")).toHaveValue("HBIA");
});

test("a reload rejoins as before: the lobby cookie fills the code, and JOIN takes the seat", async () => {
  me = account("Sam");
  Cookies.set("lobby", "HBIA");
  const app = await renderApp();
  expect(document.getElementById("login-lobby-field")).toHaveValue("HBIA");
  const join = document.querySelector(".login-join-buttons button") as HTMLButtonElement;
  expect(join).toHaveTextContent("JOIN");
  expect(join).toBeEnabled();
  await act(async () => {
    fireEvent.click(join);
  });
  expect(app.state.page).toBe("lobby");
  expect(app.state.name).toBe("Sam");
  expect(new URL(lastUrl(), "http://host").searchParams.get("lobby")).toBe("HBIA");
});

test("START GAME on a socket still connecting is sent once it opens", async () => {
  const app = await playerInLobby();
  FakeSocket.connecting = true;
  // A reconnect in the lobby keeps the players on screen, so START GAME stays on.
  act(() => FakeSocket.instances[0].onclose?.());
  const retry = FakeSocket.instances[FakeSocket.instances.length - 1];
  expect(retry.readyState).toBe(0);
  expect(document.querySelector(".lobby-start")).toBeEnabled();
  expect(() => act(() => app.onClickStartGame())).not.toThrow();
  expect(retry.send).not.toHaveBeenCalled();
  act(() => retry.open());
  expect(retry.send).toHaveBeenCalledTimes(1);
  expect(JSON.parse(retry.send.mock.calls[0][0])).toMatchObject({
    command: "start-game",
    name: "Ann",
    lobby: "HBIA",
  });
});

test("an event bar cut off by a cleared queue does not finish the next queue's step", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => app.queueEventUpdate("VOTING")); // its finish timer is due at 2.5 s
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  act(() => app.clearAnimationQueue()); // a disconnect sent the page to the login page
  // A new queue: an event bar due to end at 3.5 s, then a status line.
  act(() => app.queueEventUpdate("CHANCELLOR NOMINATION"));
  act(() => app.queueStatusMessage("next", null));
  await act(async () => {
    vi.advanceTimersByTime(1600); // t = 2.6 s, past the old timer
  });
  expect(app.state.statusBarText).not.toBe("next");
  expect(app.allAnimationsFinished).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(1000); // t = 3.6 s
  });
  expect(app.state.statusBarText).toBe("next");
  expect(app.allAnimationsFinished).toBe(true);
});

test("a vote tally cut off by a cleared queue does not finish the next queue's step", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  const state = makeGameState(["Ann", "Ben", "Cat", "Dan", "Eve"]);
  act(() => app.addAnimationToQueue(() => app.showVotes(state))); // its finish timer is due at 6.5 s
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  act(() => app.clearAnimationQueue()); // a disconnect sent the page to the login page
  // A new queue: an event bar due to end at 7.5 s, then a status line.
  act(() => app.queueEventUpdate("VOTING"));
  act(() => app.queueStatusMessage("next", null));
  await act(async () => {
    vi.advanceTimersByTime(2000); // t = 7.0 s, past the old timer
  });
  expect(app.state.statusBarText).not.toBe("next");
  expect(app.allAnimationsFinished).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(600); // t = 7.6 s
  });
  expect(app.state.statusBarText).toBe("next");
  expect(app.allAnimationsFinished).toBe(true);
});

test("a held status line cut off by a cleared queue does not finish the next queue's step", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => app.queueStatusMessage("held", null, 3000)); // its finish timer is due at 3 s
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  act(() => app.clearAnimationQueue());
  act(() => app.queueEventUpdate("VOTING")); // due to end at 3.5 s
  act(() => app.queueStatusMessage("next", null));
  await act(async () => {
    vi.advanceTimersByTime(2400); // t = 3.4 s, past the old timer
  });
  expect(app.state.statusBarText).not.toBe("next");
  await act(async () => {
    vi.advanceTimersByTime(200); // t = 3.6 s
  });
  expect(app.state.statusBarText).toBe("next");
});

const okPacket = { [PARAM_PACKET_TYPE]: PACKET_OK };

test("a closeOnOK prompt closes on its own OK", async () => {
  const app = await playerInLobby();
  act(() => app.queueAlert(<div />));
  expect(app.state.showAlert).toBe(true);
  await deliver(app, okPacket);
  expect(app.state.showAlert).toBe(false);
  expect(app.allAnimationsFinished).toBe(true);
});

test("an OK goes to the prompt on screen, past a listener whose prompt closed by its own button", async () => {
  const app = await playerInLobby();
  // Like the election tracker alert: closeOnOK, but the player closed it, so no OK came.
  act(() => app.queueAlert(<div />));
  act(() => app.hideAlertAndFinish(false));
  act(() => app.queueAlert(<span />)); // the next closeOnOK prompt, a vote say
  expect(app.state.showAlert).toBe(true);
  await deliver(app, okPacket);
  expect(app.state.showAlert).toBe(false);
});

test("an OK listener from before a lost connection does not close the next lobby's picker", async () => {
  const app = await playerInLobby();
  act(() => app.queueAlert(<div />)); // a closeOnOK prompt on screen
  loseConnectionForGood(app);
  expect(app.state.page).toBe("login");
  await act(async () => {
    app.setState({ joinLobby: "HBIA" });
  });
  await act(async () => {
    app.onClickJoin();
  });
  await deliver(app, lobbyPacket);
  act(() => app.onClickChangeIcon());
  expect((app.state.alertContent as React.ReactElement).type).toBe(IconSelection);
  const seat = FakeSocket.instances[FakeSocket.instances.length - 1];
  fireEvent.click(document.querySelector("#icon-container #icon.selectable:not(.disabled):not(.selected)")!);
  expect(seat.send).toHaveBeenCalledTimes(1);
  expect(JSON.parse(seat.send.mock.calls[0][0])).toMatchObject({ command: "select-icon" });
  await deliver(app, okPacket);
  expect(app.state.showAlert).toBe(true);
  expect((app.state.alertContent as React.ReactElement).type).toBe(IconSelection);
});

test("an OK listener whose prompt closed by its own button does not close the picker", async () => {
  const app = await playerInLobby();
  // Like a policy alert closed by its own button: closeOnOK, but no OK came and no queue was cleared.
  act(() => app.queueAlert(<div />));
  act(() => app.hideAlertAndFinish(false));
  act(() => app.onClickChangeIcon());
  expect((app.state.alertContent as React.ReactElement).type).toBe(IconSelection);
  fireEvent.click(document.querySelector("#icon-container #icon.selectable:not(.disabled):not(.selected)")!);
  await deliver(app, okPacket);
  expect(app.state.showAlert).toBe(true);
  expect((app.state.alertContent as React.ReactElement).type).toBe(IconSelection);
});

// Reconnecting after a lost socket (#26).

test("a player's socket brings the page's rejoin key on every reconnect, and a spectator's none", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  const key = new URL(lastUrl()).searchParams.get("rejoinKey");
  expect(key).toMatch(/^[0-9a-f]{32}$/);
  act(() => lastSocket().onclose?.()); // reconnects at once
  expect(new URL(lastUrl()).searchParams.get("rejoinKey")).toBe(key);
  act(() => lastSocket().onclose?.()); // reconnects after a wait
  act(() => vi.advanceTimersByTime(RECONNECT_DELAYS[1]));
  expect(FakeSocket.instances).toHaveLength(3);
  expect(new URL(lastUrl()).searchParams.get("rejoinKey")).toBe(key);
  act(() => app.onClickWatchInstead());
  expect(lastUrl()).toContain("spectator=true");
  expect(lastUrl()).not.toContain("rejoinKey");
});

test("each page has its own rejoin key", async () => {
  await playerInLobby();
  const first = new URL(lastUrl()).searchParams.get("rejoinKey");
  await playerInLobby();
  expect(new URL(lastUrl()).searchParams.get("rejoinKey")).not.toBe(first);
});

test("reconnects wait longer each time, then give up on the login page", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => lastSocket().onclose?.());
  expect(FakeSocket.instances).toHaveLength(2); // the first at once
  for (const delay of RECONNECT_DELAYS.slice(1)) {
    const before = FakeSocket.instances.length;
    act(() => lastSocket().onclose?.());
    expect(app.state.snackbarMessage).toBe("Lost connection to the server: retrying...");
    act(() => vi.advanceTimersByTime(delay - 1));
    expect(FakeSocket.instances, `before ${delay} ms`).toHaveLength(before);
    expect(app.state.page).toBe("lobby");
    act(() => vi.advanceTimersByTime(1));
    expect(FakeSocket.instances, `after ${delay} ms`).toHaveLength(before + 1);
    expect(lastUrl()).toContain("rejoinKey="); // a player's socket again
  }
  act(() => lastSocket().onclose?.());
  expect(app.state.page).toBe("login");
  expect(app.state.joinError).toBe("Disconnected from the lobby.");
  expect(app.state.joinLobby).toBe("HBIA");
});

test("a packet on the new socket makes the next reconnect immediate again", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => lastSocket().onclose?.());
  act(() => lastSocket().onclose?.());
  act(() => vi.advanceTimersByTime(RECONNECT_DELAYS[1]));
  await deliver(app, lobbyPacket);
  const before = FakeSocket.instances.length;
  act(() => lastSocket().onclose?.());
  expect(FakeSocket.instances).toHaveLength(before + 1);
});

/** The commands a socket has sent, by name. */
const sentCommands = (socket: FakeSocket) =>
  socket.send.mock.calls.map(([data]) => JSON.parse(data).command as string);

async function playerInGame() {
  const app = await playerInLobby();
  await deliver(app, gameStatePacket());
  expect(app.state.page).toBe("game");
  return app;
}

test("presses in a game while reconnecting go, in order, once the server takes a new socket", async () => {
  vi.useFakeTimers();
  const app = await playerInGame();
  const vote = (vote: boolean) =>
    act(() => app.sendWSCommand({ command: WSCommandType.REGISTER_VOTE, vote }));
  act(() => lastSocket().onclose?.()); // reconnects at once...
  const first = lastSocket();
  act(() => first.onclose?.()); // ...which fails: the next one waits
  vote(true);
  expect(app.state.snackbarMessage).not.toContain("Could not connect");
  FakeSocket.connecting = true;
  act(() => vi.advanceTimersByTime(RECONNECT_DELAYS[1]));
  const second = lastSocket();
  vote(false); // while the attempt is still connecting
  act(() => second.open());
  act(() => second.onclose?.()); // open, but closed before the server's first message
  act(() => vi.advanceTimersByTime(RECONNECT_DELAYS[2]));
  const third = lastSocket();
  act(() => third.open());
  expect(sentCommands(third), "open is not enough: the server may still refuse it").toEqual([]);
  await deliver(app, gameStatePacket());
  const votes = third.send.mock.calls.map(([data]) => JSON.parse(data));
  expect(votes).toMatchObject([
    { command: "register-vote", vote: true, name: "Ann", lobby: "HBIA" },
    { command: "register-vote", vote: false, name: "Ann", lobby: "HBIA" },
  ]);
  for (const socket of [first, second]) expect(sentCommands(socket)).toEqual([]);
});

test("a press in the lobby while a reconnect waits is not kept, and says it is retrying", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => lastSocket().onclose?.());
  act(() => lastSocket().onclose?.());
  act(() => app.onClickStartGame());
  expect(app.state.snackbarMessage).toBe("Lost connection to the server: retrying...");
  act(() => vi.advanceTimersByTime(RECONNECT_DELAYS[1]));
  await deliver(app, lobbyPacket);
  expect(sentCommands(lastSocket())).not.toContain("start-game");
});

test("a socket with no pong within REPLY_TIMEOUT of a ping is dropped and reopened", async () => {
  vi.useFakeTimers();
  const app = await playerInGame();
  const live = lastSocket();
  act(() => vi.advanceTimersByTime(PING_INTERVAL));
  expect(sentCommands(live)).toEqual(["ping"]);
  await deliver(app, { [PARAM_PACKET_TYPE]: "pong" });
  act(() => vi.advanceTimersByTime(PING_INTERVAL));
  expect(sentCommands(live)).toEqual(["ping", "ping"]);
  act(() => vi.advanceTimersByTime(REPLY_TIMEOUT - 1));
  expect(FakeSocket.instances, "answered in time so far").toHaveLength(1);
  act(() => vi.advanceTimersByTime(1));
  expect(live.closed).toBe(true);
  expect(FakeSocket.instances).toHaveLength(2);
  expect(lastUrl()).toContain("rejoinKey="); // a player's socket again
  expect(app.state.page).toBe("game");
});

test("an attempt the server never answers is given up after REPLY_TIMEOUT for the next one", async () => {
  vi.useFakeTimers();
  await playerInLobby();
  act(() => lastSocket().onclose?.());
  const stuck = lastSocket(); // connecting, say, on a network that has gone
  act(() => vi.advanceTimersByTime(REPLY_TIMEOUT));
  expect(stuck.closed).toBe(true);
  act(() => vi.advanceTimersByTime(RECONNECT_DELAYS[1]));
  expect(FakeSocket.instances).toHaveLength(3);
});

test("a page coming back into view pings at once", async () => {
  vi.useFakeTimers();
  await playerInGame();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  try {
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(sentCommands(lastSocket())).toEqual(["ping"]);
  } finally {
    visibility.mockRestore();
  }
});

test("a socket the server refuses outright ends on the login page at once", async () => {
  const app = await playerInGame();
  act(() => lastSocket().onclose?.()); // the network went: reconnect at once
  const before = FakeSocket.instances.length;
  act(() => lastSocket().onclose?.({ code: 1002, reason: "The lobby 'HBIA' does not exist." }));
  expect(app.state.page).toBe("login");
  expect(app.state.joinError).toBe("Disconnected from the lobby.");
  expect(FakeSocket.instances).toHaveLength(before);
});

test("a socket closed for a bad command after it has spoken still reconnects", async () => {
  const app = await playerInGame();
  act(() => lastSocket().onclose?.({ code: 1002, reason: "RuntimeException: not the president" }));
  expect(FakeSocket.instances).toHaveLength(2);
  expect(app.state.page).toBe("game");
});

test("LEAVE LOBBY while a reconnect waits leaves at once and reconnects no more", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => lastSocket().onclose?.());
  act(() => lastSocket().onclose?.());
  const before = FakeSocket.instances.length;
  act(() => app.onClickLeaveLobby());
  expect(app.state.page).toBe("login");
  expect(app.state.joinError).toBe("");
  act(() => vi.advanceTimersByTime(60_000));
  expect(FakeSocket.instances).toHaveLength(before);
});

test("WATCH INSTEAD while a reconnect waits opens only the spectator's socket", async () => {
  vi.useFakeTimers();
  const app = await playerInLobby();
  act(() => lastSocket().onclose?.());
  act(() => lastSocket().onclose?.());
  act(() => app.onClickWatchInstead());
  const watching = lastSocket();
  expect(watching.url).toContain("spectator=true");
  await deliver(app, lobbyPacket);
  // Past the longest wait, and short of the first ping, which the stand-in socket would not answer.
  act(() => vi.advanceTimersByTime(Math.max(...RECONNECT_DELAYS)));
  expect(lastSocket()).toBe(watching);
  expect(app.state.spectator).toBe(true);
});
