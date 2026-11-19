/**
 * A measurement's value and `at`, when it began to look (overlayShare: when it asked for its first
 * screenshot), on the clock measureUntil's `now` reads.
 */
export type Timed = { value: number; at: number };

/**
 * Measures until `done` holds or the deadline, on `now`'s clock (`Date.now()` by default), has
 * passed, and returns the last value of a measurement that began by the deadline: the one to
 * judge. A measurement counts by its `at`, however long it then takes to return, so one still
 * running at the deadline is judged; `expect.poll` races each call against its timeout instead,
 * and fails on one still running, whatever it would have returned. No measurement starts after the
 * deadline, and one that began after it does not count. The first always counts, even a late one,
 * so there is a value to judge: a look that failed for want of one would fail for the machine's
 * slowness, not for what it measures.
 */
export async function measureUntil(
  measure: () => Promise<Timed>,
  done: (value: number) => boolean,
  deadline: number,
  now: () => number = Date.now
): Promise<number> {
  let { value } = await measure();
  while (!done(value) && now() <= deadline) {
    const next = await measure();
    if (next.at > deadline) break;
    value = next.value;
  }
  return value;
}
