import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { makeGameState } from "../game/testGameState";
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
