import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Cookies from "js-cookie";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import type { Me } from "./account/account";
import { PACKET_LOBBY, PARAM_ICON, PARAM_PACKET_TYPE, PARAM_USERNAMES } from "./constants";

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

let startUrl: string;

beforeEach(() => {
  startUrl = window.location.href;
  // App pings the server from its constructor and asks /me from componentDidMount; keep both off
  // the network. /me answers nothing a page can read, as if the server could not be reached.
  server({});
});

afterEach(() => {
  window.history.replaceState({}, "", startUrl);
  Cookies.remove("lobby");
  vi.unstubAllGlobals();
});

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

test("the login page's banner reads SECRET-HITLER", () => {
  const { container } = render(<App />);
  expect(container.querySelector("header")).toHaveTextContent(/^SECRET-HITLER$/);
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
