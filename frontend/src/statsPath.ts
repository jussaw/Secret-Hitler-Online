/**
 * Whether the page's path is a stats page's: `/stats`, or a path under `/stats/`. The entry
 * (`main.tsx`) checks it once to pick the stats or the game; it is all the entry holds of the
 * stats, which load as a chunk of their own.
 */
export function isStatsPath(pathname: string): boolean {
  return pathname === "/stats" || pathname.startsWith("/stats/");
}
