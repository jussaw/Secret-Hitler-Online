import { useRef, useState } from "react";
import { niceTicks } from "./axis";
import { ChartFrame, nearest, px, YAxis, type TooltipPlace } from "./chartParts";
import { useChartWidth } from "./useChartWidth";

/** A bar: its label under it, and its parts, stacked bottom-up in order. */
export interface StackedBar {
  label: string;
  parts: { key: string; value: number }[];
}

/** Room round the plot, in px: the y axis's labels at the left, the bars' labels below. */
export const BAR_PADDING = { top: 8, right: 8, bottom: 24, left: 32 };

export interface StackedBarGeometry {
  yTicks: number[];
  /** The y, in px from the top, that a stack of `value` reaches. */
  yScale: (value: number) => number;
  /** Each bar's share of the plot's width, in px. */
  slot: number;
  /** Every part above zero, in px. */
  rects: { bar: number; key: string; x: number; y: number; width: number; height: number }[];
}

/**
 * Where every part goes in a `width` by `height` chart: one slot per bar, the bar 70% of it, its
 * parts stacked bottom-up in order, all scaled to the last of `niceTicks(0, tallest)`. A part of
 * zero has no rect.
 */
export function stackedBarGeometry(bars: StackedBar[], width: number, height: number): StackedBarGeometry {
  const left = BAR_PADDING.left;
  const right = width - BAR_PADDING.right;
  const top = BAR_PADDING.top;
  const bottom = height - BAR_PADDING.bottom;
  const tallest = Math.max(0, ...bars.map((bar) => bar.parts.reduce((sum, part) => sum + Math.max(0, part.value), 0)));
  const yTicks = tallest > 0 ? niceTicks(0, tallest) : [0];
  const scaleTop = yTicks[yTicks.length - 1] || 1;
  const slot = bars.length > 0 ? (right - left) / bars.length : 0;
  const yScale = (value: number) => bottom - (value / scaleTop) * (bottom - top);
  const rects: StackedBarGeometry["rects"] = [];
  bars.forEach((bar, i) => {
    let base = bottom;
    for (const part of bar.parts) {
      if (part.value <= 0) continue;
      const h = (part.value / scaleTop) * (bottom - top);
      base -= h;
      rects.push({ bar: i, key: part.key, x: left + i * slot + 0.15 * slot, y: base, width: 0.7 * slot, height: h });
    }
  });
  return { yTicks, yScale, slot, rects };
}

/** The words a screen reader reads: "<label>: <legend> <value>, <legend> <value>." per bar. */
export function describeBars(bars: StackedBar[], legend: Record<string, string>, formatValue: (value: number) => string): string {
  return bars
    .map((bar) => `${bar.label}: ${bar.parts.map((part) => `${legend[part.key] ?? part.key} ${formatValue(part.value)}`).join(", ")}.`)
    .join(" ");
}

export interface StackedBarChartProps {
  bars: StackedBar[];
  colors: Record<string, string>;
  /** The chart's name for screen readers. */
  label: string;
  /** Each part's name in the legend, the tooltip and the description; its key otherwise. */
  legend?: Record<string, string>;
  formatValue?: (value: number) => string;
  height?: number;
}

/**
 * Stacked bars, sized from their card's width, with their own legend below (its users draw none).
 * Hovering (mouse or pen) or tapping a part shows "<bar> · <part> <value> of <total>", inside the
 * chart.
 */
export function StackedBarChart({
  bars,
  colors,
  label,
  legend = {},
  formatValue = String,
  height = 220,
}: StackedBarChartProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const width = useChartWidth(box);
  const [active, setActive] = useState<{ bar: number; key: string } | null>(null);
  const geometry = stackedBarGeometry(bars, width, height);
  const keys: string[] = [];
  for (const bar of bars) for (const part of bar.parts) if (!keys.includes(part.key)) keys.push(part.key);
  const name = (key: string) => legend[key] ?? key;

  const show = (at: { x: number; y: number }) => {
    // The part under the pointer, else the nearest one (distance to its box).
    const best = nearest(geometry.rects, (r) => {
      const dx = Math.max(r.x - at.x, 0, at.x - (r.x + r.width));
      const dy = Math.max(r.y - at.y, 0, at.y - (r.y + r.height));
      return dx * dx + dy * dy;
    });
    setActive(best ? { bar: best.bar, key: best.key } : null);
  };

  const activeRect = active ? geometry.rects.find((r) => r.bar === active.bar && r.key === active.key) : undefined;
  let tooltip: TooltipPlace | null = null;
  if (active && activeRect) {
    const bar = bars[active.bar];
    const part = bar.parts.find((p) => p.key === active.key)!;
    const total = bar.parts.reduce((sum, p) => sum + p.value, 0);
    tooltip = {
      // The first bar's details start at the left edge and the last one's end at the right.
      share: bars.length > 1 ? (active.bar / (bars.length - 1)) * 100 : 50,
      top: activeRect.y,
      below: activeRect.y < height / 3,
      lines: [`${bar.label} · ${name(part.key)} ${formatValue(part.value)} of ${formatValue(total)}`],
    };
  }

  return (
    <ChartFrame
      className="stacked-bar-chart"
      boxRef={box}
      label={label}
      description={describeBars(bars, legend, formatValue)}
      width={width}
      height={height}
      onPoint={show}
      onLeave={() => setActive(null)}
      legend={keys.map((key) => ({ key, label: name(key), color: colors[key] }))}
      tooltip={tooltip}
    >
      <YAxis ticks={geometry.yTicks} y={geometry.yScale} left={BAR_PADDING.left} right={width - BAR_PADDING.right} format={formatValue} />
      {geometry.rects.map((r) => (
        <rect
          key={`${r.bar}-${r.key}`}
          className={activeRect === r ? "chart-bar is-active" : "chart-bar"}
          x={px(r.x)}
          y={px(r.y)}
          width={px(r.width)}
          height={px(r.height)}
          fill={colors[r.key]}
        />
      ))}
      {bars.map((bar, i) => (
        <text
          key={i}
          className="chart-axis-text"
          x={px(BAR_PADDING.left + (i + 0.5) * geometry.slot)}
          y={height - BAR_PADDING.bottom / 2 + 2}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {bar.label}
        </text>
      ))}
    </ChartFrame>
  );
}

export default StackedBarChart;
