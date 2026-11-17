import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Cookies from "js-cookie";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import type { Me } from "./account/account";
import {
  PACKET_GAME_STATE,
  PACKET_LOBBY,
  PARAM_ICON,
  PARAM_PACKET_TYPE,
  PARAM_USERNAMES,
} from "./constants";
import { makeGameState } from "./game/testGameState";
import { LobbyState, type Role } from "./types";

const SIGNED_OUT: Me = { signedIn: false, discord: true, testSignIn: false };
const ROWAN: Me = {
  signedIn: true,
  id: "123456789",
  username: "Rowan",
  discordUsername: "rowan.d",
  test: false,
  discord: true,
  testSignIn: false,
};
const NO_NAME: Me = { ...ROWAN, username: null };

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Answers the page's requests by path; any other path gets an empty 200 (the start-up ping). */
function server(handlers: Record<string, Handler>) {
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://host");
    const handler = handlers[url.pathname];
    return Promise.resolve(handler ? handler(url, init) : new Response(null, { status: 200 }));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** The requests made to `path`, in order. */
const requests = (fetch: ReturnType<typeof server>, path: string) =>
  fetch.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input), "http://host"), init }))
    .filter(({ url }) => url.pathname === path);

/** A socket that never connects anywhere: the page's lobby and game come from deliver(). */
class FakeSocket {
  readyState = 1;
  onclose: ((event?: Partial<CloseEvent>) => void) | null = null;
  onmessage: ((msg: MessageEvent) => void) | null = null;
  send = vi.fn();
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

let startUrl: string;

beforeEach(() => {
  startUrl = window.location.href;
  // App pings the server from its constructor and asks /me from componentDidMount; keep both off
  // the network. /me answers nothing a page can read, as if the server could not be reached.
  server({});
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
  // Fake timers go with any socket's ping and reply timers still waiting.
  vi.useRealTimers();
  window.history.replaceState({}, "", startUrl);
  Cookies.remove("lobby");
  Cookies.remove("spectator");
  vi.unstubAllGlobals();
});

/** A promise and the function that settles it, for a request answered when the test says. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Lets the stubbed requests' promises settle until `check` holds (fake timers or real). */
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  expect(check()).toBe(true);
}

/** Lets promises settle, then moves the fake clock on by `ms`. */
async function pass(ms: number) {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

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

const gamePacket = () => ({
  ...makeGameState(["Ann", "Ben", "Cat", "Dan", "Eve"]),
  [PARAM_PACKET_TYPE]: PACKET_GAME_STATE,
});

/** The heading of the prompt on screen ("" for none). */
const promptTitle = (app: App) =>
  app.state.showAlert ? document.querySelector("#alert-box h2")?.textContent ?? "" : "";
const promptField = () => alertBox().getByRole("textbox", { name: "Your name" }) as HTMLInputElement;

const alertBox = () => within(document.getElementById("alert-box")!);
const accountCard = () => document.querySelector(".login-account") as HTMLElement;

test("renders the login page with join and create forms", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "JOIN A GAME" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeInTheDocument();
});

test("the login page has no name field: the name is the account's", async () => {
  server({ "/me": () => json(ROWAN) });
  Cookies.set("name", "Sam"); // what an older page left behind: ignored
  render(<App />);
  expect(await screen.findByText("Rowan")).toBeInTheDocument();
  expect(screen.getAllByRole("textbox")).toEqual([
    screen.getByRole("textbox", { name: "Lobby code" }),
  ]);
  expect(screen.queryByText("Sam")).toBeNull();
  Cookies.remove("name");
});

test("the login page carries none of upstream's leftovers", () => {
  const { container } = render(<App />);
  expect(screen.queryByText(/Announcing/)).toBeNull();
  expect(screen.queryByText(/What is Secret Hitler Online/)).toBeNull();
  expect(container.querySelectorAll("img")).toHaveLength(0);
  const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
  // Upstream is credited by its repository's home page only, never sent its issues.
  expect(hrefs.filter((href) => href.includes("ShrimpCryptid"))).toEqual([
    "https://github.com/ShrimpCryptid/Secret-Hitler-Online",
  ]);
});

test("pings the server once when it starts", () => {
  render(<App />);
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/ping$/));
});

test("the login page's banner reads SECRET-HITLER, in the stats pages' header", () => {
  const { container } = render(<App />);
  const header = container.querySelector("header.site-header");
  expect(header?.querySelector(".site-title")).toHaveTextContent(/^SECRET-HITLER$/);
  expect(header?.querySelector('[aria-current="page"]')).toHaveTextContent(/^PLAY$/);
});

test("the lobby marks only the first player as HOST", async () => {
  const app = createRef<App>();
  const { container } = render(<App ref={app} />);
  const packet = {
    [PARAM_PACKET_TYPE]: PACKET_LOBBY,
    [PARAM_USERNAMES]: ["A", "B", "C"],
    [PARAM_ICON]: { A: "p1", B: "p2", C: "p3" },
  };
  await act(() =>
    app.current!.onWebSocketMessage(new MessageEvent("message", { data: JSON.stringify(packet) }))
  );
  const rows = [...container.querySelectorAll(".lobby-players li.roster-row")];
  expect(rows.map((row) => row.getAttribute("data-player"))).toEqual(["A", "B", "C"]);
  expect(rows.map((row) => row.querySelector(".roster-detail")?.textContent)).toEqual(["HOST", "", ""]);
});

test("the login checks send the lobby as a whole query value, and no name", async () => {
  const fetch = server({});
  const app = createRef<App>();
  render(<App ref={app} />);
  await app.current!.tryLogin("HB&A");
  await app.current!.tryWatchLogin("HB#A");
  const checks = requests(fetch, "/check-login").map(({ url }) => url);
  expect(checks).toHaveLength(2);
  expect([...checks[0].searchParams.keys()]).toEqual(["lobby"]);
  expect(checks[0].searchParams.get("lobby")).toBe("HB&A");
  expect(checks[1].searchParams.get("lobby")).toBe("HB#A");
  expect(checks[1].searchParams.get("spectator")).toBe("true");
});

test("a page that cannot reach /me says so in the account card, and JOIN stays off", async () => {
  server({ "/me": () => Promise.reject(new TypeError("network")) });
  render(<App />);
  fireEvent.change(screen.getByRole("textbox", { name: "Lobby code" }), { target: { value: "KQMX" } });
  await waitFor(() =>
    expect(within(accountCard()).getByRole("status")).toHaveTextContent(
      "There was an error contacting the server. Please wait and try again."
    )
  );
  expect(screen.getByRole("button", { name: "JOIN" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "WATCH" })).toBeEnabled();
});

test("SIGN IN WITH DISCORD carries the code field's lobby code", async () => {
  server({ "/me": () => json(SIGNED_OUT) });
  render(<App />);
  const link = await screen.findByRole("link", { name: "SIGN IN WITH DISCORD" });
  expect(link.getAttribute("href")).toMatch(/\/auth\/discord$/);
  fireEvent.change(screen.getByRole("textbox", { name: "Lobby code" }), { target: { value: "kqmx" } });
  expect(link.getAttribute("href")).toMatch(/\/auth\/discord\?lobby=KQMX$/);
});

test("a first sign-in opens CHOOSE A NAME, and JOIN stays off until CONTINUE saves", async () => {
  let me: Me = NO_NAME;
  const fetch = server({
    "/me": () => json(me),
    "/me/username": (_url, init) => {
      const { username } = JSON.parse(String(init?.body));
      me = { ...NO_NAME, username };
      return json({ username });
    },
  });
  const app = createRef<App>();
  render(<App ref={app} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Lobby code" }), { target: { value: "KQMX" } });

  expect(await alertBox().findByRole("heading", { name: "CHOOSE A NAME" })).toBeInTheDocument();
  expect(alertBox().getByText("Others see it in lobbies and games. Up to 12 characters.")).toBeInTheDocument();
  expect(alertBox().getByRole("textbox", { name: "Your name" })).toHaveValue("");
  expect(alertBox().getByRole("button", { name: "SIGN OUT" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "JOIN" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeDisabled();

  // It cannot be put away: no Escape, no press on the dimmed page.
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  fireEvent.click(document.getElementById("alert-background")!);
  expect(app.current!.state.showAlert).toBe(true);

  fireEvent.change(alertBox().getByRole("textbox", { name: "Your name" }), {
    target: { value: "  Rowan" },
  });
  fireEvent.click(alertBox().getByRole("button", { name: "CONTINUE" }));
  await waitFor(() => expect(app.current!.state.showAlert).toBe(false));
  const saves = requests(fetch, "/me/username");
  expect(saves).toHaveLength(1);
  expect(saves[0].init?.method).toBe("POST");
  expect(JSON.parse(String(saves[0].init?.body))).toEqual({ username: "Rowan" });
  expect(within(screen.getByRole("region", { name: "YOUR NAME" })).getByText("Rowan")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "JOIN" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeEnabled();
});

test("SIGN OUT in CHOOSE A NAME signs out, and the card shows the sign-in", async () => {
  let me: Me = NO_NAME;
  const fetch = server({
    "/me": () => json(me),
    "/auth/sign-out": () => {
      me = SIGNED_OUT;
      return new Response(null, { status: 204 });
    },
  });
  const app = createRef<App>();
  render(<App ref={app} />);
  fireEvent.click(await alertBox().findByRole("button", { name: "SIGN OUT" }));
  expect(await screen.findByRole("link", { name: "SIGN IN WITH DISCORD" })).toBeInTheDocument();
  expect(app.current!.state.showAlert).toBe(false);
  expect(requests(fetch, "/auth/sign-out")).toHaveLength(1);
  expect(requests(fetch, "/auth/sign-out")[0].init?.method).toBe("POST");
  expect(screen.getByRole("region", { name: "YOUR ACCOUNT" })).toHaveTextContent(
    "Sign in to play. Anyone can watch."
  );
});

test("TEST SIGN-IN signs in as a new account, which then chooses a name", async () => {
  const fetch = server({
    "/me": () => json({ ...SIGNED_OUT, testSignIn: true }),
    "/auth/test-sign-in": () =>
      json({ ...NO_NAME, id: "test-9", discordUsername: "test-9", test: true, testSignIn: true }),
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "TEST SIGN-IN" }));
  expect(await alertBox().findByRole("heading", { name: "CHOOSE A NAME" })).toBeInTheDocument();
  expect(requests(fetch, "/auth/test-sign-in")[0].init?.method).toBe("POST");
  expect(screen.getByRole("region", { name: "YOUR NAME" })).toBeInTheDocument();
});

test("CHANGE NAME saves the new name, and the card shows it", async () => {
  server({
    "/me": () => json(ROWAN),
    "/me/username": () => json({ username: "Robin" }),
  });
  const app = createRef<App>();
  render(<App ref={app} />);
  fireEvent.click(await screen.findByRole("button", { name: "CHANGE NAME" }));
  expect(alertBox().getByRole("heading", { name: "CHANGE NAME" })).toBeInTheDocument();
  const field = alertBox().getByRole("textbox", { name: "Your name" });
  expect(field).toHaveValue("Rowan");
  fireEvent.change(field, { target: { value: "Robin" } });
  fireEvent.click(alertBox().getByRole("button", { name: "SAVE" }));
  await waitFor(() => expect(app.current!.state.showAlert).toBe(false));
  const card = screen.getByRole("region", { name: "YOUR NAME" });
  expect(within(card).getByText("Robin")).toBeInTheDocument();
  expect(card).toHaveTextContent("Signed in with Discord as rowan.d · Sign out");
});

test("a taken name keeps CHANGE NAME open with the message, and CANCEL closes it", async () => {
  server({
    "/me": () => json(ROWAN),
    "/me/username": () =>
      new Response("Another player already has that name.", { status: 409 }),
  });
  const app = createRef<App>();
  render(<App ref={app} />);
  fireEvent.click(await screen.findByRole("button", { name: "CHANGE NAME" }));
  fireEvent.change(alertBox().getByRole("textbox", { name: "Your name" }), {
    target: { value: "Alice" },
  });
  fireEvent.click(alertBox().getByRole("button", { name: "SAVE" }));
  expect(await alertBox().findByRole("alert")).toHaveTextContent(
    "Another player already has that name."
  );
  expect(app.current!.state.showAlert).toBe(true);
  expect(alertBox().getByRole("textbox", { name: "Your name" })).toHaveValue("Alice");

  fireEvent.click(alertBox().getByRole("button", { name: "CANCEL" }));
  expect(app.current!.state.showAlert).toBe(false);
  expect(within(screen.getByRole("region", { name: "YOUR NAME" })).getByText("Rowan")).toBeInTheDocument();
});

test("Sign out on the card signs out", async () => {
  let me: Me = ROWAN;
  const fetch = server({
    "/me": () => json(me),
    "/auth/sign-out": () => {
      me = SIGNED_OUT;
      return new Response(null, { status: 204 });
    },
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("link", { name: "SIGN IN WITH DISCORD" })).toBeInTheDocument();
  expect(requests(fetch, "/auth/sign-out")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeDisabled();
});

test("?signin=failed shows the failure and leaves ?lobby=KQMX in the URL", async () => {
  window.history.pushState({}, "", "/?signin=failed&lobby=KQMX");
  server({ "/me": () => json(SIGNED_OUT) });
  render(<App />);
  const card = await screen.findByRole("region", { name: "YOUR ACCOUNT" });
  expect(within(card).getByRole("status")).toHaveTextContent(
    "Signing in with Discord failed. Please try again."
  );
  expect(window.location.search).toBe("?lobby=KQMX");
  expect(screen.getByRole("textbox", { name: "Lobby code" })).toHaveValue("KQMX");
});

test("JOIN calls /check-login?lobby=KQMX with no name", async () => {
  const fetch = server({
    "/me": () => json(ROWAN),
    "/check-login": () => new Response(null, { status: 404 }),
  });
  render(<App />);
  fireEvent.change(screen.getByRole("textbox", { name: "Lobby code" }), { target: { value: "KQMX" } });
  const join = screen.getByRole("button", { name: "JOIN" });
  await waitFor(() => expect(join).toBeEnabled());
  fireEvent.click(join);
  expect(await screen.findByText("The lobby could not be found.")).toBeInTheDocument();
  const checks = requests(fetch, "/check-login");
  expect(checks).toHaveLength(1);
  expect(checks[0].url.search).toBe("?lobby=KQMX");
});

test("a 401 from JOIN asks /me again, and a session that has ended shows the sign-in", async () => {
  let me: Me = ROWAN;
  server({
    "/me": () => json(me),
    "/check-login": () => {
      me = SIGNED_OUT; // signed out in another tab
      return new Response("Sign in to play.", { status: 401 });
    },
  });
  render(<App />);
  fireEvent.change(screen.getByRole("textbox", { name: "Lobby code" }), { target: { value: "KQMX" } });
  const join = screen.getByRole("button", { name: "JOIN" });
  await waitFor(() => expect(join).toBeEnabled());
  fireEvent.click(join);
  expect(await screen.findByText("Sign in to play.")).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "SIGN IN WITH DISCORD" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "JOIN" })).toBeDisabled();
});

test("a 401 from the name prompt's SAVE asks /me again, and a session that has ended closes it", async () => {
  let me: Me = ROWAN;
  const fetch = server({
    "/me": () => json(me),
    "/me/username": () => {
      me = SIGNED_OUT; // signed out in another tab
      return new Response("Sign in to play.", { status: 401 });
    },
  });
  const app = createRef<App>();
  render(<App ref={app} />);
  fireEvent.click(await screen.findByRole("button", { name: "CHANGE NAME" }));
  const asked = requests(fetch, "/me").length;
  fireEvent.change(promptField(), { target: { value: "Robin" } });
  fireEvent.click(alertBox().getByRole("button", { name: "SAVE" }));
  expect(await screen.findByRole("link", { name: "SIGN IN WITH DISCORD" })).toBeInTheDocument();
  expect(requests(fetch, "/me")).toHaveLength(asked + 1);
  await waitFor(() => expect(app.current!.state.showAlert).toBe(false));
  expect(app.current!.namePromptOpen).toBe(false);
  expect(screen.getByRole("button", { name: "JOIN" })).toBeDisabled();
});

// The name prompt's guards: a late reply never touches a later prompt or account.

/** CHANGE NAME's SAVE sent, then CANCEL, then CHANGE NAME again: the second prompt is on screen. */
async function changeNameTwice(app: App) {
  fireEvent.click(screen.getByRole("button", { name: "CHANGE NAME" }));
  fireEvent.change(promptField(), { target: { value: "Robin" } });
  fireEvent.click(alertBox().getByRole("button", { name: "SAVE" }));
  fireEvent.click(alertBox().getByRole("button", { name: "CANCEL" }));
  expect(app.state.showAlert).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "CHANGE NAME" }));
  await pass(1100); // the first prompt's fade-out holds the queue
  expect(promptTitle(app)).toBe("CHANGE NAME");
  expect(promptField()).toHaveValue("Rowan");
}

test("a late 409 from a cancelled CHANGE NAME shows nothing in the next one", async () => {
  vi.useFakeTimers();
  const save = deferred<Response>();
  server({ "/me": () => json(ROWAN), "/me/username": () => save.promise });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  await until(() => ref.current!.state.account !== undefined);
  await changeNameTwice(ref.current!);

  save.resolve(new Response("Another player already has that name.", { status: 409 }));
  await pass(0);
  expect(promptTitle(ref.current!)).toBe("CHANGE NAME");
  expect(alertBox().getByRole("alert")).toHaveTextContent(/^$/);
  expect(alertBox().getByRole("button", { name: "SAVE" })).toBeEnabled();
});

test("a late save from a cancelled CHANGE NAME shows on the card and leaves the next prompt open", async () => {
  vi.useFakeTimers();
  const save = deferred<Response>();
  server({ "/me": () => json(ROWAN), "/me/username": () => save.promise });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  await until(() => ref.current!.state.account !== undefined);
  await changeNameTwice(ref.current!);

  save.resolve(json({ username: "Robin" }));
  await until(() => accountCard().textContent!.includes("Robin"));
  await pass(1100);
  expect(promptTitle(ref.current!)).toBe("CHANGE NAME");
});

test("a first /me that answers after TEST SIGN-IN leaves the test account in place", async () => {
  vi.useFakeTimers();
  const first = deferred<Response>();
  const testAccount: Me = { ...NO_NAME, id: "test-9", discordUsername: "test-9", test: true };
  server({ "/me": () => first.promise, "/auth/test-sign-in": () => json(testAccount) });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  await act(() => ref.current!.onClickTestSignIn());
  await until(() => promptTitle(ref.current!) === "CHOOSE A NAME");

  first.resolve(json({ ...SIGNED_OUT, testSignIn: true }));
  await pass(1100);
  expect(ref.current!.state.account).toEqual(testAccount);
  expect(promptTitle(ref.current!)).toBe("CHOOSE A NAME");
});

test("leaving for the login page opens CHOOSE A NAME again at once, and the earlier CONTINUE landing closes it", async () => {
  vi.useFakeTimers();
  const save = deferred<Response>();
  let meCalls = 0;
  server({
    // The page's second /me (on leaving) never answers: CHOOSE A NAME must not wait on it.
    "/me": () => (++meCalls === 1 ? json(NO_NAME) : new Promise<Response>(() => {})),
    "/me/username": () => save.promise,
  });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  await until(() => promptTitle(app) === "CHOOSE A NAME");
  act(() => {
    app.tryOpenWebSocket("", "KQMX", true); // watching, with the prompt still open
  });
  await deliver(app, lobbyPacket);
  fireEvent.change(promptField(), { target: { value: "Rowan" } });
  fireEvent.click(alertBox().getByRole("button", { name: "CONTINUE" }));

  act(() => app.toLoginPage("Disconnected from the lobby."));
  await pass(0);
  expect(app.state.page).toBe("login");
  expect(meCalls).toBe(2);
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
  expect(promptField()).toHaveValue("");

  save.resolve(json({ username: "Rowan" }));
  await until(() => !app.state.showAlert);
  expect(app.namePromptOpen).toBe(false);
  expect(within(screen.getByRole("region", { name: "YOUR NAME" })).getByText("Rowan")).toBeInTheDocument();
});

test("a /me asked before a CONTINUE landed does not take the saved name back", async () => {
  vi.useFakeTimers();
  const save = deferred<Response>();
  const second = deferred<Response>();
  let meCalls = 0;
  server({
    "/me": () => (++meCalls === 1 ? json(NO_NAME) : second.promise),
    "/me/username": () => save.promise,
  });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  await until(() => promptTitle(app) === "CHOOSE A NAME");
  act(() => {
    app.tryOpenWebSocket("", "KQMX", true);
  });
  await deliver(app, lobbyPacket);
  fireEvent.change(promptField(), { target: { value: "Rowan" } });
  fireEvent.click(alertBox().getByRole("button", { name: "CONTINUE" }));
  act(() => app.toLoginPage("Disconnected from the lobby.")); // asks /me again
  save.resolve(json({ username: "Rowan" }));
  await until(() => app.accountName() === "Rowan");

  second.resolve(json(NO_NAME)); // read before the save
  await pass(1100);
  expect(app.accountName()).toBe("Rowan");
  expect(app.namePromptOpen).toBe(false);
  expect(app.state.showAlert).toBe(false);
});

test("SIGN OUT pressed while CONTINUE is on its way: the sign-out shows, whenever the save lands", async () => {
  vi.useFakeTimers();
  const save = deferred<Response>();
  const signOut = deferred<Response>();
  const afterSignOut = deferred<Response>();
  let meCalls = 0;
  server({
    "/me": () => (++meCalls === 1 ? json(NO_NAME) : afterSignOut.promise),
    "/me/username": () => save.promise,
    "/auth/sign-out": () => signOut.promise,
  });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  await until(() => promptTitle(app) === "CHOOSE A NAME");
  fireEvent.change(promptField(), { target: { value: "Rowan" } });
  fireEvent.click(alertBox().getByRole("button", { name: "CONTINUE" }));
  fireEvent.click(alertBox().getByRole("button", { name: "SIGN OUT" }));
  signOut.resolve(new Response(null, { status: 204 }));
  await until(() => meCalls === 2); // the sign-out's /me is on its way
  save.resolve(json({ username: "Rowan" })); // saved before the session went

  afterSignOut.resolve(json(SIGNED_OUT));
  await until(() => app.state.account?.signedIn === false);
  await pass(1100);
  expect(screen.getByRole("region", { name: "YOUR ACCOUNT" })).toBeInTheDocument();
  expect(app.state.showAlert).toBe(false);
});

test("a CHOOSE A NAME dropped from the queue does not show, and the next lobby packet asks again", async () => {
  vi.useFakeTimers();
  const me = deferred<Response>();
  server({ "/me": () => me.promise });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  act(() => app.queueAlert(<p id="holder">held</p>, false)); // an alert holds the queue
  me.resolve(json(NO_NAME));
  await until(() => app.namePromptOpen); // queued behind it
  expect(document.getElementById("holder")).toBeInTheDocument();

  act(() => {
    app.clearAnimationQueue();
    app.hideAlertAndFinish();
  });
  await pass(1500);
  expect(app.state.showAlert).toBe(false);
  expect(promptTitle(app)).toBe("");

  act(() => {
    app.tryOpenWebSocket("", "KQMX", true);
  });
  await deliver(app, lobbyPacket);
  await pass(0);
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
});

test("CHOOSE A NAME stays open, with its text, when WATCH takes the page to the lobby", async () => {
  vi.useFakeTimers();
  server({ "/me": () => json(NO_NAME) });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  await until(() => promptTitle(app) === "CHOOSE A NAME");
  await pass(600); // faded in
  const field = promptField();
  fireEvent.change(field, { target: { value: "Ro" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Lobby code" }), { target: { value: "KQMX" } });
  fireEvent.click(screen.getByRole("button", { name: "WATCH" }));
  await until(() => app.state.page === "lobby");
  await deliver(app, lobbyPacket);
  expect(promptField()).toBe(field);
  expect(field).toHaveValue("Ro");
  expect(document.getElementById("alert")).toHaveClass("appear-custom-alert");
  expect(document.getElementById("alert")).not.toHaveAttribute("hidden");
});

test("a game starting drops CHOOSE A NAME, and back in the lobby it is asked again", async () => {
  vi.useFakeTimers();
  server({ "/me": () => json(NO_NAME) });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  await until(() => promptTitle(app) === "CHOOSE A NAME");
  act(() => {
    app.tryOpenWebSocket("", "KQMX", true);
  });
  await deliver(app, lobbyPacket);
  expect(promptTitle(app)).toBe("CHOOSE A NAME");

  await deliver(app, gamePacket());
  expect(app.state.page).toBe("game");
  expect(app.state.showAlert).toBe(false);
  expect(app.namePromptOpen).toBe(false);
  await pass(10_000);
  // The spectator's status lines ran on, with no prompt.
  expect(app.state.statusBarText).not.toBe("---");
  expect(app.state.showAlert).toBe(false);

  await deliver(app, lobbyPacket);
  await pass(0);
  expect(promptTitle(app)).toBe("CHOOSE A NAME");
});

test("CHOOSE A NAME does not open over the game page", async () => {
  vi.useFakeTimers();
  const me = deferred<Response>();
  server({ "/me": () => me.promise });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  act(() => {
    app.tryOpenWebSocket("", "KQMX", true);
  });
  await deliver(app, gamePacket());
  me.resolve(json(NO_NAME));
  await until(() => app.state.account !== undefined);
  await pass(10_000);
  expect(app.namePromptOpen).toBe(false);
  expect(app.state.showAlert).toBe(false);
});

test("a sign-out landing while CHANGE NAME is open closes it, and a second Sign out does nothing", async () => {
  vi.useFakeTimers();
  let me: Me = ROWAN;
  const signOut = deferred<Response>();
  const fetch = server({
    "/me": () => json(me),
    "/auth/sign-out": () => {
      me = SIGNED_OUT;
      return signOut.promise;
    },
  });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  await until(() => ref.current!.state.account !== undefined);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  fireEvent.click(screen.getByRole("button", { name: "CHANGE NAME" }));
  expect(promptTitle(ref.current!)).toBe("CHANGE NAME");

  signOut.resolve(new Response(null, { status: 204 }));
  await until(() => ref.current!.state.account?.signedIn === false);
  await pass(1100);
  expect(ref.current!.state.showAlert).toBe(false);
  expect(ref.current!.namePromptOpen).toBe(false);
  expect(screen.getByRole("region", { name: "YOUR ACCOUNT" })).toBeInTheDocument();
  expect(requests(fetch, "/auth/sign-out")).toHaveLength(1);
});

test("TEST SIGN-IN ignores presses while one is on its way", async () => {
  vi.useFakeTimers();
  const answers = [deferred<Response>(), deferred<Response>()];
  let calls = 0;
  const fetch = server({
    "/me": () => json({ ...SIGNED_OUT, testSignIn: true }),
    "/auth/test-sign-in": () => answers[calls++].promise,
  });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  await until(() => ref.current!.state.account !== undefined);
  fireEvent.click(screen.getByRole("button", { name: "TEST SIGN-IN" }));
  fireEvent.click(screen.getByRole("button", { name: "TEST SIGN-IN" }));
  expect(requests(fetch, "/auth/test-sign-in")).toHaveLength(1);

  const first: Me = { ...NO_NAME, id: "test-1", discordUsername: "test-1", test: true };
  answers[0].resolve(json(first));
  await until(() => ref.current!.state.account?.signedIn === true);
  expect(ref.current!.state.account).toEqual(first);
});

test("leaving for the login page asks /me again, so a session that ended shows at once", async () => {
  vi.useFakeTimers();
  let me: Me = ROWAN;
  server({ "/me": () => json(me) });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  await until(() => app.state.account !== undefined);
  act(() => {
    app.tryOpenWebSocket("Rowan", "KQMX");
  });
  await deliver(app, lobbyPacket);
  me = SIGNED_OUT; // the session ended (signed out in another tab)
  act(() => app.toLoginPage("Disconnected from the lobby."));
  await until(() => app.state.account?.signedIn === false);
  expect(screen.getByRole("region", { name: "YOUR ACCOUNT" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "JOIN" })).toBeDisabled();
});

test("a /me that fails after leaving keeps the account last known and says so", async () => {
  vi.useFakeTimers();
  let up = true;
  server({ "/me": () => (up ? json(ROWAN) : Promise.reject(new TypeError("network"))) });
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  await until(() => app.state.account !== undefined);
  act(() => {
    app.tryOpenWebSocket("Rowan", "KQMX");
  });
  await deliver(app, lobbyPacket);
  up = false;
  act(() => app.toLoginPage("Disconnected from the lobby."));
  await until(() => app.state.accountError !== "");
  const card = screen.getByRole("region", { name: "YOUR NAME" });
  expect(within(card).getByText("Rowan")).toBeInTheDocument();
  expect(within(card).getByRole("status")).toHaveTextContent(
    "There was an error contacting the server. Please wait and try again."
  );
  // The code is still there, so JOIN can be tried again once the server is back.
  expect(screen.getByRole("button", { name: "JOIN" })).toBeEnabled();
});

/** A Fascist victory by policies as a spectator sees it: every role known. */
const victoryPacket = (extra: object = {}) => {
  const names = ["Ann", "Ben", "Cat", "Dan", "Eve"];
  const state = makeGameState(names, { state: LobbyState.FASCIST_VICTORY_POLICY, ...extra });
  const roles = ["FASCIST", "HITLER", "LIBERAL", "LIBERAL", "LIBERAL"] as Role[];
  names.forEach((name, i) => (state.players[name].id = roles[i]));
  return { ...state, [PARAM_PACKET_TYPE]: PACKET_GAME_STATE };
};

/** Watches a game to its Fascist victory, packet `extra` added, until RETURN TO LOBBY shows. */
async function watchToVictory(extra: object) {
  vi.useFakeTimers();
  const ref = createRef<App>();
  render(<App ref={ref} />);
  const app = ref.current!;
  act(() => {
    app.tryOpenWebSocket("", "KQMX", true);
  });
  await deliver(app, gamePacket());
  await deliver(app, victoryPacket(extra));
  for (let i = 0; i < 30 && !screen.queryByRole("button", { name: "RETURN TO LOBBY" }); i++) await pass(1000);
  expect(alertBox().getByRole("button", { name: "RETURN TO LOBBY" })).toBeInTheDocument();
}

test("the victory screen links to its game in a new tab", async () => {
  await watchToVictory({ gameId: "g-1" });
  const link = alertBox().getByRole("link", { name: "See this game" });
  expect(link).toHaveAttribute("href", "/games/g-1");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(link.closest("p.victory-game")).not.toBeNull();
  expect(alertBox().getByText("Fascists successfully passed six policies!")).toBeInTheDocument();
});

test("the victory screen has no game link without a gameId", async () => {
  await watchToVictory({});
  expect(alertBox().queryByRole("link", { name: "See this game" })).toBeNull();
  expect(document.querySelector(".victory-game")).toBeNull();
  expect(alertBox().getByText("Fascists successfully passed six policies!")).toBeInTheDocument();
  expect(alertBox().queryAllByRole("link")).toHaveLength(0);
});
