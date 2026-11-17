import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Me } from "../account/account";
import { ABOUT_URL, ISSUES_URL, RULES_URL } from "../constants";
import { CONTACT_ERROR } from "../lobby/joinError";
import LoginScreen, { type LoginScreenProps } from "./LoginScreen";

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
const TEST_ACCOUNT: Me = {
  ...ROWAN,
  id: "test-3",
  username: "Guest 3",
  discordUsername: "test-3",
  test: true,
  testSignIn: true,
};

function renderLogin(overrides: Partial<LoginScreenProps> = {}) {
  const props: LoginScreenProps = {
    account: SIGNED_OUT,
    accountError: "",
    discordHref: "/auth/discord",
    lobby: "",
    joinError: "",
    createLobbyError: "",
    onLobbyChange: vi.fn(),
    onJoin: vi.fn(),
    onWatch: vi.fn(),
    onCreateLobby: vi.fn(),
    onTestSignIn: vi.fn(),
    onChangeName: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
  render(<LoginScreen {...props} />);
  return props;
}

const codeField = () => screen.getByRole("textbox", { name: "Lobby code" });
const button = (name: string) => screen.getByRole("button", { name });
const region = (name: string) => screen.getByRole("region", { name });
const discordLink = () => screen.queryByRole("link", { name: "SIGN IN WITH DISCORD" });
const joinHint = () => document.getElementById("login-join-hint");

test("the page is three cards: the account, joining a game and starting one", () => {
  renderLogin();
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
    "YOUR ACCOUNT",
    "JOIN A GAME",
    "OR START ONE",
  ]);
  // The lobby code is the only field: the name is the account's.
  expect(screen.getAllByRole("textbox")).toEqual([codeField()]);
});

test("the header is the site's, with PLAY the page you are on", () => {
  renderLogin();
  const header = screen.getByRole("banner");
  expect(header).toHaveTextContent(/^SECRET-HITLER/);
  const nav = within(header).getByRole("navigation", { name: "Site" });
  expect(within(nav).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
    ["STATS", "/stats"],
    ["GAMES", "/stats/games"],
    ["PLAYERS", "/stats/players"],
    ["PLAY", "/"],
  ]);
  // The one current link on the page.
  expect(Array.from(document.querySelectorAll('[aria-current="page"]'), (el) => el.textContent)).toEqual(["PLAY"]);
  // The stats load in this tab: the login page has nothing to keep open.
  for (const link of within(nav).getAllByRole("link")) expect(link).not.toHaveAttribute("target");
});

test("the login page has no sound control", () => {
  renderLogin();
  expect(screen.queryByRole("button", { name: "Mute sounds" })).toBeNull();
  expect(screen.queryByRole("slider", { name: "Volume" })).toBeNull();
  expect(document.querySelector(".sound-control")).toBeNull();
});

test("before /me answers, the card is blank and JOIN and CREATE LOBBY are off", () => {
  renderLogin({ account: undefined, lobby: "KQMX" });
  expect(discordLink()).toBeNull();
  expect(screen.queryByRole("button", { name: /SIGN IN|CHANGE NAME|Sign out/ })).toBeNull();
  expect(screen.queryByText(/YOUR (ACCOUNT|NAME)/)).toBeNull();
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
    "JOIN A GAME",
    "OR START ONE",
  ]);
  expect(button("JOIN")).toBeDisabled();
  expect(button("CREATE LOBBY")).toBeDisabled();
  expect(button("WATCH")).toBeEnabled();
  expect(joinHint()).toHaveTextContent("JOIN needs you signed in · WATCH needs only the code");
  expect(document.querySelector(".login-account")).toHaveTextContent(/^\s*$/);
});

test("when /me fails, the card says the server could not be reached", () => {
  renderLogin({ account: undefined, accountError: CONTACT_ERROR, lobby: "KQMX" });
  const card = document.querySelector(".login-account") as HTMLElement;
  expect(within(card).getByRole("status")).toHaveTextContent(CONTACT_ERROR);
  expect(discordLink()).toBeNull();
  expect(button("JOIN")).toBeDisabled();
  expect(button("CREATE LOBBY")).toBeDisabled();
  expect(button("WATCH")).toBeEnabled();
  expect(joinHint()).toHaveTextContent("JOIN needs you signed in · WATCH needs only the code");
});

test("signed out: SIGN IN WITH DISCORD links to the sign-in with the code, and only WATCH works", () => {
  renderLogin({ discordHref: "/auth/discord?lobby=KQMX", lobby: "KQMX" });
  const card = region("YOUR ACCOUNT");
  const link = within(card).getByRole("link", { name: "SIGN IN WITH DISCORD" });
  expect(link).toHaveAttribute("href", "/auth/discord?lobby=KQMX");
  // The sign-in leaves this page for Discord's, in the same tab.
  expect(link).not.toHaveAttribute("target");
  expect(card).toHaveTextContent("Sign in to play. Anyone can watch.");
  expect(within(card).queryByRole("button", { name: "TEST SIGN-IN" })).toBeNull();
  expect(button("JOIN")).toBeDisabled();
  expect(button("CREATE LOBBY")).toBeDisabled();
  expect(button("WATCH")).toBeEnabled();
  expect(joinHint()).toHaveTextContent("JOIN needs you signed in · WATCH needs only the code");
  expect(codeField()).toHaveAccessibleDescription(
    "JOIN needs you signed in · WATCH needs only the code"
  );
});

test("with Discord not set up, the sign-in button is off and says so", () => {
  renderLogin({ account: { signedIn: false, discord: false, testSignIn: false } });
  const card = region("YOUR ACCOUNT");
  expect(discordLink()).toBeNull();
  const signIn = within(card).getByRole("button", { name: "SIGN IN WITH DISCORD" });
  expect(signIn).toBeDisabled();
  // The reason is the button's description, so a screen reader hears why it is off.
  expect(signIn).toHaveAccessibleDescription("Sign-in is not set up on this server.");
  expect(card).toHaveTextContent("Sign-in is not set up on this server.");
  expect(card).not.toHaveTextContent("Sign in to play. Anyone can watch.");
});

test("with test sign-in on, TEST SIGN-IN stands beside the Discord button", () => {
  const props = renderLogin({ account: { signedIn: false, discord: true, testSignIn: true } });
  const card = region("YOUR ACCOUNT");
  expect(within(card).getByRole("link", { name: "SIGN IN WITH DISCORD" })).toBeInTheDocument();
  fireEvent.click(within(card).getByRole("button", { name: "TEST SIGN-IN" }));
  expect(props.onTestSignIn).toHaveBeenCalledTimes(1);
});

test("TEST SIGN-IN works where Discord is not set up", () => {
  const props = renderLogin({ account: { signedIn: false, discord: false, testSignIn: true } });
  fireEvent.click(button("TEST SIGN-IN"));
  expect(props.onTestSignIn).toHaveBeenCalledTimes(1);
});

test("the account card's error shows under the button", () => {
  renderLogin({ accountError: "Signing in with Discord failed. Please try again." });
  const card = region("YOUR ACCOUNT");
  const error = within(card).getByRole("status");
  expect(error).toHaveTextContent("Signing in with Discord failed. Please try again.");
  const link = within(card).getByRole("link", { name: "SIGN IN WITH DISCORD" });
  expect(link.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("signed in: the name, CHANGE NAME and the Discord username with Sign out", () => {
  const props = renderLogin({ account: ROWAN, lobby: "KQMX" });
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
    "YOUR NAME",
    "JOIN A GAME",
    "OR START ONE",
  ]);
  const card = region("YOUR NAME");
  expect(within(card).getByText("Rowan")).toBeInTheDocument();
  expect(card).toHaveTextContent("Signed in with Discord as rowan.d · Sign out");
  expect(discordLink()).toBeNull();
  fireEvent.click(within(card).getByRole("button", { name: "CHANGE NAME" }));
  expect(props.onChangeName).toHaveBeenCalledTimes(1);
  // Sign out is a button that looks like a link.
  fireEvent.click(within(card).getByRole("button", { name: "Sign out" }));
  expect(props.onSignOut).toHaveBeenCalledTimes(1);
  expect(button("JOIN")).toBeEnabled();
  expect(button("CREATE LOBBY")).toBeEnabled();
  expect(joinHint()).toHaveTextContent(/^WATCH needs only the code$/);
});

test("a test account names its ID in place of a Discord username", () => {
  renderLogin({ account: TEST_ACCOUNT });
  const card = region("YOUR NAME");
  expect(card).toHaveTextContent("Signed in with a test account (test-3) · Sign out");
  expect(card).not.toHaveTextContent("Discord");
  expect(within(card).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});

test("signed in with no name yet: the card waits for the name, and JOIN and CREATE LOBBY are off", () => {
  renderLogin({ account: NO_NAME, lobby: "KQMX" });
  expect(region("YOUR NAME")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "CHANGE NAME" })).toBeNull();
  expect(button("JOIN")).toBeDisabled();
  expect(button("CREATE LOBBY")).toBeDisabled();
  expect(button("WATCH")).toBeEnabled();
});

test("a signed-in card shows its error too", () => {
  renderLogin({ account: ROWAN, accountError: CONTACT_ERROR });
  expect(within(region("YOUR NAME")).getByRole("status")).toHaveTextContent(CONTACT_ERROR);
});

test.each([
  { account: SIGNED_OUT, lobby: "ABCD", join: false, watch: true, create: false },
  { account: NO_NAME, lobby: "ABCD", join: false, watch: true, create: false },
  { account: ROWAN, lobby: "", join: false, watch: false, create: true },
  { account: ROWAN, lobby: "ABC", join: false, watch: false, create: true },
  { account: ROWAN, lobby: "ABCD", join: true, watch: true, create: true },
  { account: TEST_ACCOUNT, lobby: "ABCD", join: true, watch: true, create: true },
])(
  "signed in $account.signedIn as $account.username, code $lobby: JOIN $join, WATCH $watch, CREATE LOBBY $create",
  (c) => {
    renderLogin({ account: c.account, lobby: c.lobby });
    expect(button("JOIN").hasAttribute("disabled")).toBe(!c.join);
    expect(button("WATCH").hasAttribute("disabled")).toBe(!c.watch);
    expect(button("CREATE LOBBY").hasAttribute("disabled")).toBe(!c.create);
  }
);

test("the buttons call their handlers", () => {
  const props = renderLogin({ account: ROWAN, lobby: "ABCD" });
  fireEvent.click(button("JOIN"));
  fireEvent.click(button("WATCH"));
  fireEvent.click(button("CREATE LOBBY"));
  expect(props.onJoin).toHaveBeenCalledTimes(1);
  expect(props.onWatch).toHaveBeenCalledTimes(1);
  expect(props.onCreateLobby).toHaveBeenCalledTimes(1);
});

test("a typed code is upper-cased and stops at four letters", () => {
  const props = renderLogin();
  fireEvent.change(codeField(), { target: { value: "abcde" } });
  expect(props.onLobbyChange).toHaveBeenCalledWith("ABCD");
  expect(codeField()).toHaveAttribute("maxlength", "4");
});

test("each card shows its own error", () => {
  renderLogin({
    account: ROWAN,
    joinError: "The lobby could not be found.",
    createLobbyError: "Connecting...",
  });
  const join = region("JOIN A GAME");
  const start = region("OR START ONE");
  expect(within(join).getByRole("status")).toHaveTextContent("The lobby could not be found.");
  expect(within(start).getByRole("status")).toHaveTextContent("Connecting...");
  expect(within(region("YOUR NAME")).getByRole("status")).toHaveTextContent(/^$/);
});

test("the footer links to the rules, the project and its issues", () => {
  renderLogin();
  const footer = screen.getByRole("contentinfo");
  const firstLine = footer.querySelector("p")!;
  expect(firstLine).toHaveTextContent(/^How to play · About this project · Report a bug$/);
  const link = (name: string) => within(footer).getByRole("link", { name });
  // The stats are in the header now.
  expect(within(footer).queryByRole("link", { name: /stats/i })).toBeNull();
  expect(link("How to play")).toHaveAttribute("href", RULES_URL);
  expect(link("About this project")).toHaveAttribute("href", ABOUT_URL);
  expect(link("Report a bug")).toHaveAttribute("href", ISSUES_URL);
  for (const name of ["How to play", "About this project", "Report a bug"]) {
    expect(link(name)).toHaveAttribute("target", "_blank");
    expect(link(name)).toHaveAttribute("rel", "noopener noreferrer");
  }
  for (const other of within(footer.querySelector(".login-credit") as HTMLElement).getAllByRole("link")) {
    expect(other).toHaveAttribute("target", "_blank");
  }
});

test("the credit line names the game, upstream and the licence, with their links", () => {
  renderLogin();
  const footer = screen.getByRole("contentinfo");
  expect(footer).toHaveTextContent(
    "Adapted from the Secret Hitler board game by Goat, Wolf & Cabbage. Based on Secret Hitler " +
      "Online by ShrimpCryptid. CC BY-NC-SA 4.0."
  );
  const href = (name: string) => within(footer).getByRole("link", { name }).getAttribute("href");
  expect(href("Secret Hitler")).toBe("https://www.secrethitler.com/");
  expect(href("Secret Hitler Online")).toBe("https://github.com/ShrimpCryptid/Secret-Hitler-Online");
  expect(href("CC BY-NC-SA 4.0")).toBe("https://creativecommons.org/licenses/by-nc-sa/4.0/");
});
