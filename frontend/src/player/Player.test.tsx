import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import Player from "./Player";

// Player.css: "player-icon-default" is hidden with no animation, "player-icon-show" drops the
// icon in and "player-icon-hide" fades it out. An icon stays on "default" until it is first
// shown, so a tile that was never busy (or never voted) does not play the fade-out.
const iconClasses = (container: HTMLElement) => ({
  busy: container.querySelector("#player-busy-icon")!.className,
  vote: container.querySelector("#player-icon-vote")!.className,
});

let consoleError: MockInstance;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  consoleError.mockRestore();
});

test("idle, then busy, then with a vote: each icon animates in on its first show", () => {
  const { container, rerender } = render(<Player name="Ann" showRole={false} />);
  expect(iconClasses(container)).toEqual({
    busy: "player-icon-default",
    vote: "player-icon-default",
  });

  rerender(<Player name="Ann" showRole={false} isBusy={true} />);
  expect(iconClasses(container)).toEqual({
    busy: "player-icon-show",
    vote: "player-icon-default",
  });

  rerender(<Player name="Ann" showRole={false} showVote={true} vote={true} />);
  expect(iconClasses(container)).toEqual({
    busy: "player-icon-hide",
    vote: "player-icon-show",
  });

  rerender(<Player name="Ann" showRole={false} />);
  expect(iconClasses(container)).toEqual({
    busy: "player-icon-hide",
    vote: "player-icon-hide",
  });

  expect(consoleError).not.toHaveBeenCalled();
});

test("a tile that mounts busy and voting shows both icons at once", () => {
  const { container } = render(
    <Player name="Ann" showRole={false} isBusy={true} showVote={true} vote={false} />
  );
  expect(iconClasses(container)).toEqual({
    busy: "player-icon-show",
    vote: "player-icon-show",
  });
  expect(consoleError).not.toHaveBeenCalled();
});
