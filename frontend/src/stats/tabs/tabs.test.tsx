import { describe, expect, it } from "vitest";
import { TAB_IDS } from "../routes";
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
});
