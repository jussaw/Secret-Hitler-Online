/**
 * A count with its noun for the stats' charts and lines, given both forms, so an irregular plural
 * reads right ("1 loss", "2 losses"); `format.ts`'s `plural` adds an "s".
 *
 * This module imports nothing, so the browser tests can use it.
 */

/** A count and its noun, one form for 1 and the other for any other count: `1 game`, `0 games`. */
export function countLabel(n: number, [one, many]: [string, string]): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The nouns of a count of games. */
export const GAME_NOUNS: [string, string] = ["game", "games"];
