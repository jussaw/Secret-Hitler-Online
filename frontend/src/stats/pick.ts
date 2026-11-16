/**
 * Picking one item by a comparison, as the stats' picks do (a best duo, the fastest win): never by
 * the order the games came in, so a pick is the same for the games in any order.
 *
 * This module imports nothing, so the browser tests can use it.
 */

/** The first of `items` by `compare` (negative: its first argument comes first), the earliest of equals; null for none. */
export function firstBy<T>(items: readonly T[], compare: (x: T, y: T) => number): T | null {
  let found: T | null = null;
  for (const item of items) if (found === null || compare(item, found) < 0) found = item;
  return found;
}
