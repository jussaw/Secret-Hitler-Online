import type { Rate } from "../counting";
import { formatPercent } from "../numbers";

/**
 * What RIVALS', ENDINGS' and the split tables' cells show: a rate as a whole percent, and
 * `NO_VALUE` for a value that is not there. A cell's sort figure is `numbers.ts`' `percentFigure`
 * of the same value (`rateFigure` of the same `Rate`): it and `formatPercent` both go through
 * `wholePercent`, so a column sorts by exactly what its cells say.
 */

/** What a cell says for a value that is not there. */
export const NO_VALUE = "—";

/** A share as a cell shows it: a whole percent (`formatPercent`), or `NO_VALUE` for none, as below
 *  its minimum sample. */
export function rateText(value: number | null): string {
  return value === null ? NO_VALUE : formatPercent(value);
}

/** A `Rate` as a cell shows it: its share's `rateText`, "—" below its minimum. */
export function rateCellText(rate: Rate): string {
  return rateText(rate.value);
}
