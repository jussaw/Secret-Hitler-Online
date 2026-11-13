import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import TermTimer, { secondsLeft } from "./TermTimer";
import type { TermTimerState } from "../types";

beforeEach(() => {
  // The countdown reads performance.now() and redraws on an interval.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
});

function show(timer: TermTimerState, canPause = false) {
  const props = { timer, canPause, onPause: vi.fn(), onResume: vi.fn() };
  const view = render(<TermTimer {...props} />);
  return { ...props, rerender: (next: TermTimerState) => view.rerender(<TermTimer {...props} timer={next} />) };
}

const seconds = () => document.querySelector(".term-timer-seconds")!.textContent;

test("seconds are rounded up, so the last one shows until the time is up", () => {
  expect(secondsLeft(10_000)).toBe(10);
  expect(secondsLeft(9_001)).toBe(10);
  expect(secondsLeft(9_000)).toBe(9);
  expect(secondsLeft(1)).toBe(1);
  expect(secondsLeft(0)).toBe(0);
  expect(secondsLeft(-50)).toBe(0);
});

test("a running countdown counts down on its own from the server's time", () => {
  show({ remainingMs: 10_000, paused: false });
  expect(seconds()).toBe("10");
  act(() => vi.advanceTimersByTime(1_000));
  expect(seconds()).toBe("9");
  act(() => vi.advanceTimersByTime(4_500));
  expect(seconds()).toBe("5");
  act(() => vi.advanceTimersByTime(20_000));
  expect(seconds()).toBe("0");
});

test("a paused countdown holds its time", () => {
  show({ remainingMs: 6_400, paused: true });
  expect(seconds()).toBe("7");
  act(() => vi.advanceTimersByTime(10_000));
  expect(seconds()).toBe("7");
  expect(document.querySelector(".term-timer")).toHaveClass("paused");
});

test("each packet restarts the count from the time it brings", () => {
  const view = show({ remainingMs: 10_000, paused: false });
  act(() => vi.advanceTimersByTime(3_000));
  expect(seconds()).toBe("7");
  // Paused by the president: the server's time stands.
  view.rerender({ remainingMs: 6_900, paused: true });
  expect(seconds()).toBe("7");
  act(() => vi.advanceTimersByTime(5_000));
  expect(seconds()).toBe("7");
  // Resumed: it runs on from there, whatever the page counted meanwhile.
  view.rerender({ remainingMs: 6_900, paused: false });
  act(() => vi.advanceTimersByTime(2_000));
  expect(seconds()).toBe("5");
});

test("the president's chip is a button whose icon is what it does", () => {
  const running = show({ remainingMs: 8_000, paused: false }, true);
  fireEvent.click(screen.getByRole("button", { name: "Pause the countdown" }));
  expect(running.onPause).toHaveBeenCalledTimes(1);
  expect(document.querySelector(".lucide-pause")).not.toBeNull();

  running.rerender({ remainingMs: 8_000, paused: true });
  fireEvent.click(screen.getByRole("button", { name: "Resume the countdown" }));
  expect(running.onResume).toHaveBeenCalledTimes(1);
  expect(running.onPause).toHaveBeenCalledTimes(1);
  expect(document.querySelector(".lucide-play")).not.toBeNull();
});

test("everyone else's chip shows the countdown's state, and is no button", () => {
  const view = show({ remainingMs: 8_000, paused: false });
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByRole("timer", { name: "Time left in the term" })).toBeInTheDocument();
  expect(document.querySelector(".lucide-timer")).not.toBeNull();

  view.rerender({ remainingMs: 8_000, paused: true });
  expect(screen.getByRole("timer", { name: "The countdown to the end of the term is paused" })).toBeInTheDocument();
  expect(document.querySelector(".lucide-pause")).not.toBeNull();
});
