import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { heldBack } from "../header/testClicks";
import type { StatsRoute } from "./routes";
import StatsHeader from "./StatsHeader";

function links(route: StatsRoute) {
  render(<StatsHeader route={route} />);
  return within(screen.getByRole("navigation", { name: "Site" })).getAllByRole("link");
}

describe("StatsHeader", () => {
  it("links to the four places, PLAY first", () => {
    const found = links({ page: "tab", tab: "overview" });
    expect(found.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["PLAY", "/"],
      ["STATS", "/stats"],
      ["GAMES", "/games"],
      ["PLAYERS", "/players"],
    ]);
    expect(screen.getByRole("banner")).toHaveTextContent("SECRET-HITLER");
  });

  it("marks where you are", () => {
    const cases: [StatsRoute, string | null][] = [
      [{ page: "tab", tab: "overview" }, "STATS"],
      [{ page: "tab", tab: "roles" }, "STATS"],
      [{ page: "games" }, "GAMES"],
      [{ page: "game", id: "g1" }, "GAMES"],
      [{ page: "players" }, "PLAYERS"],
      [{ page: "player", number: 3 }, "PLAYERS"],
      [{ page: "notFound" }, null],
    ];
    for (const [route, current] of cases) {
      const marked = links(route).filter((a) => a.getAttribute("aria-current") === "page");
      expect(
        marked.map((a) => a.textContent),
        JSON.stringify(route)
      ).toEqual(current ? [current] : []);
      document.body.innerHTML = "";
    }
  });

  describe("its links", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      history.replaceState(null, "", "/");
    });

    it("move STATS, GAMES and PLAYERS in place, and PLAY loads the game", () => {
      vi.stubGlobal("scrollTo", vi.fn());
      history.replaceState(null, "", "/stats");
      const found = links({ page: "tab", tab: "overview" });
      const link = (label: string) => found.find((a) => a.textContent === label)!;
      expect(heldBack(link("GAMES")), "GAMES moves in place").toBe(true);
      expect(location.pathname).toBe("/games");
      expect(heldBack(link("PLAYERS")), "PLAYERS moves in place").toBe(true);
      expect(location.pathname).toBe("/players");
      expect(heldBack(link("PLAY")), "PLAY is the browser's").toBe(false);
    });
  });
});
