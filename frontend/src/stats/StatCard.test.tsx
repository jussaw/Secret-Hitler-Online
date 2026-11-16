import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_GAMES, StatCard } from "./StatCard";

describe("StatCard", () => {
  it("showsItsTitleDefinitionAndContent", () => {
    render(
      <StatCard title="Win rate" definition="Games won of games played." className="extra">
        <p>the table</p>
      </StatCard>
    );
    const card = screen.getByRole("region", { name: "Win rate" });
    expect(card.tagName).toBe("SECTION");
    expect(card).toHaveClass("stats-card", "stat-card", "extra");
    expect(within(card).getByRole("heading", { level: 3, name: "Win rate" })).toHaveClass("stats-card-title");
    expect(within(card).getByText("Games won of games played.")).toHaveClass("stat-card-definition");
    expect(within(card).getByText("the table")).toBeInTheDocument();
  });

  it("anEmptyCardSaysSoInstead", () => {
    render(
      <StatCard title="Win rate" definition="Games won of games played." empty>
        <p>the table</p>
      </StatCard>
    );
    const card = screen.getByRole("region", { name: "Win rate" });
    expect(NO_GAMES).toBe("No games yet with these players.");
    expect(within(card).getByText("No games yet with these players.")).toHaveClass("stat-card-empty");
    expect(within(card).queryByText("the table")).toBeNull();
  });

  it("anEmptyCardCanSayWhy", () => {
    render(
      <StatCard title="Player of the month" definition="The most wins this month." empty="No wins yet this month.">
        <p>the table</p>
      </StatCard>
    );
    const card = screen.getByRole("region", { name: "Player of the month" });
    expect(within(card).getByText("No wins yet this month.")).toBeInTheDocument();
    expect(within(card).queryByText(NO_GAMES)).toBeNull();
    expect(within(card).queryByText("the table")).toBeNull();
  });

  it("anEmptyFalseShowsTheChildren", () => {
    render(
      <StatCard title="Win rate" definition="Games won of games played." empty={false}>
        <p>the table</p>
      </StatCard>
    );
    expect(screen.getByText("the table")).toBeInTheDocument();
    expect(screen.queryByText(NO_GAMES)).toBeNull();
  });

  it("twoCardsKeepTheirOwnNames", () => {
    render(
      <>
        <StatCard title="One" definition="First." />
        <StatCard title="Two" definition="Second." />
      </>
    );
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-labelledby"))).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Two" })).toHaveTextContent("Second.");
  });
});
