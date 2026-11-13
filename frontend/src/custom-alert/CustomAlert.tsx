import React, { useEffect, useState } from "react";
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
 * The prompt overlay: a dimmed background and a box holding `children`, over the page. It fades in
 * when `show` turns true and out when it turns false. Once the fade-out has had its time, the
 * overlay is `hidden` (display: none), so a closed prompt is never drawn and never takes a press,
 * even when the browser leaves its animations unfinished (Firefox could leave the empty box on
 * screen until a reload). An overlay that has never been shown starts hidden, with no fade-out.
 */
export default function CustomAlert({ show, children }: Props) {
  const [faded, setFaded] = useState(!show);

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
    <div id="alert" className={className} hidden={!show && faded}>
      <div id="alert-background" className={className} />
      <div id="alert-box" className={className}>
        {children}
      </div>
    </div>
  );
}
