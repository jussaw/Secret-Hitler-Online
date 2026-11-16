import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatLocalDateTime, outcomeLabel } from "./format";
import TabsPage from "./TabsPage";
import { makeData, makeRecord } from "./testRecords";

const HOUR = 60 * 60 * 1000;
const start = new Date(2026, 10, 1, 20, 0).getTime();
const games = Array.from({ length: 25 }, (_, i) =>
  makeRecord({ id: `g${String(i + 1).padStart(2, "0")}`, startedAt: start + i * HOUR, endedAt: start + i * HOUR + 1 })
);

describe("TabsPage", () => {
  it("the ten latest games and a link to the rest", () => {
    render(<TabsPage data={makeData(games)} route={{ page: "tab", tab: "overview" }} />);
    const card = screen.getByRole("region", { name: "LATEST GAMES" });
    const items = within(within(card).getByRole("list")).getAllByRole("link");
    const ids = Array.from({ length: 10 }, (_, i) => `g${25 - i}`);
    expect(items.map((a) => a.getAttribute("href"))).toEqual(ids.map((id) => `/stats/games/${id}`));
    expect(items[0]).toHaveTextContent(`${formatLocalDateTime(games[24].startedAt)} · ${outcomeLabel(games[24])}`);
    expect(within(card).getByRole("link", { name: "All games ›" })).toHaveAttribute("href", "/stats/games");
  });

  it("no games", () => {
    render(<TabsPage data={makeData([])} route={{ page: "tab", tab: "overview" }} />);
    expect(screen.getByText("No games recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
