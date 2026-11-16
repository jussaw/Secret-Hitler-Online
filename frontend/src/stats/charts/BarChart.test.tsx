import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarChart, type Bar } from "./BarChart";

/** Every element's box `width` px wide from the page's top left, as a chart's box measures. */
function widthIs(width: number) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: 0,
    width,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

afterEach(() => vi.restoreAllMocks());

const WEEK: Bar[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, value: i + 1 }));
const draw = (bars = WEEK) => render(<BarChart bars={bars} label="Games by day of the week" unit={["game", "games"]} />);
const tip = () => document.querySelector(".chart-tooltip")?.textContent ?? "";
const svg = () => screen.getByRole("img", { name: "Games by day of the week" });
const group = () => screen.getByRole("group", { name: "Games by day of the week" });
const rects = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("rect.bar")).map((r) => ["x", "width", "height", "y"].map((a) => Number(r.getAttribute(a))));

describe("BarChart", () => {
  it("sizesItselfFromItsBox", () => {
    widthIs(500);
    const { container } = draw();
    const image = container.querySelector("svg")!;
    expect([image.getAttribute("viewBox"), image.getAttribute("height")]).toEqual(["0 0 500 200", "200"]);
    const bars = rects(container);
    expect(bars).toHaveLength(7);
    expect(bars[6][2]).toBeCloseTo(172);
    expect(bars[6][3]).toBeCloseTo(8);
    expect(bars[3][2]).toBeCloseTo(98.29, 1);
    expect(bars[3][2] + bars[3][3]).toBeCloseTo(180, 1);
    expect(bars[0][0]).toBeCloseTo(38.69, 1);
    expect(bars[0][1]).toBeCloseTo(53.49, 1);
    expect(container.querySelector("rect.bar")).toHaveAttribute("fill", "#f08a5d");
  });

  it("heightFollowsTheWidthWithinLimits", () => {
    const height = (width: number) => {
      widthIs(width);
      const { container, unmount } = draw();
      const h = container.querySelector("svg")!.getAttribute("height");
      unmount();
      vi.restoreAllMocks();
      return h;
    };
    expect([height(200), height(400), height(1000)]).toEqual(["120", "160", "220"]);
  });

  it("labelsZeroAndTheMaximum", () => {
    widthIs(500);
    const { container } = draw();
    const yLabels = Array.from(container.querySelectorAll("text.chart-axis-text:not(.x-label)")).map((t) => t.textContent);
    expect(yLabels).toEqual(["0", "7"]);
  });

  it("showsTheValueUnderThePointerOrATap", () => {
    widthIs(500);
    draw();
    expect(svg()).toHaveAccessibleDescription("Mon 1, Tue 2, Wed 3, Thu 4, Fri 5, Sat 6, Sun 7");
    fireEvent.pointerMove(svg(), { clientX: 266, clientY: 100, pointerType: "mouse" });
    expect(tip()).toBe("Thu: 4 games");
    expect(document.querySelectorAll("rect.bar.is-active")).toHaveLength(1);
    fireEvent.pointerLeave(svg(), { pointerType: "mouse" });
    expect(tip()).toBe("");
    expect(document.querySelector("rect.bar.is-active")).toBeNull();
    fireEvent.pointerDown(svg(), { clientX: 40, clientY: 100, pointerType: "touch" });
    fireEvent.pointerLeave(svg(), { pointerType: "touch" });
    expect(tip()).toBe("Mon: 1 game");
  });

  it("theTooltipSitsOverItsBar", () => {
    widthIs(500);
    draw();
    fireEvent.pointerMove(svg(), { clientX: 266, clientY: 100, pointerType: "mouse" });
    const tooltip = document.querySelector<HTMLElement>(".chart-tooltip")!;
    // Thu's centre, 32 + 3.5 slots of 468 / 7, is 53.2% of the way across.
    expect(tooltip.style.left).toBe("53.2%");
    expect(tooltip.style.transform).toContain("translateX(-53.2%)");
  });

  it("isAFocusableGroupNamedByItsLabel", () => {
    draw();
    expect(group()).toHaveAttribute("tabindex", "0");
    expect(group()).toContainElement(svg());
  });

  it("arrowKeysStepThroughTheBars", () => {
    widthIs(500);
    draw();
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(tip()).toBe("Mon: 1 game");
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(tip()).toBe("Tue: 2 games");
    fireEvent.keyDown(group(), { key: "End" });
    expect(tip()).toBe("Sun: 7 games");
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(tip()).toBe("Sun: 7 games");
    fireEvent.keyDown(group(), { key: "Home" });
    expect(tip()).toBe("Mon: 1 game");
    fireEvent.keyDown(group(), { key: "ArrowLeft" });
    expect(tip()).toBe("Mon: 1 game");
    fireEvent.blur(group());
    expect(tip()).toBe("");
    fireEvent.keyDown(group(), { key: "ArrowLeft" });
    expect(tip()).toBe("Sun: 7 games");
  });

  it("aScreenReaderHearsTheDetailsTheKeysMoveTo", () => {
    widthIs(500);
    draw();
    const status = within(group()).getByRole("status");
    expect(status).toHaveTextContent(/^$/);
    fireEvent.keyDown(group(), { key: "End" });
    expect(status).toHaveTextContent("Sun: 7 games");
    fireEvent.blur(group());
    expect(status).toHaveTextContent(/^$/);
  });

  it("arrowKeysOnTheImageReachTheGroup", () => {
    widthIs(500);
    draw();
    fireEvent.keyDown(svg(), { key: "ArrowRight" });
    expect(tip()).toBe("Mon: 1 game");
  });

  it("labelsThinOutToFit", () => {
    widthIs(300);
    const hours = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, "0"), value: h }));
    const { container } = draw(hours);
    const labels = Array.from(container.querySelectorAll("text.x-label")).map((t) => t.textContent);
    expect(labels).toEqual(["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"]);
  });

  it("labelsStayInTheBox", () => {
    widthIs(288);
    const months = Array.from({ length: 13 }, (_, i) => ({ label: `Nov 20${10 + i}`, value: 1 }));
    const { container } = draw(months);
    for (const text of Array.from(container.querySelectorAll("text.x-label"))) {
      const x = Number(text.getAttribute("x"));
      expect(x - 3.5 * 8).toBeGreaterThanOrEqual(0);
      expect(x + 3.5 * 8).toBeLessThanOrEqual(288);
    }
  });

  it("manyBarsStayInTheBox", () => {
    widthIs(200);
    const many = Array.from({ length: 500 }, (_, i) => ({ label: String(i), value: (i % 7) + 1 }));
    const { container } = draw(many);
    const bars = rects(container);
    expect(bars).toHaveLength(500);
    for (const [x, width] of bars) {
      expect(x).toBeGreaterThanOrEqual(32);
      expect(x + width).toBeLessThanOrEqual(200);
    }
  });

  it("theTooltipUsesTheLongLabel", () => {
    draw([{ label: "21", long: "21:00 to 22:00", value: 5 }]);
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(tip()).toBe("21:00 to 22:00: 5 games");
    expect(svg()).toHaveAccessibleDescription("21:00 to 22:00 5");
  });

  it("aColourOfItsOwn", () => {
    const { container } = render(<BarChart bars={WEEK} label="Votes" unit={["vote", "votes"]} color="#5a9ba6" />);
    expect(container.querySelector("rect.bar")).toHaveAttribute("fill", "#5a9ba6");
  });

  it("allZeroBarsDrawNothingAbove", () => {
    const { container } = draw(WEEK.map((bar) => ({ ...bar, value: 0 })));
    expect(rects(container).every(([, , height]) => height === 0)).toBe(true);
  });

  it("fallsBackWithoutAWidth", () => {
    widthIs(0);
    const { container } = draw();
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 320 128");
  });
});
