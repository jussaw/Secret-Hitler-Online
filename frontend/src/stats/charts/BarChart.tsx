import { useRef, useState, type KeyboardEvent } from "react";
import { countLabel } from "../activity";
import { ChartFrame, px, YAxis, type TooltipPlace } from "./chartParts";
import { useChartWidth } from "./useChartWidth";
import "./BarChart.css";

/** A bar: its label under it, its long label in the tooltip and the description, and its value. */
export interface Bar {
  label: string;
  long?: string;
  value: number;
}

export interface BarChartProps {
  bars: Bar[];
  /** The chart's name for screen readers. */
  label: string;
  /** The value's noun, one and many: `["game", "games"]`. */
  unit: [string, string];
  /** The bars' colour, the office orange by default. */
  color?: string;
}

/** The office orange. */
const OFFICE = "#f08a5d";
/** The plot's left edge (the y axis's labels before it), top edge, and the x labels' room below it. */
const LEFT = 32;
const TOP = 8;
const BOTTOM = 20;
/** About how wide a character of the axis text is, in px, and the room kept between two labels. */
const CHAR = 7;
const GAP = 8;

/** The bars' places in a `width` by `height` chart: one slot each, the bar 80% of it. */
function geometry(bars: Bar[], width: number, height: number) {
  const n = bars.length;
  const slot = n > 0 ? (width - LEFT) / n : 0;
  const most = bars.reduce((m, bar) => Math.max(m, bar.value), 0);
  const base = height - BOTTOM;
  const scale = (value: number) => (Math.max(0, value) / Math.max(1, most)) * (base - TOP);
  const rects = bars.map((bar, i) => {
    const h = scale(bar.value);
    return { x: LEFT + i * slot + 0.1 * slot, y: base - h, width: 0.8 * slot, height: h };
  });
  const longest = bars.reduce((m, bar) => Math.max(m, bar.label.length), 0);
  const step = Math.max(1, Math.ceil((n * (CHAR * longest + GAP)) / (width - LEFT)));
  return { slot, most, base, scale, rects, step, half: (CHAR * longest) / 2 };
}

/**
 * Bars sized from their card's width: the y axis's 0 and maximum at the left, as many x labels as
 * fit under them. Hovering (mouse or pen) or tapping a bar, or the arrow keys once the chart has
 * the focus, show "<long label>: <count>" over it, inside the chart. The focus is on the chart's
 * own box, a group named by its label around the image.
 */
export function BarChart({ bars, label, unit, color = OFFICE }: BarChartProps): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const width = useChartWidth(box, 320);
  const height = Math.round(Math.min(220, Math.max(120, 0.4 * width)));
  const [picked, setPicked] = useState<number | null>(null);
  const g = geometry(bars, width, height);
  const n = bars.length;
  const active = picked !== null && picked < n ? picked : null;

  const show = (at: { x: number }) => {
    if (n === 0) return;
    setPicked(Math.min(n - 1, Math.max(0, Math.floor((at.x - LEFT) / g.slot))));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = active === null ? 0 : Math.min(n - 1, active + 1);
        break;
      case "ArrowLeft":
        next = active === null ? n - 1 : Math.max(0, active - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = n - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setPicked(next);
  };

  let tooltip: TooltipPlace | null = null;
  if (active !== null) {
    const bar = bars[active];
    const rect = g.rects[active];
    tooltip = {
      share: ((rect.x + rect.width / 2) / width) * 100,
      top: rect.y,
      below: rect.y < height / 3,
      lines: [`${bar.long ?? bar.label}: ${countLabel(bar.value, unit)}`],
    };
  }

  const ticks = g.most > 0 ? [0, g.most] : [0];
  return (
    <div className="bar-chart" role="group" aria-label={label} tabIndex={0} onKeyDown={onKeyDown} onBlur={() => setPicked(null)}>
      <ChartFrame
        className="bar-chart-frame"
        boxRef={box}
        label={label}
        description={bars.map((bar) => `${bar.long ?? bar.label} ${bar.value}`).join(", ")}
        width={width}
        height={height}
        onPoint={show}
        onLeave={() => setPicked(null)}
        legend={[]}
        tooltip={tooltip}
      >
        <YAxis ticks={ticks} y={(value) => g.base - g.scale(value)} left={LEFT} right={width} format={String} />
        {g.rects.map((r, i) => (
          <rect
            key={i}
            className={i === active ? "chart-bar bar is-active" : "chart-bar bar"}
            x={px(r.x)}
            y={px(r.y)}
            width={px(r.width)}
            height={px(r.height)}
            fill={color}
          />
        ))}
        {bars.map((bar, i) =>
          i % g.step === 0 ? (
            <text
              key={i}
              className="chart-axis-text x-label"
              // Centred under its bar, but never past either edge of the chart.
              x={px(Math.min(width - g.half, Math.max(g.half, LEFT + (i + 0.5) * g.slot)))}
              y={height - BOTTOM / 2}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {bar.label}
            </text>
          ) : null
        )}
      </ChartFrame>
    </div>
  );
}

export default BarChart;
