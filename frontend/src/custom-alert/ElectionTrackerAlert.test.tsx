import { Component, StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ElectionTrackerAlert from "./ElectionTrackerAlert";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error");
  vi.spyOn(console, "warn");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const alert = () => <ElectionTrackerAlert trackerPosition={2} closeAlert={vi.fn()} />;
const token = (container: HTMLElement) => container.querySelector("#election-tracker-token")!;

function expectAnimation(container: HTMLElement) {
  expect(token(container)).toHaveClass("et-position-1");
  act(() => vi.advanceTimersByTime(499));
  expect(token(container)).toHaveClass("et-position-1");
  act(() => vi.advanceTimersByTime(1));
  expect(token(container)).toHaveClass("et-moveto-2");
  expect(token(container)).not.toHaveClass("et-position-1");
}

test("moves the token from the last position to the new one after 500 ms", () => {
  const { container } = render(alert());
  expectAnimation(container);
});

// StrictMode builds each class twice and throws one instance away; a timer started in the
// constructor would set state on that unmounted instance.
test("animates the same under StrictMode, without warning", () => {
  const { container } = render(<StrictMode>{alert()}</StrictMode>);
  expect(vi.getTimerCount()).toBe(1);
  expectAnimation(container);
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
});

test("unmounting clears the timer, so nothing fires or warns afterwards", () => {
  const setState = vi.spyOn(Component.prototype, "setState");
  const { unmount } = render(alert());
  unmount();
  const callsAtUnmount = setState.mock.calls.length;
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(500);
  expect(setState).toHaveBeenCalledTimes(callsAtUnmount);
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
});
