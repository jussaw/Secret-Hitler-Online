import type { ReactNode } from "react";
import "./ScrollRegion.css";

/**
 * A box that scrolls sideways inside its card when what it holds is wider (a split table, a
 * matrix), so the page itself never does. It is a region of its own, focusable so the keyboard can
 * scroll it: name it "<card title> table", since the card is already a region named by its title.
 */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    // Focusable, so a keyboard can scroll a box that has no control in it.
    <div className="scroll-region" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export default ScrollRegion;
