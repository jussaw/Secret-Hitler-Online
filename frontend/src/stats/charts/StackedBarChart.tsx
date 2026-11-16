import { useId, useRef, useState, type PointerEvent } from "react";
import { niceTicks } from "./axis";
import { useChartWidth } from "./useChartWidth";
import "./charts.css";

/** A bar: its label under it, and its parts, stacked bottom-up in order. */
export interface StackedBar {
  label: string;
  parts: { key: string; value: number }[];
}

/** Room round the plot, in px: the y axis's labels at the left, the bars' labels below. */
export const BAR_PADDING = { top: 8, right: 8, bottom: 24, left: 32 };

export interface StackedBarGeometry {
  yTicks: number[];
  /** Every part above zero, in px. */
  rects: { bar: number; key: string; x: number; y: number; width: number; height: number }[];
}

const px = (value: number) => Math.round(value * 100) / 100;

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
  return { yTicks, rects };
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
  const descriptionId = useId();
  const [active, setActive] = useState<{ bar: number; key: string } | null>(null);
  const geometry = stackedBarGeometry(bars, width, height);
  const bottom = height - BAR_PADDING.bottom;
  const scaleTop = geometry.yTicks[geometry.yTicks.length - 1] || 1;
  const yOf = (value: number) => bottom - (value / scaleTop) * (bottom - BAR_PADDING.top);
  const slot = bars.length > 0 ? (width - BAR_PADDING.left - BAR_PADDING.right) / bars.length : 0;
  const keys: string[] = [];
  for (const bar of bars) for (const part of bar.parts) if (!keys.includes(part.key)) keys.push(part.key);
  const name = (key: string) => legend[key] ?? key;

  const show = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (rect.width > 0 ? width / rect.width : 1);
    const y = (event.clientY - rect.top) * (rect.height > 0 ? height / rect.height : 1);
    let best: (typeof geometry.rects)[number] | null = null;
    let bestDistance = Infinity;
    for (const r of geometry.rects) {
      const dx = Math.max(r.x - x, 0, x - (r.x + r.width));
      const dy = Math.max(r.y - y, 0, y - (r.y + r.height));
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = r;
        bestDistance = distance;
      }
    }
    setActive(best ? { bar: best.bar, key: best.key } : null);
  };

  const activeRect = active ? geometry.rects.find((r) => r.bar === active.bar && r.key === active.key) : undefined;
  let line: string | null = null;
  let share = 0;
  if (active && activeRect) {
    const bar = bars[active.bar];
    const part = bar.parts.find((p) => p.key === active.key)!;
    const total = bar.parts.reduce((sum, p) => sum + p.value, 0);
    line = `${bar.label} · ${name(part.key)} ${formatValue(part.value)} of ${formatValue(total)}`;
    share = bars.length > 1 ? (active.bar / (bars.length - 1)) * 100 : 50;
  }
  const shown = Number(share.toFixed(2));

  return (
    <div className="chart stacked-bar-chart" ref={box}>
      <svg
        role="img"
        aria-label={label}
        aria-describedby={descriptionId}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ touchAction: "pan-y" }}
        onPointerMove={(event) => {
          if (event.pointerType !== "touch") show(event);
        }}
        onPointerDown={show}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null);
        }}
      >
        {geometry.yTicks.map((tick) => (
          <g key={tick}>
            <line className="chart-grid" x1={BAR_PADDING.left} x2={width - BAR_PADDING.right} y1={px(yOf(tick))} y2={px(yOf(tick))} />
            <text className="chart-axis-text" x={BAR_PADDING.left - 6} y={px(yOf(tick))} textAnchor="end" dominantBaseline="middle">
              {formatValue(tick)}
            </text>
          </g>
        ))}
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
            x={px(BAR_PADDING.left + (i + 0.5) * slot)}
            y={height - BAR_PADDING.bottom / 2 + 2}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {bar.label}
          </text>
        ))}
      </svg>
      <p className="chart-description" id={descriptionId}>
        {describeBars(bars, legend, formatValue)}
      </p>
      <ul className="chart-legend" aria-hidden="true">
        {keys.map((key) => (
          <li key={key}>
            <span className="chart-swatch" style={{ backgroundColor: colors[key] }} />
            {name(key)}
          </li>
        ))}
      </ul>
      {line && activeRect && (
        <div
          className="chart-tooltip"
          style={{
            left: `${shown}%`,
            top: `${px(activeRect.y)}px`,
            transform: `translateX(-${shown}%) translateY(${activeRect.y < height / 3 ? "6px" : "calc(-100% - 6px)"})`,
          }}
        >
          <div>{line}</div>
        </div>
      )}
    </div>
  );
}

export default StackedBarChart;
