import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER } from "../counting";
import { TAB_IDS } from "../routes";
import { generateData } from "../testGames";
import { buildStats } from "../useStats";
import { TABS } from "./tabs";

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

  it("cover every route's tab", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(TAB_IDS);
  });

  it("each says it comes later, under its own title", () => {
    const stats = buildStats(generateData(10, 1), DEFAULT_FILTER);
    const titles: string[] = [];
    const filled: string[] = ["roles", "votes", "rivals", "endings", "activity", "overview", "records"];
    TABS.filter(({ id }) => !filled.includes(id)).forEach(({ Component }, i) => {
      const { unmount } = render(<Component stats={stats} />);
      const card = screen.getByRole("region", { name: titles[i] });
      expect(card).toHaveTextContent("Coming in a later update.");
      unmount();
    });
  });
});
