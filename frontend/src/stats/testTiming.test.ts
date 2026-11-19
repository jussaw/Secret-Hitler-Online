import { describe, expect, it } from "vitest";
import { hasThreadClock, timeOnThread } from "./testTiming";

/** Blocks this thread for `ms` without using its CPU, as a busy machine does to a test. */
function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Whether Node `version` ("v24.1.0") has `process.threadCpuUsage`: 22.19 and later, and 23.9 on. */
function versionHasThreadClock(version: string): boolean {
  const [major, minor] = version.slice(1).split(".").map(Number);
  return major > 23 || (major === 23 && minor >= 9) || (major === 22 && minor >= 19);
}

describe("timeOnThread", () => {
  it("reads the thread's CPU time on every Node that has it", () => {
    expect(versionHasThreadClock("v22.18.0")).toBe(false);
    expect(versionHasThreadClock("v22.19.0")).toBe(true);
    expect(versionHasThreadClock("v23.8.0")).toBe(false);
    expect(versionHasThreadClock("v23.9.0")).toBe(true);
    expect(versionHasThreadClock("v24.0.0")).toBe(true);
    // So the speed checks never fall back to the wall clock unnoticed, as a test's own `process`
    // lacking the method would make them.
    expect(hasThreadClock(), process.version).toBe(versionHasThreadClock(process.version));
  });

  it("returns what the block returns", () => {
    expect(timeOnThread(() => 42).result).toBe(42);
  });

  it.skipIf(!hasThreadClock())("leaves out the time the thread waits", () => {
    expect(timeOnThread(() => sleep(300)).ms).toBeLessThan(100);
  });

  it.skipIf(!hasThreadClock())("counts the thread's own work, never more than the wall clock", () => {
    let sum = 0;
    const start = performance.now();
    const { ms } = timeOnThread(() => {
      for (let i = 0; i < 5_000_000; i++) sum += i;
    });
    const wall = performance.now() - start;
    expect(sum).toBeGreaterThan(0);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(wall + 1);
  });

  it("falls back to the wall clock on a Node without process.threadCpuUsage", () => {
    const saved = Object.getOwnPropertyDescriptor(process, "threadCpuUsage");
    Object.defineProperty(process, "threadCpuUsage", { value: undefined, configurable: true, writable: true });
    try {
      expect(hasThreadClock()).toBe(false);
      expect(timeOnThread(() => sleep(100)).ms).toBeGreaterThanOrEqual(90);
    } finally {
      if (saved) Object.defineProperty(process, "threadCpuUsage", saved);
      else Reflect.deleteProperty(process, "threadCpuUsage");
    }
  });
});
