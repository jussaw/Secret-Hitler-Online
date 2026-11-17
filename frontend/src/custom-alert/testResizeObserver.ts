import { act } from "@testing-library/react";
import { vi } from "vitest";

/**
 * For tests only: stubs the global ResizeObserver (jsdom has none) with one whose callbacks the test
 * runs. `watching(el)` is the live observers watching `el` (none once they disconnect), and
 * `resize(el)` calls each of their callbacks, as a change in `el`'s size would. The test restores
 * the global with `vi.unstubAllGlobals()`.
 */
export function stubResizeObserver() {
  const observers: { callback: () => void; observed: Element[] }[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: { callback: () => void; observed: Element[] };
      constructor(callback: () => void) {
        this.entry = { callback, observed: [] };
        observers.push(this.entry);
      }
      observe(el: Element) {
        this.entry.observed.push(el);
      }
      disconnect() {
        this.entry.observed = [];
      }
    }
  );
  const watching = (el: Element) => observers.filter((o) => o.observed.includes(el));
  return {
    watching,
    resize: (el: Element) => act(() => watching(el).forEach((o) => o.callback())),
  };
}
