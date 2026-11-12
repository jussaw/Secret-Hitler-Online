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
    statusStep: null,
    drawDeckSize: 17,
    discardDeckSize: 0,
    liberalPolicies: 0,
    fascistPolicies: 0,
    electionTracker: 0,
    spectatorCount: 0,
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
  // The tracker wraps "president" and "chancellor" in spans, so read the line's whole text.
  expect(document.getElementById("status-bar-text")).toHaveTextContent(
    "Waiting for president to nominate a chancellor."
  );
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

test("a spectator sees every seat, none their own, and no END TERM", () => {
  const { container } = render(
    <GameScreen
      gameState={makeGameState(NAMES, { state: LobbyState.POST_LEGISLATIVE, president: "Bob" })}
      user=""
      spectator={true}
      spectatorCount={1}
      showVotes={false}
      showBusy={true}
      statusBarText="Waiting for Bob to end their term."
      statusStep={null}
      drawDeckSize={17}
      discardDeckSize={0}
      liberalPolicies={0}
      fascistPolicies={0}
      electionTracker={0}
      onEndTerm={vi.fn()}
    />
  );
  expect(container.querySelectorAll(".table-seat")).toHaveLength(5);
  expect(container.querySelectorAll("#player-container.highlight")).toHaveLength(0);
  // The button keeps its box, so the centre lays out as a player's does.
  // A hidden button has no accessible name, so find it by its text.
  expect(screen.getByText("END TERM")).toHaveStyle({ visibility: "hidden" });
});

test("the header shows how many spectators watch, once anyone does", () => {
  renderScreen({ spectatorCount: 2 });
  expect(screen.getByRole("status", { name: "2 spectators watching" })).toBeInTheDocument();
});

test("the header shows no count when nobody watches", () => {
  renderScreen({ spectatorCount: 0 });
  expect(screen.queryByRole("status", { name: /watching/ })).toBeNull();
});

test("the game banner reads SECRET-HITLER", () => {
  renderScreen();
  expect(document.querySelector("header")).toHaveTextContent(/^SECRET-HITLER$/);
});
