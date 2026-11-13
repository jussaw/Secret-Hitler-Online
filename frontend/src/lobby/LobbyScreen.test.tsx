import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultPortrait } from "../assets";
import { copyText } from "./copyText";
import LobbyScreen, { LobbyScreenProps } from "./LobbyScreen";
import { lobbyStatus } from "./lobbyStatus";

vi.mock("./copyText");

const HOST = "Host Player";
const lg = (n: number) => `Long Guest ${n}`;
const TEN = [HOST, ...Array.from({ length: 9 }, (_, i) => lg(i + 1))];
const LINK = "https://example.test/?lobby=HBIA";
const FULL_NOTE = "The lobby is full (10 / 10). You can play when a seat frees up.";

/** Picking players keep the default portrait; everyone else gets p1, p2, … */
function icons(players: string[], picking: string[] = []): Record<string, string> {
  const result: Record<string, string> = {};
  players.forEach((name, i) => {
    result[name] = picking.includes(name) ? defaultPortrait : `p${i + 1}`;
  });
  return result;
}

function renderLobby(overrides: Partial<LobbyScreenProps> = {}) {
  const props: LobbyScreenProps = {
    lobby: "HBIA",
    inviteLink: LINK,
    usernames: TEN,
    icons: icons(TEN),
    user: HOST,
    spectator: false,
    spectatorCount: 0,
    onStartGame: vi.fn(),
    onChangeLook: vi.fn(),
    onWatchInstead: vi.fn(),
    onPlayInstead: vi.fn(),
    onLeave: vi.fn(),
    onCopied: vi.fn(),
    ...overrides,
  };
  render(<LobbyScreen {...props} />);
  return props;
}

/** The page's own actions, in order (the header's sound control is not one of them). */
const buttons = () =>
  Array.from(document.querySelectorAll(".lobby-main button"), (b) => b.textContent);
const button = (name: string) => screen.getByRole("button", { name });
const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".lobby-players li.roster-row"));
const row = (name: string) => document.querySelector<HTMLElement>(`li.roster-row[data-player="${name}"]`)!;
const statusText = () => document.getElementById("lobby-status-text")!.textContent;

describe("LobbyScreen", () => {
  it("the host's buttons", () => {
    renderLobby();
    expect(buttons()).toEqual(["COPY", "START GAME", "CHANGE LOOK", "WATCH INSTEAD", "LEAVE LOBBY"]);
  });

  it("START GAME waits for every portrait", () => {
    renderLobby({ icons: icons(TEN, [lg(3)]) });
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
    expect(buttons()).toEqual(["COPY", "CHANGE LOOK", "WATCH INSTEAD", "LEAVE LOBBY"]);
    fireEvent.click(button("CHANGE LOOK"));
    fireEvent.click(button("WATCH INSTEAD"));
    fireEvent.click(button("LEAVE LOBBY"));
    expect(props.onChangeLook).toHaveBeenCalledTimes(1);
    expect(props.onWatchInstead).toHaveBeenCalledTimes(1);
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("a spectator's buttons", () => {
    renderLobby({ user: "", spectator: true });
    expect(buttons()).toEqual(["COPY", "PLAY INSTEAD", "LEAVE LOBBY"]);
    expect(document.querySelector(".is-user")).toBeNull();
  });

  it("PLAY INSTEAD is off in a full lobby", () => {
    renderLobby({ user: "", spectator: true });
    expect(button("PLAY INSTEAD")).toBeDisabled();
    expect(document.querySelector(".lobby-full-note")).toHaveTextContent(FULL_NOTE);
  });

  it("PLAY INSTEAD is on while a seat is free", () => {
    const nine = TEN.slice(0, 9);
    const props = renderLobby({ usernames: nine, icons: icons(nine), user: "", spectator: true });
    expect(button("PLAY INSTEAD")).toBeEnabled();
    expect(document.querySelector(".lobby-full-note")).toBeNull();
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
      const segments = lobbyStatus(TEN, picking, viewer);
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
    const about = screen.getByRole("link", { name: "About this project" });
    const bug = screen.getByRole("link", { name: "Report a bug" });
    expect(about).toHaveAttribute("href", "https://github.com/jussaw/Secret-Hitler-Online#readme");
    expect(bug).toHaveAttribute("href", "https://github.com/jussaw/Secret-Hitler-Online/issues");
    for (const link of [about, bug]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link.closest(".lobby-footer")).not.toBeNull();
    }
  });

  it("the header", () => {
    renderLobby({ spectatorCount: 2 });
    const header = document.querySelector(".lobby-screen > header.App-header")!;
    expect(header).toHaveTextContent("SECRET-HITLER");
    expect(header.querySelector(".spectator-count")).toHaveTextContent("2");
    expect(header.querySelector(".sound-toggle")).not.toBeNull();
  });
});
