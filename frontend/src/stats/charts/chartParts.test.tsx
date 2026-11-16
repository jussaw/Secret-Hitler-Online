import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChartFrame, nearest, px } from "./chartParts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A frame 300 by 200 in its own px, with two legend keys and the given tooltip. */
function renderFrame(props: Partial<Parameters<typeof ChartFrame>[0]> = {}) {
  const onPoint = vi.fn();
  const onLeave = vi.fn();
  render(
    <ChartFrame
      className="test-chart"
      boxRef={createRef<HTMLDivElement>()}
      label="A chart"
      description="Two things."
      width={300}
      height={200}
      onPoint={onPoint}
      onLeave={onLeave}
      legend={[
        { key: "a", label: "Ann", color: "#111111" },
        { key: "b", label: "Bo", color: "#222222" },
      ]}
      tooltip={null}
      {...props}
    >
      <rect width={10} height={10} />
    </ChartFrame>
  );
  return { onPoint, onLeave, svg: screen.getByRole("img", { name: "A chart" }) };
}

describe("px", () => {
  it("rounds to hundredths", () => {
    expect(px(12.3456)).toBe(12.35);
    expect(px(8)).toBe(8);
  });
});

describe("nearest", () => {
  it("is the item at the least distance, or null", () => {
    expect(nearest([3, -1, 7], (n) => Math.abs(n))).toBe(-1);
    expect(nearest([], () => 0)).toBeNull();
  });
});

describe("ChartFrame", () => {
  it("isAnImageWithItsDescriptionAndLegend", () => {
    const { svg } = renderFrame();
    expect(svg).toHaveAccessibleDescription("Two things.");
    expect(svg).toHaveAttribute("viewBox", "0 0 300 200");
    expect(svg).toHaveAttribute("width", "100%");
    expect(svg).toHaveAttribute("height", "200");
    expect(svg.style.touchAction).toBe("pan-y");
    expect(svg.parentElement).toHaveClass("chart", "test-chart");
    const legend = document.querySelector(".chart-legend")!;
    expect(legend).toHaveAttribute("aria-hidden", "true");
    expect(Array.from(legend.children, (li) => li.textContent)).toEqual(["Ann", "Bo"]);
    expect(document.querySelector(".chart-tooltip")).toBeNull();
  });

  it("mapsThePointerIntoItsOwnPixels", () => {
    // Drawn at twice its size, 600 by 400 from (50, 20).
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 50,
      top: 20,
      width: 600,
      height: 400,
    } as DOMRect);
    const { onPoint, svg } = renderFrame();
    fireEvent.pointerMove(svg, { clientX: 350, clientY: 220, pointerType: "mouse" });
    expect(onPoint).toHaveBeenCalledWith({ x: 150, y: 100 });
  });

  it("hoversWithAMouseOrPenTapsWithATouchAndHidesOnAMouseLeaving", () => {
    const { onPoint, onLeave, svg } = renderFrame();
    fireEvent.pointerMove(svg, { clientX: 1, clientY: 2, pointerType: "mouse" });
    fireEvent.pointerMove(svg, { clientX: 3, clientY: 4, pointerType: "pen" });
    fireEvent.pointerMove(svg, { clientX: 5, clientY: 6, pointerType: "touch" });
    fireEvent.pointerDown(svg, { clientX: 7, clientY: 8, pointerType: "touch" });
    expect(onPoint.mock.calls.map(([at]) => [at.x, at.y])).toEqual([
      [1, 2],
      [3, 4],
      [7, 8],
    ]);
    fireEvent.pointerLeave(svg, { pointerType: "touch" });
    expect(onLeave).not.toHaveBeenCalled();
    fireEvent.pointerLeave(svg, { pointerType: "mouse" });
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("placesItsTooltipByShare", () => {
    renderFrame({ tooltip: { share: 100, top: 40.123, below: false, lines: ["Ann", "1612"] } });
    const tooltip = document.querySelector<HTMLElement>(".chart-tooltip")!;
    expect(Array.from(tooltip.children, (line) => line.textContent)).toEqual(["Ann", "1612"]);
    expect(tooltip.style.left).toBe("100%");
    expect(tooltip.style.top).toBe("40.12px");
    expect(tooltip.style.transform).toBe("translateX(-100%) translateY(calc(-100% - 10px))");
  });

  it("putsItsTooltipBelowWhenAsked", () => {
    renderFrame({ tooltip: { share: 33.333, top: 10, below: true, lines: ["x"] } });
    const tooltip = document.querySelector<HTMLElement>(".chart-tooltip")!;
    expect(tooltip.style.left).toBe("33.33%");
    expect(tooltip.style.transform).toBe("translateX(-33.33%) translateY(10px)");
  });
});
