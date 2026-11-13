import { useEffect, useRef, useState } from "react";
import { CONTACT_ERROR } from "../lobby/joinError";
import "./PlayInsteadPrompt.css";

type PlayInsteadPromptProps = {
  initialName: string;
  /** Resolves "" on success (the app closes the prompt), otherwise the error to show. */
  onContinue: (name: string) => Promise<string>;
  onCancel: () => void;
};

const MAX_NAME_LENGTH = 12;

export default function PlayInsteadPrompt({
  initialName,
  onContinue,
  onCancel,
}: PlayInsteadPromptProps) {
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

  const trimmed = name.trim();
  const canContinue = trimmed !== "" && !checking;

  const submit = async () => {
    if (trimmed === "" || pending.current) return;
    pending.current = true;
    setChecking(true);
    setError("");
    let result: string;
    try {
      result = await onContinue(trimmed);
    } catch {
      result = CONTACT_ERROR;
    } finally {
      pending.current = false;
    }
    if (!mounted.current) return;
    setChecking(false);
    setError(result);
  };

  return (
    <div>
      <h2 id="prompt-label" className="left-align">
        PLAY INSTEAD
      </h2>
      <p id="prompt-header" className="left-align">
        Choose the name you will play under. You pick a look next.
      </p>
      <label className="play-instead-field left-align">
        <span className="play-instead-field-label">Your name</span>
        <input
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>
      <p className="prompt-error left-align" role="alert">
        {error}
      </p>
      <button onClick={onCancel}>CANCEL</button>
      <button onClick={submit} disabled={!canContinue}>
        CONTINUE
      </button>
    </div>
  );
}
