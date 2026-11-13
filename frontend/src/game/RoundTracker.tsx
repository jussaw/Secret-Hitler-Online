import { Fragment, useEffect, useRef, useState } from "react";
import { ROUND_STEPS, RoundStep } from "./roundStep";
import "./RoundTracker.css";

const FADE_MS = 250;
const HIGHLIGHT = /\b(president|chancellor)\b/i;

/** Splits a status line so each whole word "president"/"chancellor" is wrapped in a highlight span. */
function highlightWords(text: string) {
  // With a capture group, split puts the matches at the odd indices.
  return text.split(new RegExp(HIGHLIGHT.source, "gi")).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="round-highlight">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function stateOf(index: number, current: number): "done" | "current" | "later" {
  if (current < 0) return "later";
  if (index < current) return "done";
  return index === current ? "current" : "later";
}

/** The four steps of a round with the current one lit, and the status line under them. */
export default function RoundTracker(props: { step: RoundStep | null; text: string }) {
  const { step, text } = props;
  const [shown, setShown] = useState({ text, step });
  const latestStep = useRef(step);
  latestStep.current = step;

  // When the text changes, the old line and its step stay (the line fades with `.fading`) for FADE_MS,
  // then both are replaced together. A step change with the same text applies at once.
  useEffect(() => {
    if (text === shown.text) return;
    const timer = setTimeout(() => setShown({ text, step: latestStep.current }), FADE_MS);
    return () => clearTimeout(timer);
  }, [text, shown.text]);

  const fading = shown.text !== text;
  const litStep = fading ? shown.step : step;
  const current = litStep === null ? -1 : ROUND_STEPS.indexOf(litStep);

  return (
    <section className="round-tracker" aria-label="Round">
      <ol className="round-steps">
        {ROUND_STEPS.map((name, i) => {
          const state = stateOf(i, current);
          return (
            <li
              key={name}
              className={`round-step ${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              {name}
            </li>
          );
        })}
      </ol>
      <p id="status-bar-text" className={`round-line${fading ? " fading" : ""}`}>
        {highlightWords(shown.text)}
      </p>
    </section>
  );
}
