import { act, render } from "@testing-library/react";
import Cookies from "js-cookie";
import React, { createRef } from "react";
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
import { CONNECT_ERROR, CONTACT_ERROR } from "./lobby/joinError";
import IconSelection from "./custom-alert/IconSelection";
import PlayInsteadPrompt from "./custom-alert/PlayInsteadPrompt";
import { defaultPortrait } from "./assets";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static failNext = false;
  OPEN = 1;
  closed = false;
  onclose: (() => void) | null = null;
  onmessage: ((msg: MessageEvent) => void) | null = null;
  send = vi.fn();
  constructor(public url: string) {
    if (FakeSocket.failNext) {
      FakeSocket.failNext = false;
      throw new Error("cannot open");
    }
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
  FakeSocket.failNext = false;
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

function promptProps(app: App) {
  const content = app.state.alertContent as React.ReactElement<
    React.ComponentProps<typeof PlayInsteadPrompt>
  >;
  expect(content.type).toBe(PlayInsteadPrompt);
  return content.props;
}

const gameStatePacket = () => ({
  ...makeGameState(["Ann", "Ben", "Cat", "Dan", "Eve"]),
  [PARAM_PACKET_TYPE]: PACKET_GAME_STATE,
});

const lastUrl = () => FakeSocket.instances[FakeSocket.instances.length - 1].url;

test("WATCH INSTEAD opens a spectator socket and remembers it", async () => {
  Cookies.set("name", "Ann");
  const app = await playerInLobby();
  act(() => app.onClickWatchInstead());
  expect(lastUrl()).toContain("spectator=true");
  expect(lastUrl()).toContain("lobby=HBIA");
  expect(lastUrl()).not.toContain("name=");
  expect(FakeSocket.instances[0].closed).toBe(true);
  expect(Cookies.get("spectator")).toBe("true");
  expect(Cookies.get("name")).toBe("Ann");
  expect(app.state.spectator).toBe(true);
  expect(app.state.page).toBe("lobby");
});

test("the old socket closing stays in the lobby", async () => {
  const app = await playerInLobby();
  act(() => app.onClickWatchInstead());
  const before = FakeSocket.instances.length;
  act(() => FakeSocket.instances[0].onclose?.());
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.failedConnections).toBe(0);
  expect(app.state.page).toBe("lobby");
});

test("PLAY INSTEAD seats the spectator", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  expect(app.state.showAlert).toBe(true);
  expect(promptProps(app).initialName).toBe("Sam");
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
  expect(FakeSocket.instances[0].closed).toBe(true);
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
  expect(app.state.showAlert).toBe(true);
  expect(app.playInsteadOpen).toBe(true);
  expect(Cookies.get("spectator")).toBeUndefined();
  expect(Cookies.get("lobby")).toBeUndefined();
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

test("CANCEL closes the prompt", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  act(() => promptProps(app).onCancel());
  expect(app.state.showAlert).toBe(false);
  expect(app.playInsteadOpen).toBe(false);
});

test("CANCEL during a check opens no socket and shows no error", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  checkStatus = 403;
  const before = FakeSocket.instances.length;
  const pending = app.playInstead("Sam");
  act(() => promptProps(app).onCancel());
  await act(async () => {
    expect(await pending).toBe("");
  });
  expect(FakeSocket.instances.length).toBe(before);
  expect(app.state.spectator).toBe(true);
});

test("a spectator's lobby packet keeps the prompt", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  await deliver(app, lobbyPacket);
  expect(app.state.showAlert).toBe(true);
  expect(app.playInsteadOpen).toBe(true);
  promptProps(app);
});

test("the portrait picker opens after PLAY INSTEAD, even when the lobby packet is quick", async () => {
  vi.useFakeTimers();
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  await act(async () => {
    expect(await app.playInstead("Sam")).toBe("");
  });
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

test("a lasting disconnect drops the prompt", async () => {
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  for (let i = 0; i < 20 && app.state.page !== "login"; i++) {
    act(() => FakeSocket.instances[FakeSocket.instances.length - 1].onclose?.());
  }
  expect(app.state.page).toBe("login");
  expect(app.playInsteadOpen).toBe(false);
  expect(app.state.showAlert).toBe(false);
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
  act(() => app.onClickPlayInstead());
  FakeSocket.failNext = true;
  let result: string | undefined;
  await act(async () => {
    result = await app.playInstead("Sam");
  });
  expect(result).toBe(CONNECT_ERROR);
  expect(FakeSocket.instances[0].closed).toBe(false);
  expect(app.state.spectator).toBe(true);
  expect(Cookies.get("spectator")).toBeUndefined();
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
  act(() => app.onClickWatchInstead());
  act(() => app.onClickPlayInstead());
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(app.state.showAlert).toBe(true);
  expect(app.playInsteadOpen).toBe(true);
  promptProps(app);
});

test("CANCEL, PLAY INSTEAD and a game start within a second leave no prompt", async () => {
  vi.useFakeTimers();
  const app = await spectatorInLobby();
  act(() => app.onClickPlayInstead());
  act(() => app.closePlayInstead());
  act(() => app.onClickPlayInstead()); // queued behind the fading prompt
  await deliver(app, gameStatePacket());
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  expect(app.playInsteadOpen).toBe(false);
  expect(app.state.showAlert).toBe(false);
});
