import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ABOUT_URL, ISSUES_URL, RULES_URL } from "../constants";
import LoginScreen, { type LoginScreenProps } from "./LoginScreen";

function renderLogin(overrides: Partial<LoginScreenProps> = {}) {
  const props: LoginScreenProps = {
    name: "",
    lobby: "",
    joinError: "",
    createLobbyError: "",
    onNameChange: vi.fn(),
    onLobbyChange: vi.fn(),
    onJoin: vi.fn(),
    onWatch: vi.fn(),
    onCreateLobby: vi.fn(),
    ...overrides,
  };
  render(<LoginScreen {...props} />);
  return props;
}

const nameField = () => screen.getByRole("textbox", { name: "YOUR NAME" });
const codeField = () => screen.getByRole("textbox", { name: "Lobby code" });
const button = (name: string) => screen.getByRole("button", { name });

test("the page is three cards: the name, joining a game and starting one", () => {
  renderLogin();
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
    "YOUR NAME",
    "JOIN A GAME",
    "OR START ONE",
  ]);
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
});

test("the one name field says how long a name may be, and counts nothing", () => {
  renderLogin({ name: "Sam" });
  expect(nameField()).toHaveValue("Sam");
  expect(nameField()).toHaveAccessibleDescription("Up to 12 characters");
  expect(nameField()).toHaveAttribute("maxlength", "12");
  // The old field showed the characters left as a bare number beside its label.
  expect(screen.queryByText(/^\d+$/)).toBeNull();
});

test.each([
  { name: "", lobby: "", join: false, watch: false, create: false },
  { name: "Sam", lobby: "", join: false, watch: false, create: true },
  { name: "Sam", lobby: "ABC", join: false, watch: false, create: true },
  { name: "", lobby: "ABCD", join: false, watch: true, create: false },
  { name: "   ", lobby: "ABCD", join: false, watch: true, create: false },
  { name: "Sam", lobby: "ABCD", join: true, watch: true, create: true },
])("name $name and code $lobby: JOIN $join, WATCH $watch, CREATE LOBBY $create", (c) => {
  renderLogin({ name: c.name, lobby: c.lobby });
  expect(button("JOIN").hasAttribute("disabled")).toBe(!c.join);
  expect(button("WATCH").hasAttribute("disabled")).toBe(!c.watch);
  expect(button("CREATE LOBBY").hasAttribute("disabled")).toBe(!c.create);
});

test("the buttons call their handlers", () => {
  const props = renderLogin({ name: "Sam", lobby: "ABCD" });
  fireEvent.click(button("JOIN"));
  fireEvent.click(button("WATCH"));
  fireEvent.click(button("CREATE LOBBY"));
  expect(props.onJoin).toHaveBeenCalledTimes(1);
  expect(props.onWatch).toHaveBeenCalledTimes(1);
  expect(props.onCreateLobby).toHaveBeenCalledTimes(1);
});

test("typed names lose leading and doubled spaces and stop at twelve characters", () => {
  const props = renderLogin();
  fireEvent.change(nameField(), { target: { value: "  Sam   Lee" } });
  fireEvent.change(nameField(), { target: { value: "Wolfgang Maxwell" } });
  expect(props.onNameChange).toHaveBeenNthCalledWith(1, "Sam Lee");
  expect(props.onNameChange).toHaveBeenNthCalledWith(2, "Wolfgang Max");
});

test("a typed code is upper-cased and stops at four letters", () => {
  const props = renderLogin();
  fireEvent.change(codeField(), { target: { value: "abcde" } });
  expect(props.onLobbyChange).toHaveBeenCalledWith("ABCD");
  expect(codeField()).toHaveAttribute("maxlength", "4");
});

test("WATCH is explained beside the code", () => {
  renderLogin();
  const join = screen.getByRole("region", { name: "JOIN A GAME" });
  expect(within(join).getByText("WATCH needs only the code")).toBeInTheDocument();
});

test("each card shows its own error", () => {
  renderLogin({ joinError: "The lobby could not be found.", createLobbyError: "Connecting..." });
  const join = screen.getByRole("region", { name: "JOIN A GAME" });
  const start = screen.getByRole("region", { name: "OR START ONE" });
  expect(within(join).getByRole("status")).toHaveTextContent("The lobby could not be found.");
  expect(within(start).getByRole("status")).toHaveTextContent("Connecting...");
});

test("the footer links to the rules, the project and its issues, each in a new tab", () => {
  renderLogin();
  const footer = screen.getByRole("contentinfo");
  const links = within(footer).getAllByRole("link");
  const href = (name: string) => within(footer).getByRole("link", { name }).getAttribute("href");
  expect(href("How to play")).toBe(RULES_URL);
  expect(href("About this project")).toBe(ABOUT_URL);
  expect(href("Report a bug")).toBe(ISSUES_URL);
  for (const link of links) {
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
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
