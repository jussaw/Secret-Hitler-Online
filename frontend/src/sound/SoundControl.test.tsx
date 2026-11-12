import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import SoundControl from "./SoundControl";
import { SOUND_NAMES, SoundManager, type Clip, type SoundName } from "./SoundManager";

function manager() {
  const store = new Map<string, string>();
  return new SoundManager({
    clips: Object.fromEntries(SOUND_NAMES.map((name) => [name, { ogg: "", mp3: "" }])) as Record<
      SoundName,
      Clip
    >,
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) },
    fetchClip: async () => new ArrayBuffer(0),
    canPlayOgg: () => true,
    target: new EventTarget(),
  });
}

function renderControl() {
  const sounds = manager();
  const { container } = render(<SoundControl manager={sounds} />);
  return {
    sounds,
    control: container.querySelector(".sound-control")!,
    button: screen.getByRole("button", { name: "Mute sounds" }),
    slider: screen.getByRole("slider", { name: "Volume" }),
    icon: () => container.querySelector("svg")!.getAttribute("class"),
  };
}

test("shows the speaker unpressed at 70%", () => {
  const { button, slider, icon } = renderControl();
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(slider).toHaveValue("70");
  expect(slider).toHaveAttribute("aria-valuetext", "70%");
  expect(icon()).toContain("lucide-volume-2");
});

test("the button toggles mute", () => {
  const { sounds, button, icon } = renderControl();
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(sounds.getSettings().muted).toBe(true);
  expect(icon()).toContain("lucide-volume-x");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(sounds.getSettings().muted).toBe(false);
});

test("the slider sets the volume and unmutes", () => {
  const { sounds, slider, icon } = renderControl();
  act(() => sounds.setMuted(true));
  fireEvent.change(slider, { target: { value: "40" } });
  expect(sounds.getSettings()).toEqual({ volume: 0.4, muted: false });
  expect(slider).toHaveAttribute("aria-valuetext", "40%");
  expect(icon()).toContain("lucide-volume-1");
  fireEvent.change(slider, { target: { value: "0" } });
  expect(icon()).toContain("lucide-volume-x");
  fireEvent.change(slider, { target: { value: "70" } });
  expect(icon()).toContain("lucide-volume-2");
});

test("the button brings the sound back after the slider was dragged to 0", () => {
  const { sounds, button, slider, icon } = renderControl();
  fireEvent.change(slider, { target: { value: "0" } });
  expect(button).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(button);
  expect(sounds.getSettings()).toEqual({ volume: 0.7, muted: false });
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(icon()).toContain("lucide-volume-2");
});

test("follows changes made elsewhere", () => {
  const { sounds, button } = renderControl();
  act(() => sounds.setMuted(true));
  expect(button).toHaveAttribute("aria-pressed", "true");
});

test("a tap opens the slider and a tap outside closes it", () => {
  const { control, button } = renderControl();
  fireEvent.pointerUp(button, { pointerType: "mouse" });
  expect(control).not.toHaveClass("open");
  fireEvent.pointerUp(button, { pointerType: "touch" });
  expect(control).toHaveClass("open");
  fireEvent.pointerDown(control.querySelector("input")!, { pointerType: "touch" });
  expect(control).toHaveClass("open");
  fireEvent.pointerDown(document.body, { pointerType: "touch" });
  expect(control).not.toHaveClass("open");
});
