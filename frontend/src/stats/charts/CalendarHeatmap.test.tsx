import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeActivity, type Heatmap } from "../activity";
import { makeRecord } from "../testRecords";
import { CalendarHeatmap, HEAT_COLORS } from "./CalendarHeatmap";

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

const atNoon = (id: string, day: string) => {
  const startedAt = Date.parse(`${day}T12:00:00Z`);
  return makeRecord({ id, startedAt, endedAt: startedAt + 30 * 60_000 });
};
const ACTIVITY = computeActivity(
  [atNoon("a", "2026-01-01"), atNoon("b", "2026-01-01"), atNoon("c", "2026-03-02")],
  Date.parse("2026-12-31T12:00:00Z"),
  "UTC"
);
const Y2026 = ACTIVITY.heatmaps.find((h) => h.id === "2026")!;
const EMPTY: Heatmap = { ...Y2026, days: Y2026.days.map((d) => ({ ...d, games: 0, shade: 0 })), busiest: 0, busiestDay: null, games: 0, activeDays: 0 };

const draw = (heatmap = Y2026) => render(<CalendarHeatmap heatmap={heatmap} label="Games per day" />);
const tip = () => document.querySelector(".chart-tooltip")?.textContent ?? "";
const image = () => screen.getByRole("img", { name: "Games per day, 2026" });
const group = () => screen.getByRole("group", { name: "Games per day, 2026" });
const numbers = (el: Element, ...names: string[]) => names.map((n) => Number(el.getAttribute(n)));

describe("CalendarHeatmap", () => {
  it("sizesItselfFromItsBox", () => {
    widthIs(500);
    const { container } = draw();
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")!.split(" ").map(Number)[2]).toBeCloseTo(500);
    expect(Number(svg.getAttribute("height"))).toBeCloseTo(78.34, 1); // 53 weeks at 472/53
    const days = Array.from(container.querySelectorAll("rect.day"));
    expect(days).toHaveLength(365);
    const pitch = 472 / 53;
    const last = container.querySelector('rect[data-day="2026-12-31"]')!;
    const [x, y, side] = numbers(last, "x", "y", "width");
    expect([x, y, side]).toEqual([28 + 52 * pitch, 16 + 3 * pitch, 0.85 * pitch].map((v) => Math.round(v * 100) / 100));
    const fill = (k: string) => container.querySelector(`rect[data-day="${k}"]`)!.getAttribute("fill");
    expect(["2026-01-01", "2026-03-02", "2026-01-02"].map(fill)).toEqual([HEAT_COLORS[4], HEAT_COLORS[2], HEAT_COLORS[0]]);
    expect(container.querySelector('rect[data-day="2026-03-02"]')).toHaveAttribute("data-shade", "2");
    expect(image()).toHaveAccessibleDescription("3 games on 2 days; busiest Thu 1 Jan 2026 with 2 games.");
  });

  it("namesTheMonthsAndEveryOtherWeekday", () => {
    widthIs(500);
    const { container } = draw();
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts.filter((t) => ["Mon", "Wed", "Fri"].includes(t!))).toEqual(["Mon", "Wed", "Fri"]);
    expect(texts.filter((t) => !["Mon", "Wed", "Fri"].includes(t!))).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
  });

  it("narrowCardsDropTheWeekdaysAndCrowdedMonths", () => {
    widthIs(288);
    const { container } = draw();
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).not.toContain("Mon");
    const months = Array.from(container.querySelectorAll("text.month-label")).map((t) => Number(t.getAttribute("x")));
    expect(months.length).toBeGreaterThan(0);
    months.forEach((x, i) => {
      if (i > 0) expect(x - months[i - 1]).toBeGreaterThanOrEqual(24);
      expect(x).toBeLessThanOrEqual(288 - 24);
    });
  });

  it("wideCardsCapTheCell", () => {
    widthIs(1200);
    const { container } = draw();
    expect(container.querySelector("svg")!.getAttribute("height")).toBe("128");
    const right = Math.max(...Array.from(container.querySelectorAll("rect.day")).map((r) => numbers(r, "x")[0]));
    // The last week's cells start 52 cells of 16px after the 28px gutter: the grid is 876 by 128.
    expect(right).toBe(860);
    expect(numbers(container.querySelector("rect.day")!, "width")[0]).toBe(13.6);
  });

  it("showsTheDayUnderThePointer", () => {
    widthIs(500);
    draw();
    const pitch = 472 / 53;
    fireEvent.pointerMove(image(), { clientX: 28 + 0.5 * pitch, clientY: 16 + 3.5 * pitch, pointerType: "mouse" });
    expect(tip()).toBe("Thu 1 Jan 2026: 2 games");
    expect(document.querySelectorAll("rect.day.is-active")).toHaveLength(1);
    fireEvent.pointerMove(image(), { clientX: 28 + 0.5 * pitch, clientY: 16 + 0.5 * pitch, pointerType: "mouse" }); // 29 Dec 2025
    expect(tip()).toBe("");
    fireEvent.pointerDown(image(), { clientX: 28 + 9.5 * pitch, clientY: 16 + 0.5 * pitch, pointerType: "touch" }); // Mon 2 Mar
    expect(tip()).toBe("Mon 2 Mar 2026: 1 game");
    fireEvent.pointerDown(image(), { clientX: 10, clientY: 10, pointerType: "touch" });
    expect(tip()).toBe("");
  });

  it("aDayWithNoGamesSaysSo", () => {
    widthIs(500);
    draw();
    const pitch = 472 / 53;
    fireEvent.pointerMove(image(), { clientX: 28 + 0.5 * pitch, clientY: 16 + 4.5 * pitch, pointerType: "mouse" });
    expect(tip()).toBe("Fri 2 Jan 2026: no games");
  });

  it("arrowKeysMoveByDayAndWeek", () => {
    widthIs(500);
    draw();
    fireEvent.keyDown(group(), { key: "ArrowUp" });
    expect(tip()).toBe("Thu 31 Dec 2026: no games");
    fireEvent.keyDown(group(), { key: "ArrowUp" });
    fireEvent.keyDown(group(), { key: "ArrowLeft" });
    expect(tip()).toBe("Wed 23 Dec 2026: no games");
    fireEvent.keyDown(group(), { key: "ArrowDown" });
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(tip()).toBe("Thu 31 Dec 2026: no games");
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(tip()).toBe("Thu 31 Dec 2026: no games");
    fireEvent.keyDown(group(), { key: "Home" });
    expect(tip()).toBe("Thu 1 Jan 2026: 2 games");
    fireEvent.keyDown(group(), { key: "ArrowLeft" });
    expect(tip()).toBe("Thu 1 Jan 2026: 2 games");
    fireEvent.blur(group());
    expect(tip()).toBe("");
  });

  it("isAFocusableGroupNamedByItsLabelAndView", () => {
    draw();
    expect(group()).toHaveAttribute("tabindex", "0");
    expect(group()).toContainElement(image());
  });

  it("aViewWithNoGames", () => {
    draw(EMPTY);
    expect(image()).toHaveAccessibleDescription("No games.");
  });
});
