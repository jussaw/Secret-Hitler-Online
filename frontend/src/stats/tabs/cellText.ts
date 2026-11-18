import { percentFigure } from "../numbers";

/**
 * What RIVALS', ENDINGS' and the split tables' cells show: a rate as a whole percent, and
 * `NO_VALUE` for a value that is not there. A cell's sort figure is `numbers.ts`' `percentFigure`
 * of the same value, which `rateText` shows, so a column sorts by exactly what its cells say.
 */

/** What a cell says for a value that is not there. */
export const NO_VALUE = "—";

/** A rate as a cell shows it: a whole percent (`percentFigure`), or `NO_VALUE` below its minimum
 *  sample. */
export function rateText(value: number | null): string {
  const figure = percentFigure(value);
  return figure === null ? NO_VALUE : `${figure}%`;
}
