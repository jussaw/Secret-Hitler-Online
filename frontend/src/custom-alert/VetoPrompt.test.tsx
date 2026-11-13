import { Component } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import VetoPrompt from "./VetoPrompt";
import { SERVER_TIMEOUT } from "../constants";
import { WSCommandType } from "../types";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error");
  vi.spyOn(console, "warn");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });

describe.each([
  ["ACCEPT", true],
  ["REJECT", false],
])("%s", (name, accepted) => {
  test("sends the answer and locks both buttons until the server timeout", () => {
    const send = vi.fn();
    render(<VetoPrompt sendWSCommand={send} electionTracker={0} />);
    fireEvent.click(button(name));
    expect(send).toHaveBeenCalledWith({ command: WSCommandType.REGISTER_PRESIDENT_VETO, veto: accepted });
    expect(button("ACCEPT")).toBeDisabled();
    expect(button("REJECT")).toBeDisabled();
    act(() => vi.advanceTimersByTime(SERVER_TIMEOUT - 1));
    expect(button(name)).toBeDisabled();
    act(() => vi.advanceTimersByTime(1));
    expect(button("ACCEPT")).toBeEnabled();
    expect(button("REJECT")).toBeEnabled();
  });

  test("unmounting clears the lock timer, so nothing fires or warns afterwards", () => {
    const setState = vi.spyOn(Component.prototype, "setState");
    const { unmount } = render(<VetoPrompt sendWSCommand={vi.fn()} electionTracker={0} />);
    fireEvent.click(button(name));
    unmount();
    const callsAtUnmount = setState.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(SERVER_TIMEOUT);
    expect(setState).toHaveBeenCalledTimes(callsAtUnmount);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
