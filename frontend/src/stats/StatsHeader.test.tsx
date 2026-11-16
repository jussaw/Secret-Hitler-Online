import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StatsRoute } from "./routes";
import StatsHeader from "./StatsHeader";

function links(route: StatsRoute) {
  render(<StatsHeader route={route} />);
  return within(screen.getByRole("navigation", { name: "Stats pages" })).getAllByRole("link");
}

describe("StatsHeader", () => {
  it("links to the four places", () => {
    const found = links({ page: "tab", tab: "overview" });
    expect(found.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["STATS", "/stats"],
      ["GAMES", "/stats/games"],
      ["PLAYERS", "/stats/players"],
      ["PLAY", "/"],
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
});
