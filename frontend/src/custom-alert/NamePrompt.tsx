import { useEffect, useRef, useState } from "react";
import { MAX_NAME_LENGTH } from "../constants";
import { CONTACT_ERROR } from "../lobby/joinError";
import { normalizeName, typedName } from "../lobby/normalizeName";
import "./NamePrompt.css";

type NamePromptProps = {
  title: string;
  initialName: string;
  confirmLabel: string;
  secondaryLabel: string;
  /** Resolves "" on success (the caller closes the prompt), otherwise the error to show. */
  onConfirm: (name: string) => Promise<string>;
  onSecondary: () => void;
};

export default function NamePrompt({
  title,
  initialName,
  confirmLabel,
  secondaryLabel,
  onConfirm,
  onSecondary,
}: NamePromptProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  // A ref, not state, so a click and an Enter in the same tick still count once.
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const normalized = normalizeName(name);
  const canContinue = normalized !== "" && !checking;

  const submit = async () => {
    if (normalized === "" || pending.current) return;
    pending.current = true;
    setChecking(true);
    setError("");
    let result: string;
    try {
      result = await onConfirm(normalized);
    } catch {
      result = CONTACT_ERROR;
    }
    // After a success the app is closing the prompt: stay busy so nothing submits twice.
    if (result === "") return;
    pending.current = false;
    if (!mounted.current) return;
    setChecking(false);
    setError(result);
  };

  return (
    <div>
      <h2 id="prompt-label" className="left-align">
        {title}
      </h2>
      <p id="prompt-header" className="left-align">
        Others see it in lobbies and games. Up to 12 characters.
      </p>
      <label className="name-prompt-field left-align">
        <span className="name-prompt-field-label">Your name</span>
        <input
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          onChange={(e) => {
            setName(typedName(e.target.value));
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>
      <p className="prompt-error left-align" role="alert">
        {error}
      </p>
      <button onClick={onSecondary}>{secondaryLabel}</button>
      <button onClick={submit} disabled={!canContinue}>
        {confirmLabel}
      </button>
    </div>
  );
}
