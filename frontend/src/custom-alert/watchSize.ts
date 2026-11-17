/**
 * Calls `measure` now, and again whenever one of `elements` changes size (a ResizeObserver, where
 * the browser has one; jsdom has none). Returns the function that stops watching, for an effect's
 * cleanup.
 */
export function watchSize(elements: Element[], measure: () => void): () => void {
  measure();
  if (typeof ResizeObserver === "undefined") return () => undefined;
  const observer = new ResizeObserver(measure);
  elements.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}
