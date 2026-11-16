import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComingSoon } from "./ComingSoon";

describe("ComingSoon", () => {
  it("is a card saying the tab comes later", () => {
    render(<ComingSoon title="Roles & cards" />);
    const card = screen.getByRole("region", { name: "Roles & cards" });
    expect(card).toHaveClass("stats-card");
    expect(within(card).getByText("Coming in a later update.")).toBeInTheDocument();
  });
});
