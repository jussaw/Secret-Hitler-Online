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

  it("scrollsTheCurrentTabIntoView", () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
      scrolled.push(`${this.textContent} ${JSON.stringify(options)}`);
    };
    const { rerender } = render(<TabRow current="overview" search="" />);
    rerender(<TabRow current="records" search="" />);
    rerender(<TabRow current="records" search="?cpu=1" />);
    expect(scrolled).toEqual([
      'OVERVIEW {"block":"nearest","inline":"nearest"}',
      'RECORDS {"block":"nearest","inline":"nearest"}',
    ]);
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });
});
