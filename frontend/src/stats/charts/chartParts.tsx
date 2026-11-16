import { useId, type PointerEvent, type ReactNode, type RefObject } from "react";
import "./charts.css";

/**
 * What every hand-drawn chart shares (`LineChart`, `StackedBarChart`, and Phase 21's): the frame
 * with its image, description, legend and tooltip, the pointer in the chart's own px, and the
 * y axis.
 */

/** A coordinate rounded to hundredths, to keep the markup short. */
export const px = (value: number) => Math.round(value * 100) / 100;

/** The item of `items` at the least `distance`, or null when there are none. */
export function nearest<T>(items: T[], distance: (item: T) => number): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const d = distance(item);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

/** Where `event` is in the svg's own px, however large the svg is drawn. */
function pointerAt(event: PointerEvent<SVGSVGElement>, width: number, height: number): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const sx = rect.width > 0 ? width / rect.width : 1;
  const sy = rect.height > 0 ? height / rect.height : 1;
  return { x: (event.clientX - rect.left) * sx, y: (event.clientY - rect.top) * sy };
}

/** A legend entry: a swatch of `color` and the `label`. */
export interface LegendItem {
  key: string;
  label: string;
  color: string;
}

/** Where the details go: `share` (0 to 100) of the way across the chart, at `top` px. */
export interface TooltipPlace {
  share: number;
  top: number;
  /** Under `top` instead of over it, for a point near the top. */
  below: boolean;
  lines: string[];
}

/** The y axis: a grid line and a label per tick, the labels right-aligned before `left`. */
export function YAxis({
  ticks,
  y,
  left,
  right,
  format,
}: {
  ticks: number[];
  y: (value: number) => number;
  left: number;
  right: number;
  format: (value: number) => string;
}): JSX.Element {
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="chart-grid" x1={left} x2={right} y1={px(y(tick))} y2={px(y(tick))} />
          <text className="chart-axis-text" x={left - 6} y={px(y(tick))} textAnchor="end" dominantBaseline="middle">
            {format(tick)}
          </text>
        </g>
      ))}
    </>
  );
}

export interface ChartFrameProps {
  /** The chart's own class beside `chart`. */
  className: string;
  /** The box the chart measures its width from (`useChartWidth`). */
  boxRef: RefObject<HTMLDivElement>;
  /** The chart's name for screen readers. */
  label: string;
  /** What a screen reader reads for the chart. */
  description: string;
  width: number;
  height: number;
  /** The pointer at `at`, in the chart's px: a mouse or pen hovering, or any tap. */
  onPoint: (at: { x: number; y: number }) => void;
  /** A mouse left the chart. */
  onLeave: () => void;
  legend: LegendItem[];
  tooltip: TooltipPlace | null;
  children: ReactNode;
}

/**
 * A chart's frame: an svg image `width` px wide in its own coordinates (drawn at 100% of its box),
 * described in words, with the legend below it and the tooltip over it. A sideways drag on a phone
 * scrolls nothing, so a tap can read the chart; a vertical one still scrolls the page.
 */
export function ChartFrame({
  className,
  boxRef,
  label,
  description,
  width,
  height,
  onPoint,
  onLeave,
  legend,
  tooltip,
  children,
}: ChartFrameProps): JSX.Element {
  const descriptionId = useId();
  const share = tooltip ? px(Math.min(100, Math.max(0, tooltip.share))) : 0;
  return (
    <div className={`chart ${className}`} ref={boxRef}>
      <svg
        role="img"
        aria-label={label}
        aria-describedby={descriptionId}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ touchAction: "pan-y" }}
        onPointerMove={(event) => {
          if (event.pointerType !== "touch") onPoint(pointerAt(event, width, height));
        }}
        onPointerDown={(event) => onPoint(pointerAt(event, width, height))}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") onLeave();
        }}
      >
        {children}
      </svg>
      <p className="chart-description" id={descriptionId}>
        {description}
      </p>
      <ul className="chart-legend" aria-hidden="true">
        {legend.map((item) => (
          <li key={item.key}>
            <span className="chart-swatch" style={{ backgroundColor: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
      {tooltip && (
        <div
          className="chart-tooltip"
          style={{
            left: `${share}%`,
            top: `${px(tooltip.top)}px`,
            transform: `translateX(-${share}%) translateY(${tooltip.below ? "10px" : "calc(-100% - 10px)"})`,
          }}
        >
          {tooltip.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
