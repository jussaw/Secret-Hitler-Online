import { plural } from "./format";

/**
 * How the stats show numbers. Counts with their noun are `format.ts`'s `plural`.
 *
 * This module imports only `format.ts`, so the browser tests can use it.
 */

/** A share as a whole percent: 0.625 is "63%". */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * A signed number, rounded, such as a rating change: "+19", "−13" (with U+2212, a true minus),
 * and "0" for anything that rounds to zero, never "±0".
 */
export function formatSigned(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : `−${-rounded}`;
}

/** A rating as shown: rounded to a whole number. */
export function formatRating(value: number): string {
  return String(Math.round(value));
}

/** Whole days: "Today", "1 day", "3 days". */
export function formatDays(days: number): string {
  return days === 0 ? "Today" : plural(days, "day");
}
