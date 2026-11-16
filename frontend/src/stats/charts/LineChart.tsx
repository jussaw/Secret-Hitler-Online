import { useId, useRef, useState, type PointerEvent } from "react";
import { formatRating } from "../numbers";
import { niceTicks } from "./axis";
import { useChartWidth } from "./useChartWidth";
import "./charts.css";

/** A point of a line; `dashed` draws the segment that ends at it dashed (a provisional rating). */
export interface LinePoint {
  x: number;
  y: number;
  dashed?: boolean;
}

export interface LineSeries {
  key: string;
  label: string;
  points: LinePoint[];
}

/** Ten line colours that read on the dark card, the office orange first. */
export const SERIES_COLORS = [
  "#f08a5d",
  "#5a9ba6",
  "#e8604a",
  "#f6b53f",
  "#8cc084",
  "#c3a6e0",
  "#7abcca",
  "#e889b5",
  "#d9d4c7",
  "#b8a07a",
];

/** Room round the plot, in px: the y axis's labels at the left. */
export const LINE_PADDING = { top: 8, right: 8, bottom: 8, left: 40 };

export interface LineGeometry {
  xScale: (x: number) => number;
  yScale: (y: number) => number;
  yTicks: number[];
  /** Each series' runs of solid or dashed segments. */
  paths: { key: string; d: string; dashed: boolean }[];
  /** Every point, in px. */
  points: { key: string; index: number; x: number; y: number }[];
}

const px = (value: number) => Math.round(value * 100) / 100;

/**
 * Where everything goes in a `width` by `height` chart: x across the plot (every x the same puts
 * the points in its middle), y up it to `niceTicks`' range, and each series as runs of segments,
 * a segment dashed when its later point is.
 */
export function lineChartGeometry(series: LineSeries[], width: number, height: number): LineGeometry {
  const left = LINE_PADDING.left;
  const right = width - LINE_PADDING.right;
  const top = LINE_PADDING.top;
  const bottom = height - LINE_PADDING.bottom;
  const all = series.reduce<LinePoint[]>((out, s) => out.concat(s.points), []);
  if (all.length === 0) {
    const middle = (top + bottom) / 2;
    return { xScale: () => (left + right) / 2, yScale: () => middle, yTicks: [], paths: [], points: [] };
  }
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yTicks = niceTicks(Math.min(...ys), Math.max(...ys));
  const yLow = yTicks[0];
  const yHigh = yTicks[yTicks.length - 1];
  const xScale = (x: number) => (xMax === xMin ? (left + right) / 2 : left + ((x - xMin) / (xMax - xMin)) * (right - left));
  const yScale = (y: number) => bottom - ((y - yLow) / (yHigh - yLow)) * (bottom - top);

  const paths: LineGeometry["paths"] = [];
  const points: LineGeometry["points"] = [];
  for (const s of series) {
    s.points.forEach((p, index) => points.push({ key: s.key, index, x: xScale(p.x), y: yScale(p.y) }));
    let run: LinePoint[] = [];
    let dashed = false;
    const flush = () => {
      if (run.length > 1) {
        const d = run.map((p, i) => `${i === 0 ? "M" : "L"}${px(xScale(p.x))} ${px(yScale(p.y))}`).join(" ");
        paths.push({ key: s.key, d, dashed });
      }
    };
    s.points.forEach((p, i) => {
      if (i === 0) {
        run = [p];
        return;
      }
      const segmentDashed = p.dashed === true;
      if (run.length > 1 && segmentDashed !== dashed) {
        flush();
        run = [s.points[i - 1]];
      }
      dashed = segmentDashed;
      run.push(p);
    });
    flush();
  }
  return { xScale, yScale, yTicks, paths, points };
}

/** The words a screen reader reads: "<label>: from <first> to <last>, highest <max>." per series. */
export function describeLines(series: LineSeries[], formatY: (y: number) => string): string {
  return series
    .filter((s) => s.points.length > 0)
    .map((s) => {
      const first = s.points[0].y;
      const last = s.points[s.points.length - 1].y;
      const highest = Math.max(...s.points.map((p) => p.y));
      return `${s.label}: from ${formatY(first)} to ${formatY(last)}, highest ${formatY(highest)}.`;
    })
    .join(" ");
}

export interface LineChartProps {
  series: LineSeries[];
  /** The chart's name for screen readers. */
  label: string;
  /** A colour per series key; `SERIES_COLORS` in order otherwise. */
  colors?: Record<string, string>;
  formatY?: (y: number) => string;
  /** The tooltip's lines for a point: by default the series' label and the value. */
  detail?: (series: LineSeries, index: number) => string[];
  height?: number;
}

/** Where `event` is in the svg's own px (its viewBox is the measured width, so one to one). */
function pointerAt(event: PointerEvent<SVGSVGElement>, width: number, height: number): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const sx = rect.width > 0 ? width / rect.width : 1;
  const sy = rect.height > 0 ? height / rect.height : 1;
  return { x: (event.clientX - rect.left) * sx, y: (event.clientY - rect.top) * sy };
}

/**
 * Lines over x, sized from its card's width, each series in its colour and dashed where its points
 * say. Hovering (mouse or pen) or tapping shows the nearest point's details, which stay inside the
 * chart; a sideways drag on a phone scrolls nothing, a vertical one scrolls the page.
 */
export function LineChart({
  series,
  label,
  colors,
  formatY = formatRating,
  detail,
  height = 220,
}: LineChartProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const width = useChartWidth(box);
  const descriptionId = useId();
  const [active, setActive] = useState<{ key: string; index: number } | null>(null);
  const geometry = lineChartGeometry(series, width, height);
  const colorOf = (key: string) => {
    const at = series.findIndex((s) => s.key === key);
    return colors?.[key] ?? SERIES_COLORS[(at < 0 ? 0 : at) % SERIES_COLORS.length];
  };

  const show = (event: PointerEvent<SVGSVGElement>) => {
    const at = pointerAt(event, width, height);
    let best: (typeof geometry.points)[number] | null = null;
    let bestDistance = Infinity;
    for (const p of geometry.points) {
      const distance = (p.x - at.x) ** 2 + (p.y - at.y) ** 2;
      if (distance < bestDistance) {
        best = p;
        bestDistance = distance;
      }
    }
    setActive(best ? { key: best.key, index: best.index } : null);
  };

  const activeSeries = active ? series.find((s) => s.key === active.key) : undefined;
  const activePoint =
    active && activeSeries && active.index < activeSeries.points.length
      ? geometry.points.find((p) => p.key === active.key && p.index === active.index)
      : undefined;
  const lines =
    activeSeries && activePoint
      ? detail
        ? detail(activeSeries, activePoint.index)
        : [activeSeries.label, formatY(activeSeries.points[activePoint.index].y)]
      : null;
  const plotWidth = width - LINE_PADDING.left - LINE_PADDING.right;
  const share = activePoint
    ? Math.min(100, Math.max(0, plotWidth > 0 ? ((activePoint.x - LINE_PADDING.left) / plotWidth) * 100 : 50))
    : 0;
  const shown = Number(share.toFixed(2));
  const below = activePoint ? activePoint.y < height / 2 : false;

  return (
    <div className="chart line-chart" ref={box}>
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
            <line
              className="chart-grid"
              x1={LINE_PADDING.left}
              x2={width - LINE_PADDING.right}
              y1={px(geometry.yScale(tick))}
              y2={px(geometry.yScale(tick))}
            />
            <text className="chart-axis-text" x={LINE_PADDING.left - 6} y={px(geometry.yScale(tick))} textAnchor="end" dominantBaseline="middle">
              {formatY(tick)}
            </text>
          </g>
        ))}
        {geometry.paths.map((path, i) => (
          <path
            key={`${path.key}-${i}`}
            className={path.dashed ? "chart-line is-dashed" : "chart-line"}
            d={path.d}
            stroke={colorOf(path.key)}
          />
        ))}
        {series
          .filter((s) => s.points.length === 1)
          .map((s) => (
            <circle
              key={s.key}
              className="chart-dot"
              cx={px(geometry.xScale(s.points[0].x))}
              cy={px(geometry.yScale(s.points[0].y))}
              r={3.5}
              fill={colorOf(s.key)}
            />
          ))}
        {activePoint && (
          <circle className="chart-marker" cx={px(activePoint.x)} cy={px(activePoint.y)} r={5} fill={colorOf(activePoint.key)} />
        )}
      </svg>
      <p className="chart-description" id={descriptionId}>
        {describeLines(series, formatY)}
      </p>
      <ul className="chart-legend" aria-hidden="true">
        {series.map((s) => (
          <li key={s.key}>
            <span className="chart-swatch" style={{ backgroundColor: colorOf(s.key) }} />
            {s.label}
          </li>
        ))}
      </ul>
      {lines && activePoint && (
        <div
          className="chart-tooltip"
          style={{
            left: `${shown}%`,
            top: `${px(activePoint.y)}px`,
            transform: `translateX(-${shown}%) translateY(${below ? "12px" : "calc(-100% - 12px)"})`,
          }}
        >
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LineChart;
