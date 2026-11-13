import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import EventBar from "./EventBar";

// EventBar.css: "start-eventbar" is hidden with no animation, "appear-eventbar" slides the bar
// and its text in and "disappear-eventbar" fades them out. The bar stays on "start" until it is
// first shown, so a bar that mounts hidden does not play the fade-out.
const barClasses = (container: HTMLElement) =>
  ["#event-bar", "#bar-background", "#event-bar-text"].map(
    (selector) => container.querySelector(selector)!.className
  );

let consoleError: MockInstance;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  consoleError.mockRestore();
});

test("hidden, then shown, then hidden: the bar appears on its first show and disappears after", () => {
  const { container, rerender } = render(<EventBar show={false} message="" />);
  expect(barClasses(container)).toEqual(Array(3).fill("start-eventbar"));

  rerender(<EventBar show={true} message="CHANCELLOR NOMINATION" />);
  expect(barClasses(container)).toEqual(Array(3).fill("appear-eventbar"));

  rerender(<EventBar show={false} message="CHANCELLOR NOMINATION" />);
  expect(barClasses(container)).toEqual(Array(3).fill("disappear-eventbar"));

  rerender(<EventBar show={true} message="POLICY ENACTED" />);
  expect(barClasses(container)).toEqual(Array(3).fill("appear-eventbar"));

  expect(consoleError).not.toHaveBeenCalled();
});
