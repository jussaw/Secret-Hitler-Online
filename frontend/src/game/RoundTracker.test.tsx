import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import RoundTracker from "./RoundTracker";
import { ROUND_STEPS, RoundStep } from "./roundStep";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function steps(container: HTMLElement) {
  return Array.from(container.querySelectorAll("li.round-step"));
}

describe("RoundTracker steps", () => {
  test("ELECTION lights the second step", () => {
    const { container } = render(<RoundTracker step={RoundStep.ELECTION} text="x" />);
    const items = steps(container);
    expect(items.map((li) => li.textContent)).toEqual([...ROUND_STEPS]);
    expect(items[0].classList.contains("done")).toBe(true);
    expect(items[1].classList.contains("current")).toBe(true);
    expect(items[1].getAttribute("aria-current")).toBe("step");
    expect(items[2].classList.contains("later")).toBe(true);
    expect(items[3].classList.contains("later")).toBe(true);
    expect(container.querySelector("section.round-tracker")!.getAttribute("aria-label")).toBe("Round");
  });

  test("no step leaves all four later", () => {
    const { container } = render(<RoundTracker step={null} text="x" />);
    const items = steps(container);
    expect(items.every((li) => li.classList.contains("later"))).toBe(true);
    expect(container.querySelector(".current")).toBeNull();
    expect(container.querySelector("[aria-current]")).toBeNull();
  });
});

describe("RoundTracker line", () => {
  test("highlights whole words president and chancellor", () => {
    const text = "Chancellor has motioned to veto the agenda. Waiting for the president to decide.";
    const { container } = render(<RoundTracker step={null} text={text} />);
    const line = container.querySelector("#status-bar-text")!;
    expect(line.tagName).toBe("P");
    expect(line.classList.contains("round-line")).toBe(true);
    expect(line.textContent).toBe(text);
    expect(Array.from(line.querySelectorAll(".round-highlight")).map((s) => s.textContent)).toEqual([
      "Chancellor",
      "president",
    ]);
  });

  test("does not highlight partial words", () => {
    const { container } = render(<RoundTracker step={null} text="Presidential" />);
    expect(container.querySelector(".round-highlight")).toBeNull();
  });

  test("fades the old text out, then shows the new text", () => {
    const { container, rerender } = render(<RoundTracker step={null} text="Old line" />);
    const line = () => container.querySelector("#status-bar-text")!;
    rerender(<RoundTracker step={null} text="New line" />);
    expect(line().textContent).toBe("Old line");
    expect(line().classList.contains("fading")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(line().textContent).toBe("New line");
    expect(line().classList.contains("fading")).toBe(false);
  });

  test("a text change during the fade shows only the latest text", () => {
    const { container, rerender } = render(<RoundTracker step={null} text="A" />);
    const line = () => container.querySelector("#status-bar-text")!;
    rerender(<RoundTracker step={null} text="B" />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(<RoundTracker step={null} text="C" />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(line().textContent).toBe("A");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(line().textContent).toBe("C");
  });

  test("the old step stays lit during the fade, then moves with the new line", () => {
    const { container, rerender } = render(<RoundTracker step={RoundStep.ELECTION} text="Old line" />);
    const lit = () => container.querySelector(".round-step.current")!.textContent;
    rerender(<RoundTracker step={RoundStep.LEGISLATIVE} text="New line" />);
    expect(lit()).toBe(ROUND_STEPS[1]);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(lit()).toBe(ROUND_STEPS[2]);
  });

  test("a step change with the same text applies at once", () => {
    const { container, rerender } = render(<RoundTracker step={RoundStep.ELECTION} text="Same" />);
    rerender(<RoundTracker step={RoundStep.LEGISLATIVE} text="Same" />);
    expect(container.querySelector(".round-step.current")!.textContent).toBe(ROUND_STEPS[2]);
  });
});

describe("RoundTracker edge cases", () => {
  test("the first render does not fade", () => {
    const { container } = render(<RoundTracker step={null} text="First" />);
    const line = container.querySelector("#status-bar-text")!;
    expect(line.textContent).toBe("First");
    expect(line.classList.contains("fading")).toBe(false);
  });
  test("an empty line renders an empty paragraph", () => {
    const { container } = render(<RoundTracker step={null} text="" />);
    expect(container.querySelector("#status-bar-text")!.textContent).toBe("");
    expect(container.querySelector(".round-highlight")).toBeNull();
  });
  test("highlights an all-caps PRESIDENT", () => {
    const { container } = render(<RoundTracker step={null} text="WAITING FOR THE PRESIDENT." />);
    expect([...container.querySelectorAll(".round-highlight")].map((s) => s.textContent)).toEqual(["PRESIDENT"]);
  });
  test("after a step-only change, a fade keeps the step that was lit", () => {
    const { container, rerender } = render(<RoundTracker step={RoundStep.ELECTION} text="Same" />);
    const lit = () => container.querySelector(".round-step.current")!.textContent;
    rerender(<RoundTracker step={RoundStep.LEGISLATIVE} text="Same" />);
    rerender(<RoundTracker step={RoundStep.EXECUTIVE} text="New" />);
    expect(lit()).toBe(RoundStep.LEGISLATIVE);
    act(() => { vi.advanceTimersByTime(250); });
    expect(lit()).toBe(RoundStep.EXECUTIVE);
  });
});
