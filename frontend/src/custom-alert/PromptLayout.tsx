import React, { useLayoutEffect, useRef, useState } from "react";

type Props = {
  /** Added to the prompt's own `prompt` class. */
  className?: string;
  /** The title, centred at the top. */
  title: React.ReactNode;
  /** The button or buttons, at the foot. */
  buttons: React.ReactNode;
  /** The middle: everything between the title and the buttons. */
  children?: React.ReactNode;
};

/**
 * Every prompt's three parts, in the prompt overlay's box (CustomAlert): the title at the top, the
 * buttons at the foot, and the middle between them. The box is as tall as all three, up to the room
 * the window has; once it is that tall, only the middle scrolls (CustomAlert.css). While it does,
 * the prompt takes `prompt-scrolls`, which draws a line above the buttons. A ResizeObserver on the
 * middle and on what it holds keeps that up to date, as the window or the content changes size.
 */
export default function PromptLayout({ className, title, buttons, children }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useLayoutEffect(() => {
    const middle = body.current!;
    // scrollHeight and clientHeight are whole pixels, each rounded on its own.
    const measure = () => setScrolls(middle.scrollHeight - middle.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(middle);
    observer.observe(content.current!);
    return () => observer.disconnect();
  }, []);

  const classes = ["prompt", className, scrolls ? "prompt-scrolls" : undefined];
  return (
    <div className={classes.filter(Boolean).join(" ")}>
      <div className="prompt-title">{title}</div>
      <div className="prompt-body" ref={body}>
        <div className="prompt-content" ref={content}>
          {children}
        </div>
      </div>
      <div className="prompt-buttons">{buttons}</div>
    </div>
  );
}
