import { Component } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ChancellorLegislativePrompt from "./ChancellorLegislativePrompt";
import { SERVER_TIMEOUT } from "../constants";
import { PolicyType, WSCommandType } from "../types";

const POLICIES = [PolicyType.LIBERAL, PolicyType.FASCIST];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error");
  vi.spyOn(console, "warn");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderPrompt(send = vi.fn()) {
  return render(
    <ChancellorLegislativePrompt
      policyOptions={POLICIES}
      sendWSCommand={send}
      fascistPolicies={5}
      showError={vi.fn()}
      enableVeto={true}
    />
  );
}

const button = (name: string) => screen.getByRole("button", { name });

function enact() {
  fireEvent.click(screen.getAllByAltText(/policy/)[0]);
  fireEvent.click(button("ENACT"));
}

function veto() {
  fireEvent.click(button("VETO"));
}

describe.each([
  ["ENACT", enact, { command: WSCommandType.REGISTER_CHANCELLOR_CHOICE, choice: 0 }],
  ["VETO", veto, { command: WSCommandType.REGISTER_CHANCELLOR_VETO }],
])("%s", (_name, press, command) => {
  test("sends the command and locks both buttons until the server timeout", () => {
    const send = vi.fn();
    renderPrompt(send);
    press();
    expect(send).toHaveBeenCalledWith(command);
    expect(button("ENACT")).toBeDisabled();
    expect(button("VETO")).toBeDisabled();
    act(() => vi.advanceTimersByTime(SERVER_TIMEOUT - 1));
    expect(button("VETO")).toBeDisabled();
    act(() => vi.advanceTimersByTime(1));
    expect(button("VETO")).toBeEnabled();
  });

  test("unmounting clears the lock timer, so nothing fires or warns afterwards", () => {
    const setState = vi.spyOn(Component.prototype, "setState");
    const { unmount } = renderPrompt();
    press();
    unmount();
    const callsAtUnmount = setState.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(SERVER_TIMEOUT);
    expect(setState).toHaveBeenCalledTimes(callsAtUnmount);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
