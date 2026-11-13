import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import CustomAlert, { ALERT_FADE_OUT_MS } from "./CustomAlert";

// CustomAlert.css: "appear-custom-alert" fades the overlay in and "disappear-custom-alert" fades
// it out. Once the fade-out has had its time, #alert is hidden (display: none), so a closed prompt
// is never drawn and never takes a press, whatever the browser did with its animations.
const parts = (container: HTMLElement) =>
  ["#alert", "#alert-background", "#alert-box"].map((selector) => container.querySelector(selector)!);
const classes = (container: HTMLElement) => parts(container).map((el) => el.className);
const overlay = (container: HTMLElement) => container.querySelector("#alert")!;

let consoleError: MockInstance;

beforeEach(() => {
  vi.useFakeTimers();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

test("an overlay that has never been shown is hidden and plays no fade-out", () => {
  const { container } = render(<CustomAlert show={false} />);
  expect(overlay(container)).not.toBeVisible();
  expect(overlay(container)).toHaveAttribute("hidden");
});

test("a shown prompt is on screen with its content", () => {
  const { container, getByRole } = render(
    <CustomAlert show={true}>
      <button>OKAY</button>
    </CustomAlert>
  );
  expect(classes(container)).toEqual(Array(3).fill("appear-custom-alert"));
  expect(overlay(container)).not.toHaveAttribute("hidden");
  expect(getByRole("button", { name: "OKAY" })).toBeVisible();
});

test("a closed prompt fades out, then is hidden once the fade-out has had its time", () => {
  const { container, rerender } = render(<CustomAlert show={true}>OKAY</CustomAlert>);
  rerender(<CustomAlert show={false}>OKAY</CustomAlert>);
  expect(classes(container)).toEqual(Array(3).fill("disappear-custom-alert"));
  expect(overlay(container)).not.toHaveAttribute("hidden");

  advance(ALERT_FADE_OUT_MS - 1);
  expect(overlay(container)).not.toHaveAttribute("hidden");

  advance(1);
  expect(overlay(container)).toHaveAttribute("hidden");
  expect(overlay(container)).not.toBeVisible();
  // The classes stay, so the next show plays the fade-in from the hidden state.
  expect(classes(container)).toEqual(Array(3).fill("disappear-custom-alert"));
});

test("a prompt shown again during the fade-out stays on screen", () => {
  const { container, rerender } = render(<CustomAlert show={true}>first</CustomAlert>);
  rerender(<CustomAlert show={false}>first</CustomAlert>);
  advance(ALERT_FADE_OUT_MS / 2);
  rerender(<CustomAlert show={true}>second</CustomAlert>);

  // The first close's timer is gone: it cannot hide the second prompt.
  advance(ALERT_FADE_OUT_MS * 2);
  expect(overlay(container)).not.toHaveAttribute("hidden");
  expect(classes(container)).toEqual(Array(3).fill("appear-custom-alert"));
  expect(container.querySelector("#alert-box")).toHaveTextContent("second");
});

test("a prompt shown again after it was hidden comes back on screen", () => {
  const { container, rerender } = render(<CustomAlert show={false} />);
  rerender(<CustomAlert show={true}>back</CustomAlert>);
  expect(overlay(container)).not.toHaveAttribute("hidden");
  expect(classes(container)).toEqual(Array(3).fill("appear-custom-alert"));
});

test("unmounting during the fade-out leaves no timer behind", () => {
  const { rerender, unmount } = render(<CustomAlert show={true}>OKAY</CustomAlert>);
  rerender(<CustomAlert show={false}>OKAY</CustomAlert>);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
