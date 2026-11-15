import { MAX_NAME_LENGTH } from "../constants";

/** Each run of whitespace as one space. */
function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * The name a player joins under: runs of whitespace collapsed to one space, then trimmed. JOIN,
 * CREATE LOBBY and PLAY INSTEAD all use it, so a name means the same seat on every path.
 */
export function normalizeName(name: string): string {
  return collapseSpaces(name).trim();
}

/**
 * A name as it is being typed into the login page's field: runs of whitespace collapsed to one
 * space, none at the start, and at most MAX_NAME_LENGTH characters. Its end is left alone, since
 * a space there may be followed by more of the name; normalizeName trims it on the way out.
 */
export function typedName(text: string): string {
  return collapseSpaces(text).trimStart().slice(0, MAX_NAME_LENGTH);
}
