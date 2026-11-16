/**
 * How many of a bar chart's labels fit under it, for `BarChart` and `StackedBarChart`.
 *
 * This module imports nothing, so the browser tests can use it.
 */

/** About how wide a character of the axis text is, in px, and the room kept between two labels. */
export const LABEL_CHAR_PX = 7;
export const LABEL_GAP_PX = 8;

/**
 * A label goes under every this many bars (1: every bar), so that `count` labels of up to
 * `longest` characters, side by side, fit across `room` px.
 */
export function labelStep(count: number, longest: number, room: number): number {
  if (count === 0 || room <= 0) return 1;
  return Math.max(1, Math.ceil((count * (LABEL_CHAR_PX * longest + LABEL_GAP_PX)) / room));
}
