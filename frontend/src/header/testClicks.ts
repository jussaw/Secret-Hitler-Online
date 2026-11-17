import { fireEvent } from "@testing-library/react";

/**
 * For tests: clicks `link` and says whether the page held the click back (a move in place, as
 * `StatsLink` makes). The browser's own navigation, which jsdom cannot do, is stopped once that is
 * read, so a plain link's click leaves no "Not implemented" line.
 */
export function heldBack(link: HTMLElement, init?: MouseEventInit): boolean {
  let prevented = false;
  const look = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", look);
  fireEvent.click(link, init);
  document.removeEventListener("click", look);
  return prevented;
}
