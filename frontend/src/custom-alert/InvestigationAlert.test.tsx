import { Component, StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import InvestigationAlert from "./InvestigationAlert";
import { FASCIST } from "../constants";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error");
  vi.spyOn(console, "warn");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const alert = () => <InvestigationAlert party={FASCIST} target="Ann" hideAlert={vi.fn()} />;
const card = (container: HTMLElement) => container.querySelector("#party-card-back")!;
const text = (container: HTMLElement) => container.querySelector("#investigation-text")!;

function expectAnimation(container: HTMLElement) {
  const okay = screen.getByRole("button", { name: "OKAY" });
  expect(card(container)).toHaveClass("investigation-container-default");
  expect(text(container)).toHaveClass("investigation-text-hide");
  expect(okay).toBeDisabled();
  act(() => vi.advanceTimersByTime(1000));
  expect(card(container)).toHaveClass("investigation-container-flip");
  expect(text(container)).toHaveClass("investigation-text-hide");
  expect(okay).toBeDisabled();
  act(() => vi.advanceTimersByTime(500));
  expect(text(container)).toHaveClass("investigation-text-show");
  expect(okay).toBeEnabled();
}

test("flips the card at 1 s, then shows the text and enables OKAY at 1.5 s", () => {
  const { container } = render(alert());
  expectAnimation(container);
});

// StrictMode builds each class twice and throws one instance away; a timer started in the
// constructor would set state on that unmounted instance.
test("animates the same under StrictMode, without warning", () => {
  const { container } = render(<StrictMode>{alert()}</StrictMode>);
  expect(vi.getTimerCount()).toBe(2);
  expectAnimation(container);
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
});

test("unmounting clears both timers, so nothing fires or warns afterwards", () => {
  const setState = vi.spyOn(Component.prototype, "setState");
  const { unmount } = render(alert());
  unmount();
  const callsAtUnmount = setState.mock.calls.length;
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(1500);
  expect(setState).toHaveBeenCalledTimes(callsAtUnmount);
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
});
