import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StatsLink from "./StatsLink";

describe("StatsLink", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/stats");
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a plain click moves the page in place", () => {
    render(
      <StatsLink href="/games" className="here" aria-current="page">
        GAMES
      </StatsLink>
    );
    const link = screen.getByRole("link", { name: "GAMES" });
    expect(link).toHaveAttribute("href", "/games");
    expect(link).toHaveClass("here");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(fireEvent.click(link)).toBe(false); // cancelled
    expect(location.pathname).toBe("/games");
  });

  it("modified and middle clicks are the browser's", () => {
    render(<StatsLink href="/games">GAMES</StatsLink>);
    const link = screen.getByRole("link", { name: "GAMES" });
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(fireEvent.click(link, init), JSON.stringify(init)).toBe(true); // not cancelled
      expect(location.pathname).toBe("/stats");
    }
  });

  it("a link with a target is the browser's", () => {
    render(
      <StatsLink href="/games" target="_blank">
        GAMES
      </StatsLink>
    );
    expect(fireEvent.click(screen.getByRole("link", { name: "GAMES" }))).toBe(true);
    expect(location.pathname).toBe("/stats");
  });
});
