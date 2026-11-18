import { fireEvent } from "@testing-library/react";

/**
 * Test support for the tabs' split tables (never imported by the page): the check that every "—"
 * sorts below every figure, whichever head sorts the table and whichever way (#109, Review Focus
 * 1), so a caller's cell whose `value` does not match its text shows up as a misplaced dash.
 */

/** A split table cell's text, without its count. */
function textOf(cell: Element | undefined): string {
  return cell?.querySelector(".split-text")?.textContent ?? "";
}

/**
 * Presses every head but Player of every `table.split-table` in `container` twice (its first
 * direction, then the other). After each press, each "—" in that column above a figure is a
 * `misplaced` line, "<region> <head> <direction>: row N" (the body row, from 1); `checked` counts
 * the dashes met, so a caller can tell the check saw some.
 */
export function dashesBeforeFigures(container: HTMLElement): { checked: number; misplaced: string[] } {
  let checked = 0;
  const misplaced: string[] = [];
  for (const table of Array.from(container.querySelectorAll<HTMLTableElement>("table.split-table"))) {
    const region = table.closest("[role=region]")?.getAttribute("aria-label") ?? "split table";
    const heads = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
    heads.forEach((head, column) => {
      if (column === 0) return; // Player
      for (let press = 0; press < 2; press++) {
        fireEvent.click(head.querySelector("button")!);
        const texts = Array.from(table.querySelectorAll("tbody tr"), (row) => textOf(row.children[column]));
        const lastFigure = texts.reduce((last, text, i) => (text === "—" ? last : i), -1);
        texts.forEach((text, i) => {
          if (text !== "—") return;
          checked++;
          if (i < lastFigure) misplaced.push(`${region} ${head.textContent} ${head.getAttribute("aria-sort")}: row ${i + 1}`);
        });
      }
    });
  }
  return { checked, misplaced };
}
