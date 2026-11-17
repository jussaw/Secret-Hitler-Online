import { act, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import PromptLayout from "./PromptLayout";

// PromptLayout draws every prompt's three parts: the title, the middle (which alone scrolls) and
// the buttons. While the middle scrolls, the prompt takes `prompt-scrolls`, which draws a line
// above the buttons (CustomAlert.css).

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Makes every element report these scroll sizes, as the browser's layout would. */
function sizes(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clientHeight);
}

/** A ResizeObserver whose callback the test runs, recording what it observes. */
function stubResizeObserver() {
  const observed: Element[] = [];
  let resized: () => void = () => undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {
        observed.length = 0;
      }
    }
  );
  return { observed, resize: () => act(() => resized()) };
}

const layout = (
  <PromptLayout className="vote-prompt" title={<h2>VOTING</h2>} buttons={<button>CONFIRM</button>}>
    <p>Vote on whether you want this government to proceed.</p>
  </PromptLayout>
);

test("the title, the middle and the buttons are the prompt's three parts, in that order", () => {
  const { container } = render(layout);
  const prompt = container.firstElementChild!;
  expect(prompt).toHaveClass("prompt", "vote-prompt");
  const parts = Array.from(prompt.children).map((part) => part.className);
  expect(parts).toEqual(["prompt-title", "prompt-body", "prompt-buttons"]);
  expect(prompt.querySelector(".prompt-title")).toHaveTextContent("VOTING");
  expect(prompt.querySelector(".prompt-body")).toHaveTextContent("Vote on whether");
  expect(prompt.querySelector(".prompt-buttons")).toHaveTextContent("CONFIRM");
});

test("a prompt whose middle fits draws no line above its buttons", () => {
  sizes(300, 300);
  const { container } = render(layout);
  expect(container.firstElementChild).not.toHaveClass("prompt-scrolls");
});

test("a prompt whose middle scrolls draws the line above its buttons", () => {
  sizes(900, 300);
  const { container } = render(layout);
  expect(container.firstElementChild).toHaveClass("prompt-scrolls");
});

test("a pixel's rounding is not a scroll", () => {
  sizes(301, 300);
  const { container } = render(layout);
  expect(container.firstElementChild).not.toHaveClass("prompt-scrolls");
});

test("the line follows the middle as the window or what it holds changes size", () => {
  const { observed, resize } = stubResizeObserver();
  sizes(300, 300);
  const { container } = render(layout);
  const body = container.querySelector(".prompt-body")!;
  // The middle and what it holds: either can change size without the other.
  expect(observed).toEqual([body, body.firstElementChild]);
  expect(container.firstElementChild).not.toHaveClass("prompt-scrolls");

  sizes(900, 300);
  resize();
  expect(container.firstElementChild).toHaveClass("prompt-scrolls");

  sizes(300, 300);
  resize();
  expect(container.firstElementChild).not.toHaveClass("prompt-scrolls");
});

test("unmounting stops watching the middle", () => {
  const { observed } = stubResizeObserver();
  const { unmount } = render(layout);
  unmount();
  expect(observed).toEqual([]);
});
