import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TROPHIES } from "../trophies";
import { TrophyBadge } from "./TrophyBadge";

describe("TrophyBadge", () => {
  it("aBadgeCarriesItsRule", () => {
    render(<TrophyBadge trophy={TROPHIES[0]} />);
    const badge = screen.getByText("Regular");
    expect(badge).toHaveClass("trophy-badge");
    expect(badge).toHaveAttribute("title", "At least 20 counted games");
  });
});
