/**
 * The name a player joins under: runs of whitespace collapsed to one space, then trimmed. JOIN,
 * CREATE LOBBY and PLAY INSTEAD all use it, so a name means the same seat on every path.
 */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}
