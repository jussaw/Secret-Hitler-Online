import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultPortrait } from "../assets";
import { copyText } from "./copyText";
import LobbyScreen, { LobbyScreenProps } from "./LobbyScreen";
import { lobbyStatus, StatusSegment } from "./lobbyStatus";

vi.mock("./copyText");

const HOST = "Host Player";
const lg = (n: number) => `Long Guest ${n}`;
const TEN = [HOST, ...Array.from({ length: 9 }, (_, i) => lg(i + 1))];
const LINK = "https://example.test/?lobby=HBIA";
const FULL_NOTE = "The lobby is full (10 / 10). You can play when a seat frees up.";
const SIGN_IN_HREF = "/auth/discord?lobby=HBIA";
const NOT_SET_UP = "Sign-in is not set up on this server.";
const SIGN_IN_FAILED = "Signing in with Discord failed. Please try again.";
const NINE = TEN.slice(0, 9);

/** Picking players keep the default portrait; everyone else gets p1, p2, … */
function icons(players: string[], picking: string[] = []): Record<string, string> {
  const result: Record<string, string> = {};
  players.forEach((name, i) => {
    result[name] = picking.includes(name) ? defaultPortrait : `p${i + 1}`;
  });
  return result;
}

function renderLobby(overrides: Partial<LobbyScreenProps> = {}) {
  const props = lobbyProps(overrides);
  render(<LobbyScreen {...props} />);
  return props;
}

function lobbyProps(overrides: Partial<LobbyScreenProps> = {}): LobbyScreenProps {
  return {
    lobby: "HBIA",
    inviteLink: LINK,
    usernames: TEN,
    bots: [],
    botSkill: "NORMAL",
    icons: icons(TEN),
    user: HOST,
    spectator: false,
    spectatorCount: 0,
    signedIn: true,
    discord: true,
    signInHref: SIGN_IN_HREF,
    spectatorError: "",
    onStartGame: vi.fn(),
    onSetBots: vi.fn(),
    onSetBotSkill: vi.fn(),
    onChangeName: vi.fn(),
    onChangeLook: vi.fn(),
    onWatchInstead: vi.fn(),
    onPlayInstead: vi.fn(),
    onLeave: vi.fn(),
    onCopied: vi.fn(),
    ...overrides,
  };
}

/**
 * The page's own actions, buttons and links drawn as buttons, in order (not the header's sound
 * control): each one's label, or its accessible name if it has only an icon.
 */
const buttons = () =>
  Array.from(
    document.querySelectorAll(".lobby-main button, .lobby-main .button-link"),
    (b) => b.textContent || b.getAttribute("aria-label")
  );
const button = (name: string) => screen.getByRole("button", { name });
/** The note under a spectator's buttons: always there, and empty when there is nothing to say. */
const note = () => document.querySelector<HTMLElement>(".lobby-note");
/** A spectator in a lobby with a free seat. */
const watching = (overrides: Partial<LobbyScreenProps> = {}) =>
  renderLobby({ usernames: NINE, icons: icons(NINE), user: "", spectator: true, ...overrides });
const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".lobby-players li.roster-row"));
const row = (name: string) => document.querySelector<HTMLElement>(`li.roster-row[data-player="${name}"]`)!;
const text = (segments: StatusSegment[]) => segments.map((s) => s.text).join("");
const statusText = () => document.getElementById("lobby-status-text")!.textContent;
const FOUR = TEN.slice(0, 4);
const bots = (n: number) => Array.from({ length: n }, (_, i) => `Bot ${i + 1}`);
/** The host's stepper, or null for anyone else. */
const stepper = () => screen.queryByRole("group", { name: "Bots" });
const botRows = () => Array.from(document.querySelectorAll<HTMLElement>(".lobby-players li.roster-row.is-bot"));
const playerCount = () => document.querySelector(".lobby-player-count")!.textContent;
/** The host's BOT SKILL row, or null for anyone else. */
const skillGroup = () => screen.queryByRole("group", { name: "Bot skill" });
/** The row's buttons' aria-pressed, EASY, NORMAL and HARD in order. */
const pressed = () =>
  within(skillGroup()!)
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-pressed"));

describe("LobbyScreen", () => {
  it("the host's buttons", () => {
    renderLobby();
    expect(buttons()).toEqual([
      "COPY",
      "Fewer bots",
      "More bots",
      "START GAME",
      "EASY",
      "NORMAL",
      "HARD",
      "CHANGE NAME",
      "CHANGE LOOK",
      "WATCH INSTEAD",
      "LEAVE LOBBY",
    ]);
  });

  it("START GAME waits for every portrait", () => {
    renderLobby({ icons: icons(TEN, [lg(3)]) });
    expect(button("START GAME")).toBeDisabled();
  });

  it("START GAME waits for a player the icons leave out", () => {
    const withoutOne = icons(TEN);
    delete withoutOne[lg(4)];
    renderLobby({ icons: withoutOne });
    expect(button("START GAME")).toBeDisabled();
  });

  it("START GAME starts the game once every portrait is picked", () => {
    const props = renderLobby();
    expect(button("START GAME")).toBeEnabled();
    fireEvent.click(button("START GAME"));
    expect(props.onStartGame).toHaveBeenCalledTimes(1);
  });

  it("a guest's buttons", () => {
    const props = renderLobby({ user: lg(1) });
    expect(buttons()).toEqual(["COPY", "CHANGE NAME", "CHANGE LOOK", "WATCH INSTEAD", "LEAVE LOBBY"]);
    fireEvent.click(button("CHANGE NAME"));
    fireEvent.click(button("CHANGE LOOK"));
    fireEvent.click(button("WATCH INSTEAD"));
    fireEvent.click(button("LEAVE LOBBY"));
    expect(props.onChangeName).toHaveBeenCalledTimes(1);
    expect(props.onChangeLook).toHaveBeenCalledTimes(1);
    expect(props.onWatchInstead).toHaveBeenCalledTimes(1);
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("a player's grey buttons are the ones phones lay out two by two; a spectator's are not", () => {
    renderLobby({ user: lg(1) });
    const grey = document.querySelector(".lobby-secondary")!;
    expect(grey).toHaveClass("lobby-player-buttons");
    expect(grey.children).toHaveLength(4);
    cleanup();

    for (const signedIn of [true, false]) {
      watching({ signedIn });
      const row = document.querySelector(".lobby-secondary")!;
      expect(row).not.toHaveClass("lobby-player-buttons");
      expect(row.children).toHaveLength(2);
      cleanup();
    }
  });

  it("a player has no note, whatever a spectator's would say", () => {
    renderLobby({ user: lg(1), discord: false, spectatorError: SIGN_IN_FAILED });
    expect(note()).toBeEmptyDOMElement();
    expect(screen.queryByText(SIGN_IN_FAILED)).toBeNull();
  });

  it("a signed-in spectator's buttons", () => {
    watching();
    expect(buttons()).toEqual(["COPY", "PLAY INSTEAD", "LEAVE LOBBY"]);
    expect(screen.queryByRole("link", { name: "SIGN IN TO PLAY" })).toBeNull();
    expect(document.querySelector(".is-user")).toBeNull();
    expect(note()).toBeEmptyDOMElement();
  });

  it("a signed-out spectator gets SIGN IN TO PLAY, a link that signs in and comes back here", () => {
    const props = watching({ signedIn: false });
    expect(buttons()).toEqual(["COPY", "SIGN IN TO PLAY", "LEAVE LOBBY"]);
    const link = screen.getByRole("link", { name: "SIGN IN TO PLAY" });
    expect(link).toHaveAttribute("href", SIGN_IN_HREF);
    expect(link).toHaveClass("button-link");
    expect(link).not.toHaveAttribute("target"); // the same tab, which comes back to this lobby
    expect(link.closest(".lobby-secondary")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "PLAY INSTEAD" })).toBeNull();
    expect(document.querySelector(".is-user")).toBeNull();
    expect(note()).toBeEmptyDOMElement();
    fireEvent.click(button("LEAVE LOBBY"));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("SIGN IN TO PLAY is off where sign-in is not set up, and the note says so", () => {
    watching({ signedIn: false, discord: false });
    expect(screen.queryByRole("link", { name: "SIGN IN TO PLAY" })).toBeNull();
    const off = button("SIGN IN TO PLAY");
    expect(off).toBeDisabled();
    expect(off).toHaveAccessibleDescription(NOT_SET_UP);
    expect(buttons()).toEqual(["COPY", "SIGN IN TO PLAY", "LEAVE LOBBY"]);
    expect(note()).toHaveTextContent(NOT_SET_UP);
    expect(note()).toHaveAttribute("role", "status");
  });

  it("a failed sign-in shows in the note, in place of the not-set-up line", () => {
    watching({ signedIn: false, spectatorError: SIGN_IN_FAILED });
    expect(note()).toHaveTextContent(SIGN_IN_FAILED);
    cleanup();

    watching({ signedIn: false, discord: false, spectatorError: SIGN_IN_FAILED });
    expect(document.querySelectorAll(".lobby-note")).toHaveLength(1);
    expect(note()).toHaveTextContent(SIGN_IN_FAILED);
    expect(screen.queryByText(NOT_SET_UP)).toBeNull();
  });

  it("the note is a live region there before any note, so its text is announced as it comes", () => {
    const { rerender } = render(<LobbyScreen {...lobbyProps({ usernames: NINE, icons: icons(NINE), user: "", spectator: true })} />);
    const status = screen.getByRole("status");
    expect(status).toBe(note());
    expect(status).toHaveAttribute("id", "lobby-note");
    expect(status).toBeEmptyDOMElement();

    rerender(
      <LobbyScreen
        {...lobbyProps({
          usernames: NINE,
          icons: icons(NINE),
          user: "",
          spectator: true,
          spectatorError: "You're already in this lobby in another tab or window.",
        })}
      />
    );
    expect(screen.getByRole("status")).toBe(status); // the same element, now with the text
    expect(status).toHaveTextContent("You're already in this lobby in another tab or window.");

    rerender(<LobbyScreen {...lobbyProps({ usernames: NINE, icons: icons(NINE), user: "", spectator: true })} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toBeEmptyDOMElement();
  });

  it("PLAY INSTEAD's error shows in the note", () => {
    watching({ spectatorError: "The lobby is currently in a game." });
    expect(note()).toHaveTextContent("The lobby is currently in a game.");
    expect(note()).toHaveAttribute("role", "status");
    expect(button("PLAY INSTEAD")).toBeEnabled();
  });

  it("the switch buttons carry the icon phones hide, and COPY keeps its own", () => {
    renderLobby();
    expect(button("WATCH INSTEAD").querySelector("svg.lobby-switch-icon")).not.toBeNull();
    expect(button("COPY").querySelector("svg.lobby-button-icon")).not.toBeNull();
    expect(button("COPY").querySelector(".lobby-switch-icon")).toBeNull();
    cleanup();

    renderLobby({ user: "", spectator: true, usernames: TEN.slice(0, 9) });
    expect(button("PLAY INSTEAD").querySelector("svg.lobby-switch-icon")).not.toBeNull();
  });

  it("a spectator with a stale name sees no highlighted row", () => {
    renderLobby({ user: HOST, spectator: true });
    expect(document.querySelector(".is-user")).toBeNull();
  });

  it("PLAY INSTEAD is off in a full lobby, which keeps its note for a signed-in spectator", () => {
    renderLobby({ user: "", spectator: true });
    expect(button("PLAY INSTEAD")).toBeDisabled();
    expect(note()).toHaveTextContent(FULL_NOTE);
    expect(note()).toHaveClass("lobby-full-note");
    cleanup();

    // The button is off, so an error from an earlier press has nothing more to say.
    renderLobby({ user: "", spectator: true, spectatorError: "The lobby is currently full." });
    expect(document.querySelectorAll(".lobby-note")).toHaveLength(1);
    expect(note()).toHaveTextContent(FULL_NOTE);
  });

  it("a signed-out spectator in a full lobby can still sign in, under the full lobby's note", () => {
    renderLobby({ user: "", spectator: true, signedIn: false });
    expect(screen.getByRole("link", { name: "SIGN IN TO PLAY" })).toHaveAttribute("href", SIGN_IN_HREF);
    expect(note()).toHaveTextContent(FULL_NOTE);
    cleanup();

    renderLobby({ user: "", spectator: true, signedIn: false, spectatorError: SIGN_IN_FAILED });
    expect(document.querySelectorAll(".lobby-note")).toHaveLength(1);
    expect(note()).toHaveTextContent(SIGN_IN_FAILED);
  });

  it("PLAY INSTEAD is on while a seat is free", () => {
    const props = watching();
    expect(button("PLAY INSTEAD")).toBeEnabled();
    expect(note()).toBeEmptyDOMElement();
    fireEvent.click(button("PLAY INSTEAD"));
    expect(props.onPlayInstead).toHaveBeenCalledTimes(1);
  });

  it("a spectator in an empty lobby", () => {
    renderLobby({ usernames: [], icons: {}, user: "", spectator: true });
    expect(statusText()).toBe("You are watching. No one has a seat yet.");
    expect(document.querySelector(".lobby-player-count")).toHaveTextContent(/^0 \/ 10$/);
    expect(rows()).toHaveLength(0);
    expect(button("PLAY INSTEAD")).toBeEnabled();
  });

  it("the roster", () => {
    renderLobby({ user: lg(1), icons: icons(TEN, [lg(3)]) });
    expect(rows().map((r) => r.dataset.player)).toEqual(TEN);

    const host = row(HOST);
    expect(host.querySelector(".roster-detail")).toHaveTextContent(/^HOST$/);
    expect(host.querySelector(".roster-tag")).toHaveTextContent(/^HOST$/);

    const picking = row(lg(3));
    expect(picking.querySelector(".roster-detail")).toHaveTextContent(/^Picking a look…$/);
    expect(picking.querySelector(".roster-busy")).not.toBeNull();

    const ready = row(lg(2));
    expect(ready.querySelector(".roster-detail")).toHaveTextContent(/^$/);
    expect(ready.querySelector(".roster-tag")).toHaveTextContent(/^$/);
    expect(ready.querySelector(".roster-busy")).toBeNull();

    expect(document.querySelectorAll(".is-user")).toHaveLength(1);
    expect(row(lg(1))).toHaveClass("is-user");
  });

  it("a host still picking keeps HOST under the name and gets the busy bubble", () => {
    renderLobby({ icons: icons(TEN, [HOST]) });
    expect(row(HOST).querySelector(".roster-detail")).toHaveTextContent(/^HOST$/);
    expect(row(HOST).querySelector(".roster-busy")).not.toBeNull();
  });

  it("the heading and the code card", () => {
    renderLobby();
    expect(document.querySelector(".lobby-players-head")).toHaveTextContent("PLAYERS");
    expect(document.querySelector(".lobby-player-count")).toHaveTextContent(/^10 \/ 10$/);
    expect(document.querySelector(".lobby-code-card")).toHaveTextContent("LOBBY CODE");
    expect(document.querySelector(".lobby-code")).toHaveTextContent(/^HBIA$/);
    expect(document.querySelector(".lobby-code-card")).toHaveTextContent(
      "Share this link to invite players"
    );
    const link = document.querySelector<HTMLInputElement>("input#linkText")!;
    expect(link).toHaveValue(LINK);
    expect(link).toHaveAttribute("readonly");
  });

  it("the status line", () => {
    const picking = icons(TEN, [lg(3), lg(5)]);
    for (const viewer of [
      { user: lg(1), spectator: false },
      { user: "", spectator: true },
    ]) {
      renderLobby({ icons: picking, ...viewer });
      const segments = lobbyStatus(TEN, picking, viewer, 0);
      expect(statusText()).toBe(segments.map((s) => s.text).join(""));
      expect(
        Array.from(document.querySelectorAll("#lobby-status-text .lobby-status-name"), (n) => n.textContent)
      ).toEqual(segments.filter((s) => s.highlight).map((s) => s.text));
      cleanup();
    }
  });

  it("COPY", async () => {
    vi.mocked(copyText).mockResolvedValue(true);
    const props = renderLobby();
    fireEvent.click(button("COPY"));
    expect(copyText).toHaveBeenCalledWith(LINK, document.getElementById("linkText"));
    await waitFor(() => expect(props.onCopied).toHaveBeenCalledWith(true));
  });

  it("the footer links", () => {
    renderLobby();
    // The stats are reached from the login page's header and the victory screen, not the lobby.
    expect(screen.queryByRole("link", { name: /stats/i })).toBeNull();
    const about = screen.getByRole("link", { name: "About this project" });
    const bug = screen.getByRole("link", { name: "Report a bug" });
    expect(about).toHaveAttribute("href", "https://github.com/jussaw/Secret-Hitler-Online#readme");
    expect(bug).toHaveAttribute("href", "https://github.com/jussaw/Secret-Hitler-Online/issues");
    expect(document.querySelector(".lobby-footer")).toHaveTextContent(/^About this project · Report a bug$/);
    // Each in a new tab, so the lobby stays open.
    for (const link of [about, bug]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link.closest(".lobby-footer")).not.toBeNull();
    }
  });

  it("the host chooses how many bots join, between a table of five and ten", () => {
    const props = renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(2) });
    expect(stepper()).toHaveTextContent(/^2\s*BOTS$/);
    expect(button("Fewer bots")).toBeEnabled();
    expect(button("More bots")).toBeEnabled();
    fireEvent.click(button("Fewer bots"));
    expect(props.onSetBots).toHaveBeenLastCalledWith(1);
    cleanup();
    const again = renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(2) });
    fireEvent.click(button("More bots"));
    expect(again.onSetBots).toHaveBeenLastCalledWith(3);
    // The stepper is on START GAME's row, at its left.
    const row = document.querySelector(".lobby-start-row")!;
    expect(Array.from(row.children)).toEqual([stepper(), button("START GAME")]);
  });

  it("a second press before the server answers steps on from the first", () => {
    const props = lobbyProps({ usernames: FOUR, icons: icons(FOUR), bots: bots(2) });
    const { rerender } = render(<LobbyScreen {...props} />);
    fireEvent.click(button("More bots"));
    fireEvent.click(button("More bots"));
    expect(vi.mocked(props.onSetBots).mock.calls).toEqual([[3], [4]]);
    expect(stepper()).toHaveTextContent(/^4\s*BOTS$/);
    // The rows are the server's: they follow its packets.
    expect(botRows()).toHaveLength(2);
    // The server's next packet answers the first press, and the stepper shows what it holds.
    rerender(<LobbyScreen {...props} bots={bots(3)} />);
    expect(stepper()).toHaveTextContent(/^3\s*BOTS$/);
    expect(botRows()).toHaveLength(3);
    fireEvent.click(button("Fewer bots"));
    expect(props.onSetBots).toHaveBeenLastCalledWith(2);
  });

  it("quick presses stop at the limits", () => {
    const props = renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(5) });
    fireEvent.click(button("More bots"));
    expect(button("More bots")).toBeDisabled();
    fireEvent.click(button("More bots"));
    expect(vi.mocked(props.onSetBots).mock.calls).toEqual([[6]]);
  });

  it("− is off at the fewest bots that make five", () => {
    renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(1) });
    expect(stepper()).toHaveTextContent(/^1\s*BOT$/);
    expect(button("Fewer bots")).toBeDisabled();
    expect(button("More bots")).toBeEnabled();
  });

  it("+ is off at the most bots that keep ten", () => {
    renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(6) });
    expect(button("Fewer bots")).toBeEnabled();
    expect(button("More bots")).toBeDisabled();
  });

  it("with five people, − is off at no bots", () => {
    const five = TEN.slice(0, 5);
    renderLobby({ usernames: five, icons: icons(five), bots: [] });
    expect(stepper()).toHaveTextContent(/^0\s*BOTS$/);
    expect(button("Fewer bots")).toBeDisabled();
    expect(button("More bots")).toBeEnabled();
  });

  it("with ten people, both are off at no bots", () => {
    renderLobby();
    expect(stepper()).toHaveTextContent(/^0\s*BOTS$/);
    expect(button("Fewer bots")).toBeDisabled();
    expect(button("More bots")).toBeDisabled();
  });

  it("only the host gets the stepper", () => {
    renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(2), user: lg(1) });
    expect(stepper()).toBeNull();
    cleanup();
    renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(2), user: "", spectator: true });
    expect(stepper()).toBeNull();
  });

  it("every viewer sees a row per bot after the people, and the heading counts them", () => {
    for (const viewer of [
      { user: HOST, spectator: false },
      { user: lg(1), spectator: false },
      { user: "", spectator: true },
    ]) {
      renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(2), ...viewer });
      expect(rows().map((r) => r.querySelector(".roster-name-text")!.textContent)).toEqual([
        ...FOUR,
        "Bot 1",
        "Bot 2",
      ]);
      expect(botRows().map((r) => r.dataset.bot)).toEqual(["Bot 1", "Bot 2"]);
      for (const bot of botRows()) {
        expect(bot).not.toHaveClass("is-user");
        expect(bot.querySelector(".roster-portrait svg.lucide-bot")).not.toBeNull();
        expect(bot).toHaveAttribute("title", bot.dataset.bot);
      }
      expect(playerCount()).toBe("6 / 10");
      expect(statusText()).toBe(
        text(lobbyStatus(FOUR, icons(FOUR), viewer, 2))
      );
      cleanup();
    }
  });

  it("a bot's seat is a person's for the full note: bots never fill the lobby", () => {
    watching({ bots: bots(1) });
    expect(playerCount()).toBe("10 / 10");
    expect(button("PLAY INSTEAD")).toBeEnabled();
    expect(note()).toBeEmptyDOMElement();
  });

  it("the host's BOT SKILL row sits under START GAME's row", () => {
    renderLobby();
    const controls = document.querySelector(".lobby-host-controls")!;
    expect(Array.from(controls.children)).toEqual([document.querySelector(".lobby-start-row"), skillGroup()]);
    expect(skillGroup()).toHaveTextContent(/^BOT SKILL\s*EASY\s*NORMAL\s*HARD$/);
    expect(pressed()).toEqual(["false", "true", "false"]);
  });

  it("a press shows the level at once and asks the server for it", () => {
    const props = renderLobby();
    fireEvent.click(button("HARD"));
    expect(pressed()).toEqual(["false", "false", "true"]);
    expect(vi.mocked(props.onSetBotSkill).mock.calls).toEqual([["HARD"]]);
  });

  it("the level pressed holds until the next lobby packet", () => {
    const props = lobbyProps({ usernames: FOUR, icons: icons(FOUR), bots: bots(2) });
    const { rerender } = render(<LobbyScreen {...props} />);
    fireEvent.click(button("HARD"));
    rerender(<LobbyScreen {...props} />);
    expect(pressed()).toEqual(["false", "false", "true"]);
    // A packet the server sent before it took the press: the page shows what the server holds.
    rerender(<LobbyScreen {...props} bots={bots(2)} botSkill="NORMAL" />);
    expect(pressed()).toEqual(["false", "true", "false"]);
    rerender(<LobbyScreen {...props} bots={bots(2)} botSkill="HARD" />);
    expect(pressed()).toEqual(["false", "false", "true"]);
  });

  it("a second press before the server answers shows the second", () => {
    const props = renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(2) });
    fireEvent.click(button("HARD"));
    fireEvent.click(button("EASY"));
    expect(vi.mocked(props.onSetBotSkill).mock.calls).toEqual([["HARD"], ["EASY"]]);
    expect(pressed()).toEqual(["true", "false", "false"]);
  });

  it("pressing the level shown sends nothing", () => {
    const props = renderLobby();
    fireEvent.click(button("NORMAL"));
    expect(props.onSetBotSkill).not.toHaveBeenCalled();
    expect(pressed()).toEqual(["false", "true", "false"]);
  });

  it("the switch stays on with ten people and no bots", () => {
    renderLobby();
    for (const level of ["EASY", "NORMAL", "HARD"]) expect(button(level)).toBeEnabled();
    expect(button("Fewer bots")).toBeDisabled();
    expect(button("More bots")).toBeDisabled();
  });

  it("guests and spectators see the level on a line where the host's row is, without buttons", () => {
    const viewers: Array<() => unknown> = [
      () => renderLobby({ user: lg(1), botSkill: "HARD" }),
      () => watching({ botSkill: "HARD" }),
      () => watching({ botSkill: "HARD", signedIn: false }),
      () => watching({ botSkill: "HARD", signedIn: false, discord: false }),
    ];
    for (const view of viewers) {
      view();
      expect(skillGroup()).toBeNull();
      for (const level of ["EASY", "NORMAL", "HARD"]) {
        expect(screen.queryByRole("button", { name: level })).toBeNull();
      }
      const first = document.querySelector(".lobby-actions")!.firstElementChild!;
      expect(first).toHaveClass("lobby-skill-line");
      expect(first).toHaveTextContent(/^BOT SKILL\s*HARD$/);
      expect(document.querySelector(".lobby-skill-level")).toHaveTextContent(/^HARD$/);
      cleanup();
    }
  });

  it("the level shows in that one place only", () => {
    for (const user of [HOST, lg(1)]) {
      renderLobby({ usernames: FOUR, icons: icons(FOUR), bots: bots(2), botSkill: "HARD", user });
      expect(screen.getAllByText("HARD")).toHaveLength(1);
      for (const r of rows()) expect(r.textContent).not.toMatch(/easy|normal|hard/i);
      expect(statusText()).not.toMatch(/easy|normal|hard/i);
      cleanup();
    }
  });

  it("a new host gets the switch, at the level chosen", () => {
    const props = lobbyProps({ usernames: FOUR, icons: icons(FOUR), botSkill: "HARD", user: lg(1) });
    const { rerender } = render(<LobbyScreen {...props} />);
    expect(skillGroup()).toBeNull();
    rerender(<LobbyScreen {...props} usernames={FOUR.slice(1)} />);
    expect(skillGroup()).not.toBeNull();
    expect(pressed()).toEqual(["false", "false", "true"]);
  });

  it("the header", () => {
    renderLobby({ spectatorCount: 2 });
    const header = document.querySelector(".lobby-screen > header.App-header")!;
    expect(header).toHaveTextContent("SECRET-HITLER");
    expect(header.querySelector(".spectator-count")).toHaveTextContent("2");
    expect(header.querySelector(".sound-toggle")).not.toBeNull();
  });
});
