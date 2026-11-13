import { act, render } from "@testing-library/react";
import Cookies from "js-cookie";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import {
  PACKET_GAME_STATE,
  PACKET_LOBBY,
  PARAM_ICON,
  PARAM_PACKET_TYPE,
  PARAM_USERNAMES,
} from "./constants";
import { makeGameState } from "./game/testGameState";
import { CONTACT_ERROR } from "./lobby/joinError";

class FakeSocket {
  static instances: FakeSocket[] = [];
  OPEN = 1;
  closed = false;
  onclose: (() => void) | null = null;
  onmessage: ((msg: MessageEvent) => void) | null = null;
  send = vi.fn();
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

let checkStatus = 200;
let checkRejects = false;

beforeEach(() => {
  FakeSocket.instances = [];
  checkStatus = 200;
  checkRejects = false;
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      String(url).includes("check-login") && checkRejects
        ? Promise.reject(new Error("down"))
        : Promise.resolve(
            new Response(null, {
              status: String(url).includes("check-login") ? checkStatus : 200,
            })
          )
    )
  );
});

afterEach(() => {
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

async function playerInLobby() {
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  act(() => {
    app.tryOpenWebSocket("Ann", "HBIA");
  });
  await deliver(app, lobbyPacket);
  return app;
}

async function spectatorInLobby() {
  Cookies.set("name", "Sam");
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  act(() => {
    app.tryOpenWebSocket("", "HBIA", true);
  });
  await deliver(app, lobbyPacket);
  return app;
}

const lastUrl = () => FakeSocket.instances[FakeSocket.instances.length - 1].url;

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

test("the old socket closing stays in the lobby", async () => {
  const app = await playerInLobby();
  act(() => app.onClickWatchInstead());
  act(() => FakeSocket.instances[0].onclose?.());
  expect(app.state.page).toBe("lobby");
});

test("PLAY INSTEAD seats the spectator", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  expect(app.state.showAlert).toBe(true);
  let result: string | undefined;
  await act(async () => {
    result = await app.playInstead("Sam");
  });
  expect(result).toBe("");
  expect(lastUrl()).toContain("name=Sam");
  expect(Cookies.get("name")).toBe("Sam");
  expect(Cookies.get("lobby")).toBe("HBIA");
  expect(Cookies.get("spectator")).toBeUndefined();
  expect(app.state.showAlert).toBe(false);
  expect(app.state.spectator).toBe(false);
});

test("a taken name keeps the spectator watching", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  checkStatus = 403;
  const before = FakeSocket.instances.length;
  let result: string | undefined;
  await act(async () => {
    result = await app.playInstead("Sam");
  });
  expect(result).toBe("There is already a user with the name 'Sam' in the lobby.");
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.spectator).toBe(true);
});

test("the server unreachable resolves the contact error", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  checkRejects = true;
  let result: string | undefined;
  await act(async () => {
    result = await app.playInstead("Sam");
  });
  expect(result).toBe(CONTACT_ERROR);
  expect(app.state.spectator).toBe(true);
});

test("a game starting closes the prompt", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  expect(app.playInsteadOpen).toBe(true);
  await deliver(app, {
    ...makeGameState(["Ann", "Ben", "Cat", "Dan", "Eve"]),
    [PARAM_PACKET_TYPE]: PACKET_GAME_STATE,
  });
  expect(app.state.showAlert).toBe(false);
  expect(app.playInsteadOpen).toBe(false);
});

test("a check that returns after the game started opens no player socket", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  const pending = app.playInstead("Sam");
  await deliver(app, {
    ...makeGameState(["Ann", "Ben", "Cat", "Dan", "Eve"]),
    [PARAM_PACKET_TYPE]: PACKET_GAME_STATE,
  });
  const before = FakeSocket.instances.length;
  await act(async () => {
    expect(await pending).toBe("");
  });
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.spectator).toBe(true);
});
