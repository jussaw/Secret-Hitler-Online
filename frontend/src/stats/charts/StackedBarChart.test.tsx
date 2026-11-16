import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BAR_PADDING, describeBars, StackedBarChart, stackedBarGeometry, type StackedBar } from "./StackedBarChart";

const bars: StackedBar[] = [
  {
    label: "5",
    parts: [
      { key: "A", value: 2 },
      { key: "B", value: 4 },
    ],
  },
  {
    label: "6",
    parts: [
      { key: "A", value: 1 },
      { key: "B", value: 0 },
    ],
  },
];
const colors = { A: "#5a9ba6", B: "#e8604a" };
const legend = { A: "Liberal", B: "Fascist" };

const chart = () => screen.getByRole("img", { name: "Wins by size" });
const tooltip = () => document.querySelector<HTMLElement>(".chart-tooltip");
/** The centre of a rect of the geometry at the jsdom fallback width. */
function centre(bar: number, key: string) {
  const rect = stackedBarGeometry(bars, 320, 220).rects.find((r) => r.bar === bar && r.key === key)!;
  return { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };
}

describe("the geometry", () => {
  it("stacksBottomUpScaledToTheTallest", () => {
    expect(BAR_PADDING).toEqual({ top: 8, right: 8, bottom: 24, left: 32 });
    const g = stackedBarGeometry(bars, 400, 200);
    expect(g.yTicks).toEqual([0, 2, 4, 6]);
    expect(g.rects).toHaveLength(3);
    const a = g.rects.find((r) => r.bar === 0 && r.key === "A")!;
    const b = g.rects.find((r) => r.bar === 0 && r.key === "B")!;
    expect([a.height, a.y]).toEqual([56, 120]);
    expect([b.height, b.y]).toEqual([112, 8]);
    expect(a.width).toBeCloseTo(0.7 * 180, 9);
    expect(a.x).toBeCloseTo(32 + 0.15 * 180, 9);
    const second = g.rects.find((r) => r.bar === 1)!;
    expect(second.x).toBeCloseTo(32 + 180 + 0.15 * 180, 9);
    expect(g.slot).toBe(180);
    expect([g.yScale(0), g.yScale(3), g.yScale(6)]).toEqual([176, 92, 8]);
  });

  it("nothingToStack", () => {
    const g = stackedBarGeometry([{ label: "5", parts: [{ key: "A", value: 0 }] }], 400, 200);
    expect(g.rects).toEqual([]);
    expect(g.yTicks.every((t) => !Number.isNaN(t))).toBe(true);
    expect(stackedBarGeometry([], 400, 200).rects).toEqual([]);
  });
});

describe("StackedBarChart", () => {
  it("isAnImageDescribedInWords", () => {
    render(<StackedBarChart bars={bars} colors={colors} legend={legend} label="Wins by size" />);
    expect(chart()).toHaveAccessibleDescription("5: Liberal 2, Fascist 4. 6: Liberal 1, Fascist 0.");
    expect(describeBars(bars, {}, (v) => `${v}x`)).toBe("5: A 2x, B 4x. 6: A 1x, B 0x.");
  });

  it("drawsItsLegend", () => {
    const { container } = render(<StackedBarChart bars={bars} colors={colors} legend={legend} label="Wins by size" />);
    const items = Array.from(container.querySelectorAll(".chart-legend > li"));
    expect(items.map((li) => li.textContent)).toEqual(["Liberal", "Fascist"]);
    expect(container.querySelector(".chart-legend")).toHaveAttribute("aria-hidden", "true");
    expect(Array.from(container.querySelectorAll("rect.chart-bar")).map((r) => r.getAttribute("fill"))).toEqual([
      "#5a9ba6",
      "#e8604a",
      "#5a9ba6",
    ]);
  });

  it("hoverAndTapShowAPart", () => {
    render(<StackedBarChart bars={bars} colors={colors} legend={legend} label="Wins by size" />);
    expect(tooltip()).toBeNull();
    fireEvent.pointerMove(chart(), { ...centre(0, "B"), pointerType: "mouse" });
    expect(tooltip()).toHaveTextContent("5 · Fascist 4 of 6");
    const marked = Array.from(document.querySelectorAll("rect.chart-bar.is-active"));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAttribute("fill", "#e8604a");
    fireEvent.pointerLeave(chart(), { pointerType: "mouse" });
    expect(tooltip()).toBeNull();
    fireEvent.pointerDown(chart(), { ...centre(1, "A"), pointerType: "touch" });
    expect(tooltip()).toHaveTextContent("6 · Liberal 1 of 1");
  });

  it("formatsItsValues", () => {
    render(<StackedBarChart bars={bars} colors={colors} label="Wins by size" formatValue={(v) => `${v} games`} />);
    fireEvent.pointerMove(chart(), { ...centre(0, "A"), pointerType: "mouse" });
    expect(tooltip()).toHaveTextContent("5 · A 2 games of 6 games");
  });

  it("thinsLabelsThatWouldOverlap", () => {
    const hours: StackedBar[] = Array.from({ length: 24 }, (_, h) => ({
      label: String(h).padStart(2, "0"),
      parts: [{ key: "A", value: h + 1 }],
    }));
    const { container } = render(<StackedBarChart bars={hours} colors={colors} legend={legend} label="Wins by size" />);
    // 24 labels of 2 characters in the 280px plot of the 320px fallback: every second one.
    const labels = Array.from(container.querySelectorAll("svg > text")).map((t) => t.textContent);
    expect(labels).toEqual(["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"]);
    expect(chart()).toHaveAccessibleDescription(hours.map((bar, h) => `${bar.label}: Liberal ${h + 1}.`).join(" "));
    const rect = stackedBarGeometry(hours, 320, 220).rects[1];
    fireEvent.pointerMove(chart(), { clientX: rect.x + rect.width / 2, clientY: rect.y + 1, pointerType: "mouse" });
    expect(tooltip()).toHaveTextContent("01 · Liberal 2 of 2");
  });

  it("theTooltipStaysInsideAtTheRightEdge", () => {
    render(<StackedBarChart bars={bars} colors={colors} legend={legend} label="Wins by size" />);
    fireEvent.pointerMove(chart(), { ...centre(1, "A"), pointerType: "mouse" });
    expect(tooltip()!.style.left).toBe("100%");
    expect(tooltip()!.style.transform.startsWith("translateX(-100%)")).toBe(true);
    fireEvent.pointerMove(chart(), { ...centre(0, "A"), pointerType: "mouse" });
    expect(tooltip()!.style.left).toBe("0%");
  });
});
