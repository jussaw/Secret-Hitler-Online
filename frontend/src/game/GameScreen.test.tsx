import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LobbyState } from "../types";
import GameScreen, { GameScreenProps } from "./GameScreen";
import { makeGameState } from "./testGameState";

const NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin"];

function renderScreen(overrides: Partial<GameScreenProps> = {}) {
  const props: GameScreenProps = {
    gameState: makeGameState(NAMES),
    user: "Alice",
    showVotes: false,
    showBusy: true,
    statusBarText: "Waiting for president to nominate a chancellor.",
    drawDeckSize: 17,
    discardDeckSize: 0,
    liberalPolicies: 0,
    fascistPolicies: 0,
    electionTracker: 0,
    onEndTerm: vi.fn(),
    ...overrides,
  };
  render(<GameScreen {...props} />);
  return props;
}

test("shows every player and the status text", () => {
  renderScreen();
  for (const name of NAMES) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
  expect(
    screen.getByText("Waiting for president to nominate a chancellor.")
  ).toBeInTheDocument();
});

test("END TERM is disabled outside the post-legislative phase", () => {
  renderScreen();
  expect(screen.getByRole("button", { name: "END TERM" })).toBeDisabled();
});

test("END TERM is disabled for anyone but the president", () => {
  renderScreen({
    gameState: makeGameState(NAMES, { state: LobbyState.POST_LEGISLATIVE }),
    user: "Bob",
  });
  expect(screen.getByRole("button", { name: "END TERM" })).toBeDisabled();
});

test("the president ends the term with END TERM", () => {
  const props = renderScreen({
    gameState: makeGameState(NAMES, { state: LobbyState.POST_LEGISLATIVE }),
  });
  const button = screen.getByRole("button", { name: "END TERM" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(props.onEndTerm).toHaveBeenCalledTimes(1);
});
