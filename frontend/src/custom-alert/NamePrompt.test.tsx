import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import NamePrompt from "./NamePrompt";
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
const setup = (
  initialName = "Sam",
  onContinue = vi.fn().mockResolvedValue(""),
  labels: { title?: string; confirmLabel?: string; secondaryLabel?: string } = {}
) => {
  const onCancel = vi.fn();
  const utils = render(
    <NamePrompt
      title={labels.title ?? "PLAY INSTEAD"}
      initialName={initialName}
      confirmLabel={labels.confirmLabel ?? "CONTINUE"}
      secondaryLabel={labels.secondaryLabel ?? "CANCEL"}
      onConfirm={onContinue}
      onSecondary={onCancel}
    />
  );
  return { onContinue, onCancel, ...utils };
};

describe("NamePrompt", () => {
  test("fills in the last name", () => {
    setup("Sam");
    expect(field().value).toBe("Sam");
    expect(field().maxLength).toBe(12);
    expect(screen.getByRole("heading", { name: "PLAY INSTEAD" })).toBeInTheDocument();
    expect(
      screen.getByText("Others see it in lobbies and games. Up to 12 characters.")
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

  test("CONTINUE collapses runs of spaces, as the login form does", () => {
    const { onContinue } = setup("Sam");
    fireEvent.change(field(), { target: { value: " Sam   Lee " } });
    fireEvent.click(button("CONTINUE"));
    expect(onContinue).toHaveBeenCalledWith("Sam Lee");
  });

  test("Enter acts as CONTINUE", () => {
    const { onContinue } = setup("Sam");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onContinue).toHaveBeenCalledWith("Sam");
  });

  test("an error shows in the prompt", async () => {
    const message = "Another player already has that name.";
    // A slow check: the error line is on screen (empty) from the start, so wait for its text.
    setup("Sam", vi.fn(() => new Promise<string>((r) => setTimeout(() => r(message), 30))));
    fireEvent.click(button("CONTINUE"));
    const alert = await screen.findByText(message);
    expect(alert).toBe(screen.getByRole("alert"));
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
    expect(await screen.findByText(CONTACT_ERROR)).toBe(screen.getByRole("alert"));
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

  test("CONTINUE stays disabled after a successful check", async () => {
    const { onContinue } = setup("Sam");
    fireEvent.click(button("CONTINUE"));
    await act(async () => {});
    expect(button("CONTINUE")).toBeDisabled();
    fireEvent.click(button("CONTINUE"));
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("Enter during IME composition does not submit", () => {
    const { onContinue } = setup("Sam");
    fireEvent.keyDown(field(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(field(), { key: "Enter", keyCode: 229 });
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("takes its title and button labels from its props", () => {
    const { onCancel, onContinue } = setup("Sam", undefined, {
      title: "CHOOSE A NAME",
      confirmLabel: "CONTINUE",
      secondaryLabel: "SIGN OUT",
    });
    expect(screen.getByRole("heading", { name: "CHOOSE A NAME" })).toBeInTheDocument();
    fireEvent.click(button("SIGN OUT"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(button("CONTINUE"));
    expect(onContinue).toHaveBeenCalledWith("Sam");
  });

  test("SAVE and CANCEL labels", () => {
    const { onCancel, onContinue } = setup("Sam", undefined, {
      title: "CHANGE NAME",
      confirmLabel: "SAVE",
      secondaryLabel: "CANCEL",
    });
    expect(screen.getByRole("heading", { name: "CHANGE NAME" })).toBeInTheDocument();
    fireEvent.click(button("SAVE"));
    expect(onContinue).toHaveBeenCalledWith("Sam");
    fireEvent.click(button("CANCEL"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("an error stays under the field with the prompt open", async () => {
    setup("Sam", vi.fn().mockResolvedValue("Another player already has that name."));
    fireEvent.click(button("CONTINUE"));
    const alert = await screen.findByText("Another player already has that name.");
    expect(alert).toBe(screen.getByRole("alert"));
    expect(field()).toBeInTheDocument();
    expect(button("CONTINUE")).toBeEnabled();
  });

  test("CANCEL calls onCancel", () => {
    const { onCancel } = setup();
    fireEvent.click(button("CANCEL"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
