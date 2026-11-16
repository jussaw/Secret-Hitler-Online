import type { ReactNode } from "react";
import { roleClass } from "../PlayerName";
import type { Card, Role } from "../record";

/**
 * The game page's shared pieces of wording: each role's and policy's word, a role's word in its
 * colour, and `joined`, which runs a line's clauses or a list's names together.
 */

/** Each role's word; a side's is its role's. */
export const ROLE_WORDS: Record<Role, string> = { LIBERAL: "Liberal", FASCIST: "Fascist", HITLER: "Hitler" };

/** Each policy's word. */
export const CARD_WORDS: Record<Card, string> = { L: "Liberal", F: "Fascist" };

/** A role's or side's word in its colour (`roleClass`). */
export function RoleWord({ role }: { role: Role }): JSX.Element {
  return <span className={roleClass(role)}>{ROLE_WORDS[role]}</span>;
}

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
