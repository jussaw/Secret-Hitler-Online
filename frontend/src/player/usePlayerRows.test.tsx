import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeGameState } from "../game/testGameState";
import { GameState, LobbyState, Role } from "../types";
import { PlayerDisplayProps } from "./PlayerDisplay";
import { usePlayerRows } from "./usePlayerRows";

const NAMES = ["Ann", "Ben", "Cat", "Dan", "Eve"];

const rowsOf = (props: PlayerDisplayProps) => renderHook(() => usePlayerRows(props)).result.current;
const byName = (rows: ReturnType<typeof rowsOf>, name: string) => rows.find((r) => r.name === name)!;

function withRoles(overrides: Partial<GameState> = {}) {
  const game = makeGameState(NAMES, overrides);
  const ids = [Role.LIBERAL, Role.FASCIST, Role.HITLER, Role.LIBERAL, Role.LIBERAL];
  NAMES.forEach((name, i) => (game.players[name].id = ids[i]));
  return game;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("office", () => {
  test("marks the president and the chancellor", () => {
    const rows = rowsOf({ user: "Ann", gameState: makeGameState(NAMES, { chancellor: "Ben" }) });
    expect(rows.map((r) => r.office)).toEqual(["PRESIDENT", "CHANCELLOR", "", "", ""]);
  });
});

describe("busy", () => {
  const game = makeGameState(NAMES);
  test("only the nominating president is busy", () => {
    const rows = rowsOf({ user: "Ben", gameState: game, showBusy: true });
    expect(rows.filter((r) => r.busy).map((r) => r.name)).toEqual(["Ann"]);
  });
  test("nobody is busy while votes show", () => {
    const rows = rowsOf({ user: "Ben", gameState: game, showBusy: true, showVotes: true });
    expect(rows.some((r) => r.busy)).toBe(false);
  });
  test("nobody is busy when showBusy is off", () => {
    const rows = rowsOf({ user: "Ben", gameState: game, showBusy: false });
    expect(rows.some((r) => r.busy)).toBe(false);
  });
  test("busy is false, not undefined, when showBusy is omitted", () => {
    rowsOf({ user: "Ben", gameState: game }).forEach((r) => expect(r.busy).toBe(false));
  });
  test(
    "in the vote, the user is left out with includeUser off and the rest who have not voted are busy",
    () => {
      const voting = makeGameState(NAMES, {
        state: LobbyState.CHANCELLOR_VOTING,
        userVotes: { Ann: true },
      });
      const rows = rowsOf({ user: "Ben", gameState: voting, showBusy: true, includeUser: false });
      expect(rows.map((r) => r.name)).toEqual(["Ann", "Cat", "Dan", "Eve"]);
      expect(rows.filter((r) => r.busy).map((r) => r.name)).toEqual(["Cat", "Dan", "Eve"]);
    }
  );
  test("in the vote, only the shown players can be busy", () => {
    const voting = makeGameState(NAMES, { state: LobbyState.CHANCELLOR_VOTING });
    const rows = rowsOf({
      user: "Ann",
      gameState: voting,
      showBusy: true,
      players: ["Cat", "Dan"],
    });
    expect(rows.filter((r) => r.busy).map((r) => r.name)).toEqual(["Cat", "Dan"]);
  });
  test("a dead president is not busy", () => {
    const dead = makeGameState(NAMES);
    dead.players.Ann.alive = false;
    const rows = rowsOf({ user: "Ben", gameState: dead, showBusy: true });
    expect(rows.some((r) => r.busy)).toBe(false);
  });
});

describe("role", () => {
  test("a liberal sees only their own role", () => {
    const game = makeGameState(NAMES);
    game.players.Dan.id = Role.LIBERAL;
    const rows = rowsOf({ user: "Dan", gameState: game });
    expect(rows.filter((r) => r.role !== undefined).map((r) => r.name)).toEqual(["Dan"]);
  });
  test("a fascist sees fascists and Hitler, not liberals", () => {
    const rows = rowsOf({ user: "Ben", gameState: withRoles() });
    expect(byName(rows, "Ben").role).toBe(Role.FASCIST);
    expect(byName(rows, "Cat").role).toBe(Role.HITLER);
    expect(byName(rows, "Ann").role).toBeUndefined();
    expect(byName(rows, "Dan").role).toBeUndefined();
  });
  test("a spectator sees roles only once the game is over", () => {
    const early = rowsOf({ user: "", gameState: withRoles({ state: LobbyState.POST_LEGISLATIVE }) });
    expect(early.every((r) => r.role === undefined)).toBe(true);
    const over = rowsOf({ user: "", gameState: withRoles({ state: LobbyState.FASCIST_VICTORY_POLICY }) });
    expect(over.every((r) => r.role !== undefined)).toBe(true);
  });
});

describe("a dead player", () => {
  test("is executed, and never shows a vote or busy", () => {
    const game = makeGameState(NAMES, {
      state: LobbyState.CHANCELLOR_VOTING,
      userVotes: { Ann: true, Ben: false, Dan: true, Eve: true },
    });
    game.players.Cat.alive = false;
    const { result } = renderHook(() =>
      usePlayerRows({ user: "Ann", gameState: game, showVotes: true, showBusy: true })
    );
    expect(byName(result.current, "Cat").disabledText).toBe("EXECUTED");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const rows = result.current;
    rows.filter((r) => r.name !== "Cat").forEach((r) => expect(r.showVote).toBe(true));
    expect(byName(rows, "Cat").showVote).toBe(false);
    expect(byName(rows, "Cat").busy).toBe(false);
    expect(byName(rows, "Ben").vote).toBe(false);
  });

  test("votes are revealed one player at a time", () => {
    const game = makeGameState(NAMES, { userVotes: { Ann: true, Ben: true, Cat: true, Dan: true, Eve: true } });
    const { result } = renderHook(() => usePlayerRows({ user: "Ann", gameState: game, showVotes: true }));
    expect(result.current.some((r) => r.showVote)).toBe(false);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.filter((r) => r.showVote).map((r) => r.name)).toEqual(["Ann"]);
  });
});

describe("isUser", () => {
  test("is true for the user's row only", () => {
    const rows = rowsOf({ user: "Cat", gameState: makeGameState(NAMES) });
    expect(rows.filter((r) => r.isUser).map((r) => r.name)).toEqual(["Cat"]);
  });
  test("is false everywhere for a spectator", () => {
    expect(rowsOf({ user: "", gameState: makeGameState(NAMES) }).some((r) => r.isUser)).toBe(false);
  });
});
