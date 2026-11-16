import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabRow } from "./TabRow";

const LABELS = ["OVERVIEW", "ROLES & CARDS", "VOTES & POWERS", "RIVALS", "ENDINGS", "ACTIVITY", "RECORDS"];
const PATHS = ["/stats", "/stats/roles", "/stats/votes", "/stats/rivals", "/stats/endings", "/stats/activity", "/stats/records"];

const links = () => within(screen.getByRole("navigation", { name: "Stats sections" })).getAllByRole("link");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TabRow", () => {
  it("sevenTabsInOrder", () => {
    render(<TabRow current="overview" search="?cpu=1" />);
    expect(links().map((a) => a.textContent)).toEqual(LABELS);
    expect(links().map((a) => a.getAttribute("href"))).toEqual(PATHS.map((path) => `${path}?cpu=1`));
    for (const a of links()) expect(a).toHaveClass("button-link", "stats-tab");
  });

  it("noFilterNoSearch", () => {
    render(<TabRow current="overview" search="" />);
    expect(links().map((a) => a.getAttribute("href"))).toEqual(PATHS);
  });

  it("onlyTheCurrentTabIsMarked", () => {
    render(<TabRow current="endings" search="" />);
    const marked = links().filter((a) => a.getAttribute("aria-current") === "page");
    expect(marked.map((a) => a.textContent)).toEqual(["ENDINGS"]);
    expect(links().filter((a) => a.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("scrollsOnlyTheRowToTheCurrentTab", () => {
    // The row scrolls sideways on phones; the page itself keeps its scroll (back and forward too).
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    let rowScroll = 0;
    // A 300px row of 90px tabs, 100px apart.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.tagName === "NAV") return { left: 0, right: 300 } as DOMRect;
      const left = LABELS.indexOf(this.textContent ?? "") * 100 - rowScroll;
      return { left, right: left + 90 } as DOMRect;
    });
    const { rerender } = render(<TabRow current="overview" search="" />);
    const nav = screen.getByRole("navigation", { name: "Stats sections" });
    Object.defineProperty(nav, "scrollLeft", {
      get: () => rowScroll,
      set: (value: number) => (rowScroll = value),
    });
    rerender(<TabRow current="records" search="" />);
    expect(rowScroll, "RECORDS's right edge at the row's").toBe(390);
    rerender(<TabRow current="activity" search="" />);
    expect(rowScroll, "ACTIVITY already in view").toBe(390);
    rerender(<TabRow current="roles" search="" />);
    expect(rowScroll, "ROLES & CARDS's left edge at the row's").toBe(100);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    vi.unstubAllGlobals();
  });
});
