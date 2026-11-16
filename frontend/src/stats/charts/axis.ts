/**
 * Axis ticks for the hand-drawn charts.
 *
 * This module imports nothing, so the browser tests can use it.
 */

/** The decimals a step needs: 0 for 1 and up, 1 for 0.1, and so on. */
function decimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/**
 * Round ticks covering `min` to `max`: a step of 1, 2 or 5 times a power of ten, the smallest at
 * least a `count`th of the range, from the step below `min` to the step above `max`. A single
 * value is widened by five each way first.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  let low = Math.min(min, max);
  let high = Math.max(min, max);
  if (low === high) {
    low -= 5;
    high += 5;
  }
  const raw = (high - low) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  let step = 10 * power;
  for (const multiple of [1, 2, 5]) {
    if (multiple * power >= raw * (1 - 1e-9)) {
      step = multiple * power;
      break;
    }
  }
  const places = decimals(step);
  const round = (value: number) => Number(value.toFixed(places));
  // A hair of slack, so 0.7 / 0.2 (3.4999…) still ends on the step above and not two above.
  const first = Math.floor(low / step + 1e-9) * step;
  const last = Math.ceil(high / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let i = 0; first + i * step <= last + step * 1e-9; i++) ticks.push(round(first + i * step));
  return ticks;
}
