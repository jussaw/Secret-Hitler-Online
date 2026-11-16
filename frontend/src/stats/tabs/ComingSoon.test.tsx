import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { generateData } from "../testGames";
import { buildStats } from "../useStats";
import { DEFAULT_FILTER } from "../counting";
import { ComingSoon } from "./ComingSoon";
import { TABS } from "./tabs";

describe("ComingSoon", () => {
  it("is a card saying the tab comes later", () => {
    render(<ComingSoon title="Roles & cards" />);
    const card = screen.getByRole("region", { name: "Roles & cards" });
    expect(card).toHaveClass("stats-card");
    expect(within(card).getByText("Coming in a later update.")).toBeInTheDocument();
  });
});

describe("TABS", () => {
  it("are the seven tabs in order", () => {
    expect(TABS.map((tab) => [tab.id, tab.label])).toEqual([
      ["overview", "OVERVIEW"],
      ["roles", "ROLES & CARDS"],
      ["votes", "VOTES & POWERS"],
      ["rivals", "RIVALS"],
      ["endings", "ENDINGS"],
      ["activity", "ACTIVITY"],
      ["records", "RECORDS"],
    ]);
  });

  it("each says it comes later, under its own title", () => {
    const stats = buildStats(generateData(10, 1), DEFAULT_FILTER);
    const titles = ["Overview", "Roles & cards", "Votes & powers", "Rivals", "Endings", "Activity", "Records"];
    TABS.forEach(({ Component }, i) => {
      const { unmount } = render(<Component stats={stats} />);
      const card = screen.getByRole("region", { name: titles[i] });
      expect(card).toHaveTextContent("Coming in a later update.");
      unmount();
    });
  });
});
