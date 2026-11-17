import React, { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import "./CustomAlert.css";

/**
 * How long a closing prompt fades out: the length of the disappear animations in CustomAlert.css.
 * App waits as long before it empties the box and moves its animation queue on.
 */
export const ALERT_FADE_OUT_MS = 1000;

type Props = {
  show: boolean;
  children?: React.ReactNode;
};

/**
 * The prompt overlay: the page dimmed and blurred, and over it a card holding `children`, a prompt
 * drawn with PromptLayout. The card is centred between the page's header and the bottom of the
 * window (CustomAlert.css). It fades in when `show` turns true and out when it turns false. Once
 * the fade-out has had its time, the overlay is `hidden` (display: none), so a closed prompt is
 * never drawn and never takes a press, even when the browser leaves its animations unfinished
 * (Firefox could leave the empty box on screen until a reload). An overlay that has never been
 * shown starts hidden, with no fade-out.
 */
export default function CustomAlert({ show, children }: Props) {
  const [faded, setFaded] = useState(!show);
  const overlay = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useHeaderRoom(overlay);
  const heldHeight = useHeldHeight(box, show);

  useEffect(() => {
    if (show) {
      setFaded(false);
      return;
    }
    const timer = setTimeout(() => setFaded(true), ALERT_FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [show]);

  const className = show ? "appear-custom-alert" : "disappear-custom-alert";
  return (
    <div id="alert" ref={overlay} className={className} hidden={!show && faded}>
      <div id="alert-background" className={className} />
      <div
        id="alert-box"
        ref={box}
        className={className}
        style={heldHeight === null ? undefined : { minHeight: `${heldHeight}px` }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Keeps `--alert-header`, on the overlay, the height of the page's header, which the box keeps
 * clear of. The header is the first one beside the overlay (App draws the page there). It is looked
 * for again after every render, since the page under an open prompt can change (CHOOSE A NAME stays
 * open from the login page to the lobby), and measured again whenever its size changes.
 */
function useHeaderRoom(overlay: RefObject<HTMLDivElement>): void {
  const [header, setHeader] = useState<Element | null>(null);

  useLayoutEffect(() => {
    const found = overlay.current?.parentElement?.querySelector("header") ?? null;
    if (found !== header) setHeader(found);
  });

  useLayoutEffect(() => {
    const el = overlay.current;
    if (!el) return;
    const measure = () => {
      const height = header ? header.getBoundingClientRect().height : 0;
      el.style.setProperty("--alert-header", `${height}px`);
    };
    measure();
    if (!header || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [overlay, header]);
}

/**
 * Null while the prompt is shown; once it is closed, the height its box last had while shown, until
 * it is shown again. The box is as tall as what it holds, and a prompt the server's OK closes is
 * emptied at once (App), so the box keeps that height while it fades out rather than shrinking to
 * nothing. A ResizeObserver keeps the height current as images load or the window changes.
 */
function useHeldHeight(box: RefObject<HTMLDivElement>, show: boolean): number | null {
  const shownHeight = useRef(0);
  const [held, setHeld] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!show || !el) return;
    const measure = () => {
      shownHeight.current = el.getBoundingClientRect().height;
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [box, show]);

  // Before the closed box is painted: its content is gone already, its last height is not.
  useLayoutEffect(() => {
    setHeld(show || shownHeight.current === 0 ? null : shownHeight.current);
  }, [show]);

  return held;
}
