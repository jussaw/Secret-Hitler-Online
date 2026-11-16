import type { ReactNode } from "react";

/**
 * The game page's shared pieces of wording: `joined`, which runs a line's clauses or a list's
 * names together.
 */

/** The parts that are there (not null or false), each after `separator`; null when none are. */
export function joined(parts: ReactNode[], separator: string): ReactNode | null {
  const shown = parts.filter((part) => part !== null && part !== false);
  if (shown.length === 0) return null;
  return shown.map((part, i) => (
    <span key={i}>
      {i > 0 && separator}
      {part}
    </span>
  ));
}
