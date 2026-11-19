/**
 * Test support for the stats' speed checks (#101; never imported by the page). The spec asks for
 * the stats of 1,000 games in well under a second, which the checks hold to under 1,000 ms. The
 * wall clock also counts the time a busy machine keeps a test's worker waiting for a core, so the
 * checks time the work by the CPU time of the thread that runs it, which a busy machine raises by
 * tens of milliseconds, not hundreds.
 */

/** Whether this Node has `process.threadCpuUsage`, which came in 22.19 and 23.9. */
export function hasThreadClock(): boolean {
  return typeof process.threadCpuUsage === "function";
}

/**
 * What `run` returns, and the milliseconds of this thread's CPU time it took; on a Node without
 * `process.threadCpuUsage` (`hasThreadClock`), the wall clock's.
 */
export function timeOnThread<T>(run: () => T): { result: T; ms: number } {
  if (!hasThreadClock()) {
    const start = performance.now();
    const result = run();
    return { result, ms: performance.now() - start };
  }
  const start = process.threadCpuUsage();
  const result = run();
  const used = process.threadCpuUsage(start); // microseconds
  return { result, ms: (used.user + used.system) / 1000 };
}
