import type { KeyboardEvent, ReactNode } from "react";
import "./ChartFocus.css";

export interface ChartFocusProps {
  /** The chart's own class: `bar-chart`, `calendar-heatmap`. */
  className: string;
  /** The chart's name, as its image has. */
  label: string;
  /** The details shown, which a screen reader hears as they change; "" for none. */
  status: string;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** The focus left: the chart lets its details go. */
  onBlur: () => void;
  children: ReactNode;
}

/**
 * The box of a chart whose keys move its details (`BarChart`, `CalendarHeatmap`): a group named by
 * the chart's label that takes the keyboard's focus, with the stats' focus outline, around the
 * chart's `ChartFrame`, and a hidden status line that a screen reader hears as the details change.
 */
export function ChartFocus({ className, label, status, onKeyDown, onBlur, children }: ChartFocusProps): JSX.Element {
  return (
    <div className={`chart-focus ${className}`} role="group" aria-label={label} tabIndex={0} onKeyDown={onKeyDown} onBlur={onBlur}>
      {children}
      <p className="chart-focus-status" role="status">
        {status}
      </p>
    </div>
  );
}

export default ChartFocus;
