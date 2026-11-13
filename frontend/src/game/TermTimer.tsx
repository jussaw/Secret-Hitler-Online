import { useEffect, useId, useState } from "react";
import { Pause, Play, Timer, type LucideIcon } from "lucide-react";
import type { TermTimerState } from "../types";
import "./TermTimer.css";

/** How often a running countdown redraws, in ms: often enough that a second never shows late. */
export const TICK_MS = 200;

/** Whole seconds left, rounded up: 10 for the first second, 0 only when the time is up. */
export function secondsLeft(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** A packet's countdown, the page time it arrived at, and the page time at the last redraw. */
type Clock = { timer: TermTimerState; arrived: number; now: number };

/** The clock for a packet's countdown, started when the packet arrived. */
function clockFor(timer: TermTimerState): Clock {
  const now = performance.now();
  return { timer, arrived: now, now };
}

/**
 * The time left on the countdown, in ms. The server sends the time left with every packet, and
 * the page counts down from it while it runs, so every viewer shows the same time whatever their
 * clock says.
 */
function useRemaining(timer: TermTimerState): number {
  const [clock, setClock] = useState(() => clockFor(timer));
  // Each packet brings a new countdown object: restart the local count from its time.
  if (clock.timer !== timer) setClock(clockFor(timer));

  useEffect(() => {
    if (timer.paused) return;
    const tick = () =>
      setClock((c) => (c.timer === timer ? { ...c, now: performance.now() } : c));
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [timer]);

  if (timer.paused) return timer.remainingMs;
  // The time passed is taken from the server's time, not the page time from a deadline: page
  // times have fractions, so (arrived + 7000) - arrived can come out a hair over 7000, which
  // shows as 8 seconds. Until time passes, this is exactly the server's time.
  return Math.max(0, timer.remainingMs - (clock.now - clock.arrived));
}

export type TermTimerProps = {
  timer: TermTimerState;
  /** The president pauses and resumes it with this chip; everyone else only sees it. */
  canPause: boolean;
  onPause: () => void;
  onResume: () => void;
};

/**
 * The END TERM countdown beside END TERM: an icon and the seconds left. For the president it is
 * a button whose icon is what it does (pause, or play to resume); for everyone else, spectators
 * included, the icon is the countdown's state (a timer, or pause).
 */
export default function TermTimer({ timer, canPause, onPause, onResume }: TermTimerProps) {
  const seconds = secondsLeft(useRemaining(timer));
  const paused = timer.paused;
  const className = "term-timer" + (paused ? " paused" : "");
  // The time left is the chip's description, read with its name, while the name stays put: a
  // name that changed every second could be announced every second.
  const describedBy = useId();
  const description = (
    <span id={describedBy} hidden>
      {seconds === 1 ? "1 second left" : `${seconds} seconds left`}
    </span>
  );
  const contents = (Icon: LucideIcon) => (
    <>
      <Icon
        className="term-timer-icon"
        // Pause and play are filled, as on a media player: outlined, pause reads as "00".
        fill={Icon === Timer ? "none" : "currentColor"}
        aria-hidden="true"
        focusable="false"
      />
      <span className="term-timer-seconds">{seconds}</span>
      {description}
    </>
  );

  if (canPause) {
    const label = paused ? "Resume the countdown" : "Pause the countdown";
    return (
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-describedby={describedBy}
        title={label}
        onClick={paused ? onResume : onPause}
      >
        {contents(paused ? Play : Pause)}
      </button>
    );
  }
  const label = paused ? "The countdown to the end of the term is paused" : "Time left in the term";
  return (
    <div className={className} role="timer" aria-label={label} aria-describedby={describedBy} title={label}>
      {contents(paused ? Pause : Timer)}
    </div>
  );
}
