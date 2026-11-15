import { MAX_NAME_LENGTH } from "../constants";

/** Each run of whitespace as one space. */
function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * A name as it is saved: runs of whitespace collapsed to one space, then trimmed. The server
 * applies the same rule, so a name means the same on both sides.
 */
export function normalizeName(name: string): string {
  return collapseSpaces(name).trim();
}

/**
 * A name as it is being typed into the name prompt's field: runs of whitespace collapsed to one
 * space, none at the start, and at most MAX_NAME_LENGTH characters. Its end is left alone, since
 * a space there may be followed by more of the name; normalizeName trims it on the way out.
 */
export function typedName(text: string): string {
  return collapseSpaces(text).trimStart().slice(0, MAX_NAME_LENGTH);
}
