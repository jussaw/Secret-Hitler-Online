import { Component } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import PresidentLegislativePrompt from "./PresidentLegislativePrompt";
import { SERVER_TIMEOUT } from "../constants";
import { PolicyType, WSCommandType } from "../types";

const POLICIES = [PolicyType.LIBERAL, PolicyType.FASCIST, PolicyType.FASCIST];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error");
  vi.spyOn(console, "warn");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function discard(send = vi.fn()) {
  const view = render(<PresidentLegislativePrompt policyOptions={POLICIES} sendWSCommand={send} />);
  fireEvent.click(screen.getAllByAltText(/policy/)[1]);
  fireEvent.click(screen.getByRole("button", { name: "DISCARD" }));
  return view;
}

test("DISCARD sends the choice and stays locked until the server timeout", () => {
  const send = vi.fn();
  discard(send);
  const button = screen.getByRole("button", { name: "DISCARD" });
  expect(send).toHaveBeenCalledWith({ command: WSCommandType.REGISTER_PRESIDENT_CHOICE, choice: 1 });
  expect(button).toBeDisabled();
  act(() => vi.advanceTimersByTime(SERVER_TIMEOUT - 1));
  expect(button).toBeDisabled();
  act(() => vi.advanceTimersByTime(1));
  expect(button).toBeEnabled();
});

test("unmounting clears the lock timer, so nothing fires or warns afterwards", () => {
  const setState = vi.spyOn(Component.prototype, "setState");
  const { unmount } = discard();
  unmount();
  const callsAtUnmount = setState.mock.calls.length;
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(SERVER_TIMEOUT);
  expect(setState).toHaveBeenCalledTimes(callsAtUnmount);
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
});
