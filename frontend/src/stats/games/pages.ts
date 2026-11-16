import { plural } from "../format";

/**
 * GAMES' pages: how many there are, which ones the page links show, and the summary line over the
 * list. This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** The pages `matching` games fill at `per` a page: at least one, so an empty list is page 1 of 1. */
export function pageCount(matching: number, per: number): number {
  return Math.max(1, Math.ceil(matching / per));
}

/**
 * The page links, ascending: the first and last pages and the current one's neighbours, with
 * `null` for a gap of two or more pages and the page itself for a gap of one (a `…` that hides a
 * single page saves nothing).
 */
export function pageLinks(current: number, count: number): (number | null)[] {
  const shown = Array.from(new Set([1, current - 1, current, current + 1, count]))
    .filter((page) => page >= 1 && page <= count)
    .sort((a, b) => a - b);
  const links: (number | null)[] = [];
  shown.forEach((page, i) => {
    const before = i > 0 ? shown[i - 1] : page - 1;
    if (page - before === 2) links.push(page - 1);
    else if (page - before > 2) links.push(null);
    links.push(page);
  });
  return links;
}

/**
 * The line over the list: "No games recorded yet.", or "142 games recorded", then under a filter
 * "37 match" (or "none match"), then "showing 21–37" when anything is shown.
 */
export function gamesSummary(total: number, matching: number, first: number, last: number, filtered: boolean): string {
  if (total === 0) return "No games recorded yet.";
  const parts = [`${plural(total, "game")} recorded`];
  if (filtered) parts.push(matching === 0 ? "none match" : `${matching} ${matching === 1 ? "matches" : "match"}`);
  if (matching > 0) parts.push(`showing ${first}–${last}`);
  return parts.join(" · ");
}
