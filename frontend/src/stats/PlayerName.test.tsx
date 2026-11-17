import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseFilter } from "./counting";
import PlayerName, { playerHref, roleClass } from "./PlayerName";

describe("PlayerName", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/stats/roles");
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("colours a name by role", () => {
    const { container } = render(
      <>
        <PlayerName player={1} name="Ann" role="LIBERAL" />
        <PlayerName player={2} name="Bo" role="FASCIST" />
        <PlayerName player={3} name="Cy" role="HITLER" />
        <PlayerName player={4} name="Di" />
        <PlayerName player={null} name="Bot 1" role="FASCIST" />
      </>
    );
    const names = Array.from(container.querySelectorAll(".player-name"));
    expect(names.map((n) => n.textContent)).toEqual(["Ann", "Bo", "Cy", "Di", "Bot 1"]);
    expect(names.map((n) => n.className)).toEqual([
      "player-name player-link stats-liberal",
      "player-name player-link stats-fascist",
      "player-name player-link stats-hitler",
      "player-name player-link",
      "player-name stats-fascist",
    ]);
  });

  it("gives each role's class, for a side's word too", () => {
    expect([roleClass("LIBERAL"), roleClass("FASCIST"), roleClass("HITLER")]).toEqual([
      "stats-liberal",
      "stats-fascist",
      "stats-hitler",
    ]);
  });

  it("linksAPlayerToTheirPage", () => {
    render(<PlayerName player={3} name="Cy" role="LIBERAL" />);
    const link = screen.getByRole("link", { name: "Cy" });
    expect(link).toHaveAttribute("href", "/players/3");
    expect(link).toHaveClass("player-link");
    expect(link).toHaveAttribute("data-player", "3");
  });

  it("aCpuSeatIsPlainText", () => {
    const { container } = render(<PlayerName player={null} name="Bot 1" role="LIBERAL" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector(".player-name")).toHaveTextContent("Bot 1");
    expect(container.querySelector(".player-name")).not.toHaveAttribute("data-player");
  });

  it("linkFalseIsPlainText", () => {
    const { container } = render(<PlayerName player={3} name="Cy" link={false} />);
    expect(container.querySelector("a")).toBeNull();
    const name = container.querySelector("span.player-name")!;
    expect(name).toHaveTextContent("Cy");
    expect(name).toHaveAttribute("data-player", "3");
    expect(name).not.toHaveClass("player-link");
  });

  it("carriesTheStatsFilter", () => {
    for (const path of ["/stats/roles", "/players", "/players/4", "/stats"]) {
      history.replaceState(null, "", `${path}?players=1,2&cpu=1`);
      const { unmount } = render(<PlayerName player={3} name="Cy" />);
      const href = screen.getByRole("link", { name: "Cy" }).getAttribute("href")!;
      const url = new URL(href, "http://localhost");
      expect(url.pathname, path).toBe("/players/3");
      expect(parseFilter(url.search), path).toEqual({ players: new Set([1, 2]), cpu: true });
      unmount();
    }
  });

  it("carriesNothingFromGames", () => {
    for (const path of ["/games?players=1", "/games/abc", "/games/abc?players=1&cpu=1"]) {
      history.replaceState(null, "", path);
      const { unmount } = render(<PlayerName player={3} name="Cy" />);
      expect(screen.getByRole("link", { name: "Cy" }), path).toHaveAttribute("href", "/players/3");
      unmount();
    }
  });

  it("aPlainClickMovesInThePage", () => {
    render(<PlayerName player={3} name="Cy" />);
    const link = screen.getByRole("link", { name: "Cy" });
    expect(fireEvent.click(link)).toBe(false); // cancelled: moved in place
    expect(location.pathname).toBe("/players/3");
  });

  it("aModifiedClickIsTheBrowsers", () => {
    render(<PlayerName player={3} name="Cy" />);
    const link = screen.getByRole("link", { name: "Cy" });
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      expect(fireEvent.click(link, init), JSON.stringify(init)).toBe(true); // not cancelled
      expect(location.pathname).toBe("/stats/roles");
    }
  });
});

describe("playerHref", () => {
  it("adds the stats filter on a tab, PLAYERS or a player page, and nothing elsewhere", () => {
    expect(playerHref(5, { pathname: "/stats", search: "" })).toBe("/players/5");
    expect(playerHref(5, { pathname: "/stats/records", search: "?cpu=1" })).toBe("/players/5?cpu=1");
    expect(playerHref(5, { pathname: "/players", search: "?players=3,1" })).toBe("/players/5?players=1,3");
    expect(playerHref(5, { pathname: "/players/2", search: "?cpu=1&x=y" })).toBe("/players/5?cpu=1");
    expect(playerHref(5, { pathname: "/games", search: "?players=1" })).toBe("/players/5");
    expect(playerHref(5, { pathname: "/games/g1", search: "?cpu=1" })).toBe("/players/5");
    expect(playerHref(5, { pathname: "/stats/nope", search: "?cpu=1" })).toBe("/players/5");
  });
});
