import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SiteHeader, { type HeaderLinkProps, type SitePlace } from "./SiteHeader";

const nav = () => within(screen.getByRole("navigation", { name: "Stats pages" }));
const marked = () =>
  nav()
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current") === "page")
    .map((a) => a.textContent);

/**
 * Clicks `link` and says whether the page held the click back (a move in place). The browser's
 * own navigation, which jsdom cannot do, is stopped once that is read.
 */
function heldBack(link: HTMLElement, init?: MouseEventInit): boolean {
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

/** A link component that marks what it draws, as the stats' StatsLink stands in for <a>. */
function DrawnLink(props: HeaderLinkProps) {
  return <a data-drawn="yes" {...props} />;
}

describe("SiteHeader", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("links to the four places", () => {
    render(<SiteHeader current={null} />);
    expect(screen.getByRole("banner")).toHaveTextContent("SECRET-HITLER");
    expect(nav().getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["STATS", "/stats"],
      ["GAMES", "/stats/games"],
      ["PLAYERS", "/stats/players"],
      ["PLAY", "/"],
    ]);
  });

  it("marks the place given", () => {
    const places: [SitePlace, string][] = [
      ["stats", "STATS"],
      ["games", "GAMES"],
      ["players", "PLAYERS"],
      ["play", "PLAY"],
    ];
    for (const [place, label] of places) {
      render(<SiteHeader current={place} />);
      expect(marked(), place).toEqual([label]);
      document.body.innerHTML = "";
    }
  });

  it("marks nothing without a place", () => {
    render(<SiteHeader current={null} />);
    expect(marked()).toEqual([]);
  });

  it("draws its in-page links with the link given", () => {
    render(<SiteHeader current="games" link={DrawnLink} />);
    const drawn = nav()
      .getAllByRole("link")
      .filter((a) => a.getAttribute("data-drawn") === "yes");
    expect(drawn.map((a) => [a.textContent, a.getAttribute("href"), a.className])).toEqual([
      ["STATS", "/stats", "site-nav-link"],
      ["GAMES", "/stats/games", "site-nav-link"],
      ["PLAYERS", "/stats/players", "site-nav-link"],
    ]);
    expect(nav().getByRole("link", { name: "GAMES" })).toHaveAttribute("aria-current", "page");
  });

  it("PLAY is always a plain link", () => {
    render(<SiteHeader current="play" link={DrawnLink} />);
    const play = nav().getByRole("link", { name: "PLAY" });
    expect(play).not.toHaveAttribute("data-drawn");
    expect(play).toHaveClass("site-nav-link");
    document.body.innerHTML = "";

    // The default links are the browser's own: no click is held back (a modified click opens a tab).
    render(<SiteHeader current="play" />);
    for (const link of nav().getAllByRole("link")) {
      expect(heldBack(link), link.textContent!).toBe(false);
      expect(heldBack(link, { ctrlKey: true }), link.textContent!).toBe(false);
    }
  });
});
