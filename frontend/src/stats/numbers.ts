import type { Rate } from "./counting";
import { plural } from "./format";

/**
 * How the stats show numbers, and the figures a sortable table's columns sort by (#109), each
 * beside the format it mirrors, so a column sorts by exactly what its cells show. Counts with their
 * noun are `format.ts`'s `plural`.
 *
 * This module imports only `format.ts` (and `counting.ts`'s `Rate`, a type), so the browser tests
 * can use it.
 */

/** A share as a whole percent: 0.625 is 63. What a percent column sorts by and `formatPercent` shows. */
export function wholePercent(value: number): number {
  return Math.round(value * 100);
}

/** A share as a whole percent: 0.625 is "63%". */
export function formatPercent(value: number): string {
  return `${wholePercent(value)}%`;
}

/** A share that may be missing as its whole percent (`wholePercent`), null for none: what a cell
 *  that shows a share or "—" (`tabs/cellText.ts`' `rateText`) sorts by. */
export function percentFigure(value: number | null): number | null {
  return value === null ? null : wholePercent(value);
}

/** A count's sort figure (a ranked card's `sortValue`): the count itself, as its cell shows it. */
export function countFigure(count: number): number {
  return count;
}

/** A rate's sort figure (a ranked card's `sortValue`): the whole percent its cell shows
 *  (`formatPercent`), null for a rate with no value, shown "—". */
export function rateFigure(rate: Rate): number | null {
  return percentFigure(rate.value);
}

/**
 * A signed number rounded to a whole number, such as a rating change: 19.42 is 19, −12.58 is −13,
 * and anything that rounds to zero is 0, never −0. What a column of changes sorts by and
 * `formatSigned` shows.
 */
export function wholeSigned(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

/**
 * A signed number, rounded, such as a rating change: "+19", "−13" (with U+2212, a true minus),
 * and "0" for anything that rounds to zero, never "±0".
 */
export function formatSigned(value: number): string {
  const rounded = wholeSigned(value);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : `−${-rounded}`;
}

/** A rating rounded to a whole number: what an Elo column sorts by and `formatRating` shows. */
export function wholeRating(value: number): number {
  return Math.round(value);
}

/** A rating as shown: rounded to a whole number. */
export function formatRating(value: number): string {
  return String(wholeRating(value));
}

/** Whole days: "Today", "1 day", "3 days". */
export function formatDays(days: number): string {
  return days === 0 ? "Today" : plural(days, "day");
}
