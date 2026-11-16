import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollRegion } from "./ScrollRegion";
import { StatCard } from "./StatCard";

describe("ScrollRegion", () => {
  it("isAFocusableRegionNamedByItsLabel", () => {
    render(
      <ScrollRegion label="Opponents table">
        <table>
          <tbody>
            <tr>
              <td>wide</td>
            </tr>
          </tbody>
        </table>
      </ScrollRegion>
    );
    const region = screen.getByRole("region", { name: "Opponents table" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("scroll-region");
    expect(within(region).getByRole("table")).toBeInTheDocument();
  });

  it("isARegionOfItsOwnInsideItsCard", () => {
    render(
      <StatCard title="Opponents" definition="Games against each other.">
        <ScrollRegion label="Opponents table">
          <p>the matrix</p>
        </ScrollRegion>
      </StatCard>
    );
    expect(screen.getAllByRole("region")).toHaveLength(2);
    const card = screen.getByRole("region", { name: "Opponents" });
    expect(within(card).getByRole("region", { name: "Opponents table" })).toHaveTextContent("the matrix");
  });
});
