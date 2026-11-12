import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { sounds, type SoundManager } from "./SoundManager";
import "./SoundControl.css";

/**
 * The speaker button and volume slider at the right of every page's header. The button toggles
 * mute. The slider shows on hover or keyboard focus on desktop, and after a tap on phones, where it
 * stays until the next tap outside the control.
 */
export default function SoundControl({ manager = sounds }: { manager?: SoundManager }) {
  const { volume, muted } = useSyncExternalStore(manager.subscribe, manager.getSettings);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const percent = Math.round(volume * 100);
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div ref={root} className={"sound-control" + (open ? " open" : "")} role="group" aria-label="Sound">
      <button
        type="button"
        className="sound-toggle"
        aria-label="Mute sounds"
        aria-pressed={muted}
        onClick={() => manager.setMuted(!muted)}
        // Touch has no hover, so a tap also shows the slider.
        onPointerUp={(event) => event.pointerType !== "mouse" && setOpen(true)}
      >
        <Icon className="sound-icon" aria-hidden="true" focusable="false" />
      </button>
      <div className="sound-volume">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          aria-label="Volume"
          aria-valuetext={`${percent}%`}
          onChange={(event) => {
            manager.setVolume(Number(event.target.value) / 100);
            if (muted) manager.setMuted(false);
          }}
        />
      </div>
    </div>
  );
}
