/**
 * The stats pages' paths, which the entry (`main.tsx`) checks once to pick the stats or the game;
 * it is all the entry holds of the stats, which load as a chunk of their own. The tabs are under
 * `/stats`, GAMES and each game under `/games`, PLAYERS and each player under `/players`.
 */

/** The first segment of every stats page's path. */
const STATS_ROOTS = ["/stats", "/games", "/players"];

/**
 * Whether the page's path is a stats page's: a root, or a path under one, by whole segments, so
 * `/gamesx` is not, and neither is the players' socket, `/game`.
 */
export function isStatsPath(pathname: string): boolean {
  return STATS_ROOTS.some((root) => pathname === root || pathname.startsWith(root + "/"));
}

/** GAMES' and PLAYERS' old roots, from before they left `/stats`. */
const MOVED = /^\/stats(\/(?:games|players)(?:\/.*)?)$/;

/**
 * The new path of one of GAMES' or PLAYERS' old addresses (`/stats/games/<id>` is now
 * `/games/<id>`, `/stats/players/<n>` is `/players/<n>`), or null for any other path. Links to
 * the old ones are out there, from victory screens and shared addresses.
 */
export function movedStatsPath(pathname: string): string | null {
  const match = MOVED.exec(pathname);
  return match ? match[1] : null;
}

/**
 * Moves the page from an old address to its new one in place (`history.replaceState`, keeping
 * the query and the hash), before anything reads the address. Any other address stays.
 */
export function followMovedStatsPath(): void {
  const moved = movedStatsPath(window.location.pathname);
  if (moved === null) return;
  window.history.replaceState(window.history.state, "", moved + window.location.search + window.location.hash);
}
