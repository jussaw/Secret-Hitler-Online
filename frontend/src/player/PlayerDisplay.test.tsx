import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { makeGameState } from "../game/testGameState";
import { LobbyState, Role } from "../types";
import PlayerDisplay from "./PlayerDisplay";

const SEVEN = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus"];

test("prompts keep the row layout: seven players split into rows of 3 and 4", () => {
  const { container } = render(
    <PlayerDisplay user="Ann" gameState={makeGameState(SEVEN)} />
  );
  const rows = Array.from(container.querySelectorAll("#player-display-container"));
  expect(rows.map((row) => row.querySelectorAll("#player-container").length)).toEqual([
    3, 4, 0,
  ]);
});

describe("a spectator (user \"\", not a player)", () => {
  const withRoles = (state: LobbyState) => {
    const game = makeGameState(SEVEN, { state });
    SEVEN.forEach((name, i) => (game.players[name].id = i === 0 ? Role.HITLER : Role.LIBERAL));
    return game;
  };

  test("sees every tile, none highlighted", () => {
    const { container } = render(<PlayerDisplay user="" gameState={makeGameState(SEVEN)} />);
    expect(container.querySelectorAll("#player-container")).toHaveLength(7);
    expect(container.querySelectorAll("#player-container.highlight")).toHaveLength(0);
  });

  test("sees no role before the game ends", () => {
    const { container } = render(
      <PlayerDisplay user="" gameState={withRoles(LobbyState.POST_LEGISLATIVE)} showRoles={true} />
    );
    expect(container.querySelectorAll("#player-identity-label")).toHaveLength(0);
  });

  test("sees every role when the game is over", () => {
    const { container } = render(
      <PlayerDisplay user="" gameState={withRoles(LobbyState.FASCIST_VICTORY_POLICY)} showRoles={true} />
    );
    expect(container.querySelectorAll("#player-identity-label")).toHaveLength(7);
  });
});
