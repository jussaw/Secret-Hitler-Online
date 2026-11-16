import { formatPercent } from "../numbers";

/** What RIVALS' and ENDINGS' cells say for a value that is not there. */
export const NO_VALUE = "—";

/** A rate as a cell shows it: a whole percent, or `NO_VALUE` below its minimum sample. */
export function rateText(value: number | null): string {
  return value === null ? NO_VALUE : formatPercent(value);
}
