import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copyText";

const clipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
const hadExecCommand = "execCommand" in document;
const originalExecCommand = document.execCommand;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

function makeField() {
  const field = document.createElement("input");
  field.value = "https://example.test/?lobby=ABCDE";
  field.select = vi.fn();
  field.setSelectionRange = vi.fn();
  return field;
}

afterEach(() => {
  if (clipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  } else {
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  }
  if (hadExecCommand) {
    document.execCommand = originalExecCommand;
  } else {
    delete (document as unknown as Record<string, unknown>).execCommand;
  }
});

describe("copyText", () => {
  it("uses the Clipboard API when it exists", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const execCommand = vi.fn(() => true);
    setClipboard({ writeText });
    document.execCommand = execCommand;
    expect(await copyText("hello", makeField())).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("selects the field and copies with execCommand without the Clipboard API", async () => {
    const execCommand = vi.fn(() => true);
    setClipboard(undefined);
    document.execCommand = execCommand;
    const field = makeField();
    expect(await copyText("hello", field)).toBe(true);
    expect(field.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back when writeText rejects", async () => {
    const execCommand = vi.fn(() => true);
    setClipboard({ writeText: vi.fn(() => Promise.reject(new Error("denied"))) });
    document.execCommand = execCommand;
    const field = makeField();
    expect(await copyText("hello", field)).toBe(true);
    expect(field.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back when the clipboard object has no writeText", async () => {
    const execCommand = vi.fn(() => true);
    setClipboard({});
    document.execCommand = execCommand;
    const field = makeField();
    expect(await copyText("hello", field)).toBe(true);
    expect(field.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when there is no field to fall back on", async () => {
    const execCommand = vi.fn(() => true);
    setClipboard(undefined);
    document.execCommand = execCommand;
    expect(await copyText("hello", null)).toBe(false);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("returns false when execCommand fails or throws", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => false);
    expect(await copyText("hello", makeField())).toBe(false);
    document.execCommand = vi.fn(() => {
      throw new Error("nope");
    });
    expect(await copyText("hello", makeField())).toBe(false);
  });
});
