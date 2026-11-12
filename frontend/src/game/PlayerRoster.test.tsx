import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GameState, LobbyState, Role } from "../types";
import PlayerRoster from "./PlayerRoster";
import { makeGameState } from "./testGameState";

const NAMES = ["Ann", "Ben", "Cat", "Dan", "Eve"];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function withRoles(overrides: Partial<GameState> = {}, ids: Role[] = [Role.LIBERAL, Role.FASCIST, Role.HITLER, Role.LIBERAL, Role.LIBERAL]) {
  const game = makeGameState(NAMES, overrides);
  NAMES.forEach((name, i) => (game.players[name].id = ids[i]));
  return game;
}

function renderRoster(gameState: GameState, user: string, showVotes = false, showBusy = false) {
  const view = render(<PlayerRoster gameState={gameState} user={user} showVotes={showVotes} showBusy={showBusy} />);
  const row = (name: string) => view.container.querySelector(`li[data-player="${name}"]`)!;
  return { ...view, row };
}

describe("PlayerRoster", () => {
  test("rows follow playerOrder", () => {
    const { container } = renderRoster(makeGameState(NAMES), "Ann");
    expect(container.querySelector("ol.roster")!.getAttribute("aria-label")).toBe("Players");
    const names = [...container.querySelectorAll("li.roster-row")].map((r) => r.getAttribute("data-player"));
    expect(names).toEqual(NAMES);
  });

  test("only the user's row is highlighted", () => {
    const { container } = renderRoster(makeGameState(NAMES), "Cat");
    expect([...container.querySelectorAll(".is-user")].map((r) => r.getAttribute("data-player"))).toEqual(["Cat"]);
    const spectator = renderRoster(makeGameState(NAMES), "");
    expect(spectator.container.querySelectorAll(".is-user").length).toBe(0);
  });

  test("offices show in the detail line and the tag", () => {
    const { row } = renderRoster(makeGameState(NAMES, { chancellor: "Ben" }), "Cat");
    expect(row("Ann").querySelector(".roster-detail")!.textContent).toBe("PRESIDENT");
    expect(row("Ann").querySelector(".roster-tag")!.textContent).toBe("PRES");
    expect(row("Ben").querySelector(".roster-detail")!.textContent).toBe("CHANCELLOR");
    expect(row("Ben").querySelector(".roster-tag")!.textContent).toBe("CHAN");
    expect(row("Cat").querySelector(".roster-tag")!.textContent).toBe("");
  });

  test("the user's own role shows as a word and an icon", () => {
    // The server sends a liberal only their own role.
    const game = makeGameState(NAMES);
    game.players.Dan.id = Role.LIBERAL;
    const { row } = renderRoster(game, "Dan");
    const detail = row("Dan").querySelector(".roster-detail")!;
    expect(detail.textContent).toBe("Liberal");
    expect(detail.classList.contains("role-liberal")).toBe(true);
    expect(row("Dan").querySelector('img.roster-role-icon[alt="Liberal"]')).not.toBeNull();
    expect(row("Ann").querySelector(".roster-role-icon")).toBeNull();
  });

  test("a teammate in office keeps the role icon but shows the office", () => {
    const game = withRoles({ president: "Ben" }, [Role.LIBERAL, Role.FASCIST, Role.HITLER, Role.LIBERAL, Role.FASCIST]);
    const { row } = renderRoster(game, "Eve");
    expect(row("Ben").querySelector(".roster-detail")!.textContent).toBe("PRESIDENT");
    expect(row("Ben").querySelector(".roster-name img")!.getAttribute("alt")).toBe("Fascist");
    expect(row("Cat").querySelector(".roster-detail")!.textContent).toBe("Hitler");
    expect(row("Cat").querySelector(".roster-detail")!.classList.contains("role-fascist")).toBe(true);
    expect(row("Cat").querySelector(".roster-name img")!.getAttribute("alt")).toBe("Hitler");
  });

  test("an executed player is darkened and shows no vote", () => {
    const game = makeGameState(NAMES, {
      state: LobbyState.CHANCELLOR_VOTING,
      userVotes: { Ann: true, Ben: false, Cat: true, Dan: true, Eve: true },
    });
    game.players.Cat.alive = false;
    const { row } = renderRoster(game, "Ann", true, true);
    expect(row("Cat").classList.contains("is-disabled")).toBe(true);
    expect(row("Cat").querySelector(".roster-detail")!.textContent).toBe("EXECUTED");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(row("Dan").querySelector(".roster-vote")).not.toBeNull();
    expect(row("Cat").querySelector(".roster-vote")).toBeNull();
  });

  test("an executed player is never busy while others are", () => {
    const game = makeGameState(NAMES, { state: LobbyState.CHANCELLOR_VOTING, userVotes: { Ann: true } });
    game.players.Cat.alive = false;
    const { row } = renderRoster(game, "Ann", false, true);
    expect(row("Ben").querySelector(".roster-busy")).not.toBeNull();
    expect(row("Cat").querySelector(".roster-busy")).toBeNull();
  });

  test("only the nominating president is busy", () => {
    const { container, row } = renderRoster(makeGameState(NAMES), "Ben", false, true);
    expect(container.querySelectorAll("img.roster-busy").length).toBe(1);
    expect(row("Ann").querySelector("img.roster-busy")).not.toBeNull();
  });

  test("votes show after the reveal", () => {
    const votes = { Ann: true, Ben: false, Cat: true, Dan: false, Eve: true };
    const { row } = renderRoster(makeGameState(NAMES, { state: LobbyState.CHANCELLOR_VOTING, userVotes: votes }), "Ann", true);
    expect(row("Ann").querySelector(".roster-vote")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    NAMES.forEach((n) => {
      const img = row(n).querySelector("img.roster-vote")!;
      expect(img.getAttribute("alt")).toBe(votes[n as keyof typeof votes] ? "ja" : "nein");
    });
  });

  test("every row reserves one detail line", () => {
    const { container } = renderRoster(makeGameState(NAMES), "Ann");
    container.querySelectorAll("li.roster-row").forEach((r) => {
      expect(r.querySelectorAll(".roster-detail").length).toBe(1);
    });
  });
});
