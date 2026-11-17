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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

/** Every element's box is `height` px tall, as the browser's layout would make it. */
const heightOf = (height: number) =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height } as DOMRect);

/** A ResizeObserver whose callbacks the test runs, with what each observes. */
function stubResizeObserver() {
  const observers: { callback: () => void; observed: Element[] }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: { callback: () => void; observed: Element[] };
      constructor(callback: () => void) {
        this.entry = { callback, observed: [] };
        observers.push(this.entry);
      }
      observe(el: Element) {
        this.entry.observed.push(el);
      }
      disconnect() {
        this.entry.observed = [];
      }
    }
  );
  const watching = (el: Element) => observers.filter((o) => o.observed.includes(el));
  return { watching, resize: (el: Element) => act(() => watching(el).forEach((o) => o.callback())) };
}

const box = (container: HTMLElement) => container.querySelector<HTMLElement>("#alert-box")!;

test("a prompt the server's OK empties fades out at the height it had", () => {
  const height = heightOf(420);
  const { container, rerender } = render(<CustomAlert show={true}>VOTING</CustomAlert>);
  expect(box(container).style.minHeight).toBe("");

  // App empties the box in the same update that closes it.
  height.mockReturnValue({ height: 40 } as DOMRect);
  rerender(<CustomAlert show={false} />);
  expect(box(container).style.minHeight).toBe("420px");

  // Shown again, the box is as tall as what it holds.
  rerender(<CustomAlert show={true}>ROLE</CustomAlert>);
  expect(box(container).style.minHeight).toBe("");
});

test("the held height is the box's last while it was shown, after an image or the window resized it", () => {
  const { resize } = stubResizeObserver();
  const height = heightOf(300);
  const { container, rerender } = render(<CustomAlert show={true}>VOTING</CustomAlert>);
  height.mockReturnValue({ height: 480 } as DOMRect);
  resize(box(container));

  height.mockReturnValue({ height: 40 } as DOMRect);
  rerender(<CustomAlert show={false} />);
  expect(box(container).style.minHeight).toBe("480px");
});

test("an overlay that has never been shown holds no height", () => {
  heightOf(0);
  const { container } = render(<CustomAlert show={false} />);
  expect(box(container).style.minHeight).toBe("");
});

/**
 * The page beside the overlay, as App draws it: the overlay, then a page with its header. Each page
 * is a component of its own in App, so a new page brings a new header (the key).
 */
function Page({ show, header = "game" }: { show: boolean; header?: string }) {
  return (
    <div className="App">
      <CustomAlert show={show}>OKAY</CustomAlert>
      <div key={header} className={`${header}-screen`}>
        <header className={header}>SECRET-HITLER</header>
      </div>
    </div>
  );
}

const headerRoom = (container: HTMLElement) => overlay(container).getAttribute("style") ?? "";

test("the box keeps clear of the page's header: --alert-header is the header's height", () => {
  heightOf(46.5);
  const { container } = render(<Page show={true} />);
  expect(headerRoom(container)).toContain("--alert-header: 46.5px");
});

test("--alert-header follows the header as the window resizes it", () => {
  const { watching, resize } = stubResizeObserver();
  const height = heightOf(40);
  const { container } = render(<Page show={true} />);
  const header = container.querySelector("header")!;
  expect(watching(header)).toHaveLength(1);

  height.mockReturnValue({ height: 77 } as DOMRect);
  resize(header);
  expect(headerRoom(container)).toContain("--alert-header: 77px");
});

test("a prompt that stays open as the page changes keeps clear of the new page's header", () => {
  const { watching } = stubResizeObserver();
  const height = heightOf(77);
  const { container, rerender } = render(<Page show={true} header="login" />);
  const loginHeader = container.querySelector("header")!;
  expect(headerRoom(container)).toContain("--alert-header: 77px");

  // CHOOSE A NAME stays open from the login page to the lobby.
  height.mockReturnValue({ height: 40 } as DOMRect);
  rerender(<Page show={true} header="lobby" />);
  expect(headerRoom(container)).toContain("--alert-header: 40px");
  expect(watching(loginHeader)).toEqual([]);
  expect(watching(container.querySelector("header")!)).toHaveLength(1);
});

test("with no header beside it, the box keeps no room for one", () => {
  heightOf(46);
  const { container } = render(<CustomAlert show={true}>OKAY</CustomAlert>);
  expect(headerRoom(container)).toContain("--alert-header: 0px");
});
