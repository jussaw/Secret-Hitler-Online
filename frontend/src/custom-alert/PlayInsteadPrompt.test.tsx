import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import PlayInsteadPrompt from "./PlayInsteadPrompt";
import { CONTACT_ERROR } from "../lobby/joinError";

beforeEach(() => {
  vi.spyOn(console, "error");
  vi.spyOn(console, "warn");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const field = () => screen.getByLabelText("Your name") as HTMLInputElement;
const setup = (initialName = "Sam", onContinue = vi.fn().mockResolvedValue("")) => {
  const onCancel = vi.fn();
  const utils = render(
    <PlayInsteadPrompt initialName={initialName} onContinue={onContinue} onCancel={onCancel} />
  );
  return { onContinue, onCancel, ...utils };
};

describe("PlayInsteadPrompt", () => {
  test("fills in the last name", () => {
    setup("Sam");
    expect(field().value).toBe("Sam");
    expect(field().maxLength).toBe(12);
    expect(screen.getByRole("heading", { name: "PLAY INSTEAD" })).toBeInTheDocument();
    expect(
      screen.getByText("Choose the name you will play under. You pick a look next.")
    ).toBeInTheDocument();
    expect(button("CANCEL")).toBeEnabled();
    expect(button("CONTINUE")).toBeEnabled();
  });

  test.each(["", "   "])("CONTINUE needs a name (%j)", (value) => {
    const { onContinue } = setup("Sam");
    fireEvent.change(field(), { target: { value } });
    expect(button("CONTINUE")).toBeDisabled();
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onContinue).not.toHaveBeenCalled();
  });

  test("CONTINUE sends the trimmed name once", async () => {
    let resolve: (value: string) => void = () => {};
    const onContinue = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    setup("Sam", onContinue);
    fireEvent.change(field(), { target: { value: "  Sam " } });
    fireEvent.click(button("CONTINUE"));
    fireEvent.click(button("CONTINUE"));
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith("Sam");
    expect(button("CONTINUE")).toBeDisabled();
    await act(async () => resolve(""));
    expect(console.error).not.toHaveBeenCalled();
  });

  test("Enter acts as CONTINUE", () => {
    const { onContinue } = setup("Sam");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onContinue).toHaveBeenCalledWith("Sam");
  });

  test("an error shows in the prompt", async () => {
    const message = "There is already a user with the name 'Sam' in the lobby.";
    setup("Sam", vi.fn().mockResolvedValue(message));
    fireEvent.click(button("CONTINUE"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveClass("prompt-error");
    expect(button("CONTINUE")).toBeEnabled();
  });

  test("a rejected check shows the contact error and CONTINUE works again", async () => {
    const onContinue = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("");
    setup("Sam", onContinue);
    fireEvent.click(button("CONTINUE"));
    expect(await screen.findByRole("alert")).toHaveTextContent(CONTACT_ERROR);
    expect(button("CONTINUE")).toBeEnabled();
    fireEvent.click(button("CONTINUE"));
    expect(onContinue).toHaveBeenCalledTimes(2);
  });

  test("editing the name clears the error", async () => {
    setup("Sam", vi.fn().mockResolvedValue("Taken."));
    fireEvent.click(button("CONTINUE"));
    await screen.findByText("Taken.");
    fireEvent.change(field(), { target: { value: "Sam2" } });
    expect(screen.queryByText("Taken.")).toBeNull();
  });

  test("unmounting while the check runs sets no state", async () => {
    let resolve: (value: string) => void = () => {};
    const onContinue = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const { unmount } = setup("Sam", onContinue);
    fireEvent.click(button("CONTINUE"));
    unmount();
    await act(async () => resolve("late error"));
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  test("CANCEL calls onCancel", () => {
    const { onCancel } = setup();
    fireEvent.click(button("CANCEL"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
