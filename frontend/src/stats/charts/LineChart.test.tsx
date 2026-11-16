import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { describeLines, LINE_PADDING, LineChart, lineChartGeometry, SERIES_COLORS, type LineSeries } from "./LineChart";

const ann: LineSeries = {
  key: "1",
  label: "Ann",
  points: [
    { x: 0, y: 1500, dashed: true },
    { x: 1, y: 1620 },
    { x: 2, y: 1612 },
  ],
};
const bo: LineSeries = {
  key: "2",
  label: "Bo",
  points: [
    { x: 0, y: 1500 },
    { x: 1, y: 1480 },
  ],
};

/** The points of a path's `d`, as [x, y] pairs. */
const pathPoints = (d: string) =>
  d
    .trim()
    .split(/[ML]/)
    .filter((part) => part.trim() !== "")
    .map((part) => part.trim().split(/[ ,]+/).map(Number));

/** The chart's svg. */
const chart = () => screen.getByRole("img", { name: "Rating history" });
const tooltipLines = () =>
  Array.from(document.querySelectorAll(".chart-tooltip > *")).map((line) => line.textContent);

describe("the geometry", () => {
  it("mapsTheDataInsideThePadding", () => {
    const g = lineChartGeometry([{ key: "a", label: "A", points: [{ x: 0, y: 1500 }, { x: 10, y: 1600 }] }], 400, 200);
    expect(LINE_PADDING).toEqual({ top: 8, right: 8, bottom: 8, left: 40 });
    expect(g.xScale(0)).toBe(40);
    expect(g.xScale(10)).toBe(392);
    expect(g.yTicks).toEqual([1500, 1520, 1540, 1560, 1580, 1600]);
    expect(g.yScale(1600)).toBe(8);
    expect(g.yScale(1500)).toBe(192);
    expect(g.points).toEqual([
      { key: "a", index: 0, x: 40, y: 192 },
      { key: "a", index: 1, x: 392, y: 8 },
    ]);
  });

  it("oneXSitsInTheMiddle", () => {
    const g = lineChartGeometry(
      [
        { key: "a", label: "A", points: [{ x: 0, y: 1500 }] },
        { key: "b", label: "B", points: [{ x: 0, y: 1516 }] },
      ],
      400,
      200
    );
    expect(g.xScale(0)).toBe(216);
    expect(g.paths).toEqual([]);
    for (const p of g.points) {
      expect(Number.isNaN(p.x) || Number.isNaN(p.y)).toBe(false);
      expect(p.x).toBe(216);
    }
  });

  it("aSegmentTakesItsLaterPointsDashes", () => {
    const g = lineChartGeometry(
      [
        {
          key: "a",
          label: "A",
          points: [
            { x: 0, y: 1500, dashed: true },
            { x: 1, y: 1510, dashed: true },
            { x: 2, y: 1520 },
            { x: 3, y: 1530 },
          ],
        },
      ],
      400,
      200
    );
    expect(g.paths.map((p) => p.dashed)).toEqual([true, false]);
    expect(pathPoints(g.paths[0].d)).toHaveLength(2);
    expect(pathPoints(g.paths[1].d)).toHaveLength(3);
    expect(pathPoints(g.paths[0].d)[1]).toEqual(pathPoints(g.paths[1].d)[0]);
  });

  it("noPointsNoNaN", () => {
    const g = lineChartGeometry([{ key: "a", label: "A", points: [] }], 400, 200);
    expect(g.points).toEqual([]);
    expect(g.paths).toEqual([]);
    expect(Number.isNaN(g.yScale(1500))).toBe(false);
  });
});

describe("LineChart", () => {
  it("isAnImageDescribedInWords", () => {
    render(<LineChart series={[ann, bo]} label="Rating history" />);
    expect(chart()).toHaveAccessibleDescription("Ann: from 1500 to 1612, highest 1620. Bo: from 1500 to 1480, highest 1500.");
    expect(describeLines([ann], (y) => `${y}!`)).toBe("Ann: from 1500! to 1612!, highest 1620!.");
    expect(chart()).toHaveAttribute("width", "100%");
    expect(chart()).toHaveAttribute("viewBox", "0 0 320 220");
  });

  it("drawsALineEachInItsColour", () => {
    const { container } = render(<LineChart series={[ann, bo]} label="Rating history" colors={{ "2": "#123456" }} />);
    const paths = Array.from(container.querySelectorAll("path.chart-line"));
    expect(paths.map((p) => p.getAttribute("stroke"))).toEqual([SERIES_COLORS[0], "#123456"]);
    expect(SERIES_COLORS.slice(0, 3)).toEqual(["#f08a5d", "#5a9ba6", "#e8604a"]);
    expect(SERIES_COLORS).toHaveLength(10);
    expect(container.querySelector(".chart-legend")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".chart-legend")).toHaveTextContent("AnnBo");
  });

  it("aOnePointSeriesIsADot", () => {
    const { container } = render(
      <LineChart series={[{ key: "1", label: "Ann", points: [{ x: 0, y: 1516 }] }]} label="Rating history" />
    );
    expect(container.querySelectorAll("circle.chart-dot")).toHaveLength(1);
  });

  it("hoverShowsTheNearestPointsDetails", () => {
    render(<LineChart series={[ann, bo]} label="Rating history" detail={(s, i) => [s.label, `game ${i}`]} />);
    const g = lineChartGeometry([ann, bo], 320, 220);
    const target = g.points.find((p) => p.key === "2" && p.index === 1)!;
    expect(document.querySelector(".chart-tooltip")).toBeNull();
    fireEvent.pointerMove(chart(), { clientX: target.x + 2, clientY: target.y - 1, pointerType: "mouse" });
    expect(tooltipLines()).toEqual(["Bo", "game 1"]);
  });

  it("theDefaultDetailIsTheLabelAndTheValue", () => {
    render(<LineChart series={[ann]} label="Rating history" />);
    const target = lineChartGeometry([ann], 320, 220).points[1];
    fireEvent.pointerMove(chart(), { clientX: target.x, clientY: target.y, pointerType: "pen" });
    expect(tooltipLines()).toEqual(["Ann", "1620"]);
  });

  it("aTapShowsThemToo", () => {
    render(<LineChart series={[ann, bo]} label="Rating history" />);
    const target = lineChartGeometry([ann, bo], 320, 220).points[0];
    fireEvent.pointerDown(chart(), { clientX: target.x, clientY: target.y, pointerType: "touch" });
    expect(tooltipLines()).toEqual(["Ann", "1500"]);
  });

  it("aTouchMoveScrollsInstead", () => {
    render(<LineChart series={[ann]} label="Rating history" />);
    fireEvent.pointerMove(chart(), { clientX: 100, clientY: 100, pointerType: "touch" });
    expect(document.querySelector(".chart-tooltip")).toBeNull();
  });

  it("leavingHidesThem", () => {
    render(<LineChart series={[ann]} label="Rating history" />);
    fireEvent.pointerMove(chart(), { clientX: 40, clientY: 100, pointerType: "mouse" });
    expect(document.querySelector(".chart-tooltip")).not.toBeNull();
    fireEvent.pointerLeave(chart(), { pointerType: "mouse" });
    expect(document.querySelector(".chart-tooltip")).toBeNull();
  });

  it("theTooltipStaysInsideAtTheRightEdge", () => {
    // Review Focus 5: the rightmost point's details never push the page sideways.
    render(<LineChart series={[ann]} label="Rating history" />);
    const last = lineChartGeometry([ann], 320, 220).points[2];
    fireEvent.pointerMove(chart(), { clientX: last.x, clientY: last.y, pointerType: "mouse" });
    const tooltip = document.querySelector<HTMLElement>(".chart-tooltip")!;
    expect(tooltip.style.left).toBe("100%");
    expect(tooltip.style.transform.startsWith("translateX(-100%)")).toBe(true);
    const first = lineChartGeometry([ann], 320, 220).points[0];
    fireEvent.pointerMove(chart(), { clientX: first.x, clientY: first.y, pointerType: "mouse" });
    expect(tooltip.style.left).toBe("0%");
  });

  it("panningStaysTheBrowsers", () => {
    render(<LineChart series={[ann]} label="Rating history" />);
    expect(chart().style.touchAction).toBe("pan-y");
  });
});
