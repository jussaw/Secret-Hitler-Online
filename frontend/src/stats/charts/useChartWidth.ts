import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * The width of `ref`'s box in whole CSS px, measured before the first paint and again whenever it
 * changes (a `ResizeObserver`, where the browser has one). `fallback`, the narrowest phone, while
 * the box has no width yet (as in jsdom).
 */
export function useChartWidth(ref: RefObject<HTMLElement>, fallback = 320): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width > 0 ? width : fallback;
}
