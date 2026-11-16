import { useRef, useState, type KeyboardEvent } from "react";
import { countLabel, weekdayOf, type Heatmap } from "../activity";
import { ChartFocus } from "./ChartFocus";
import { ChartFrame, px, type TooltipPlace } from "./chartParts";
import { useChartWidth } from "./useChartWidth";
import "./CalendarHeatmap.css";

/** A day's fill by its shade, 0 (no games) to 4 (the busiest quarter): dark card to office orange. */
export const HEAT_COLORS = ["#4d4945", "#6e4a39", "#94573d", "#c26b45", "#f08a5d"];

const GAMES: [string, string] = ["game", "games"];
/** The weekday labels' gutter at the left and the month labels' room at the top, in px. */
const GUTTER = 28;
const HEAD = 16;
/** The largest cell pitch, and the smallest that leaves room for the weekday labels. */
const MAX_PITCH = 16;
const WEEKDAY_PITCH = 7;
/**
 * The room a month's name takes, in px, with a gap after it (the widest, "May" at 11px, is about
 * 25px): a name closer than this to the last one is skipped.
 */
const MONTH_ROOM = 28;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_ROWS: [number, string][] = [
  [0, "Mon"],
  [2, "Wed"],
  [4, "Fri"],
];

/** The words a screen reader reads for a view. */
function describe(heatmap: Heatmap): string {
  if (heatmap.games === 0) return "No games.";
  return (
    `${countLabel(heatmap.games, GAMES)} on ${countLabel(heatmap.activeDays, ["day", "days"])}; ` +
    `busiest ${heatmap.busiestDay} with ${countLabel(heatmap.busiest, GAMES)}.`
  );
}

/**
 * One view of the calendar: a column per week (Monday on top), a cell per day of the view in its
 * shade, sized from the card's width up to 16px a cell, with the months' names above and Mon, Wed
 * and Fri at the left where they fit. Hovering (mouse or pen) or tapping a day, or the arrow keys
 * once the chart has the focus (up and down a day, left and right a week), show its date and
 * games, and tell a screen reader (`ChartFocus`). The image is as wide as its box, the cells drawn
 * from its left.
 */
export function CalendarHeatmap({ heatmap, label }: { heatmap: Heatmap; label: string }): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const width = useChartWidth(box, 320);
  const [picked, setPicked] = useState<number | null>(null);
  const { days } = heatmap;
  const offset = days.length > 0 ? weekdayOf(days[0].key) : 0;
  const columns = Math.max(1, Math.ceil((offset + days.length) / 7));
  const pitch = Math.min(MAX_PITCH, (width - GUTTER) / columns);
  const side = 0.85 * pitch;
  const height = px(HEAD + 7 * pitch);
  const name = `${label}, ${heatmap.label}`;
  const active = picked !== null && picked < days.length ? picked : null;
  const place = (i: number) => {
    const at = offset + i;
    return { x: GUTTER + Math.floor(at / 7) * pitch, y: HEAD + (at % 7) * pitch };
  };

  const show = ({ x, y }: { x: number; y: number }) => {
    const column = Math.floor((x - GUTTER) / pitch);
    const row = Math.floor((y - HEAD) / pitch);
    const i = column * 7 + row - offset;
    const inside = x >= GUTTER && y >= HEAD && column < columns && row < 7 && i >= 0 && i < days.length;
    setPicked(inside ? i : null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (days.length === 0) return;
    const last = days.length - 1;
    const moves: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key in moves) next = active === null ? last : Math.min(last, Math.max(0, active + moves[event.key]));
    else return;
    event.preventDefault();
    setPicked(next);
  };

  let tooltip: TooltipPlace | null = null;
  if (active !== null) {
    const day = days[active];
    const { x, y } = place(active);
    tooltip = {
      share: ((x + side / 2) / width) * 100,
      top: y,
      below: y < height / 3,
      lines: [`${day.long}: ${day.games ? countLabel(day.games, GAMES) : "no games"}`],
    };
  }

  // Each month's name over the column of its first day, unless it would crowd the last one drawn.
  const months: { x: number; text: string }[] = [];
  days.forEach((day, i) => {
    if (!day.key.endsWith("-01")) return;
    const x = Math.min(place(i).x, width - MONTH_ROOM);
    const before = months[months.length - 1];
    if (before && x - before.x < MONTH_ROOM) return;
    months.push({ x, text: MONTHS[Number(day.key.slice(5, 7)) - 1] });
  });

  return (
    <ChartFocus
      className="calendar-heatmap"
      label={name}
      status={tooltip ? tooltip.lines.join(" ") : ""}
      onKeyDown={onKeyDown}
      onBlur={() => setPicked(null)}
    >
      <ChartFrame
        className="calendar-heatmap-frame"
        boxRef={box}
        label={name}
        description={describe(heatmap)}
        width={width}
        height={height}
        onPoint={show}
        onLeave={() => setPicked(null)}
        legend={[]}
        tooltip={tooltip}
      >
        {months.map((month) => (
          <text key={month.x} className="chart-axis-text month-label" x={px(month.x)} y={HEAD / 2} dominantBaseline="middle">
            {month.text}
          </text>
        ))}
        {pitch >= WEEKDAY_PITCH &&
          WEEKDAY_ROWS.map(([row, text]) => (
            <text
              key={text}
              className="chart-axis-text weekday-label"
              x={GUTTER - 4}
              y={px(HEAD + (row + 0.5) * pitch)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {text}
            </text>
          ))}
        {days.map((day, i) => {
          const { x, y } = place(i);
          return (
            <rect
              key={day.key}
              className={i === active ? "day is-active" : "day"}
              data-day={day.key}
              data-shade={day.shade}
              x={px(x)}
              y={px(y)}
              width={px(side)}
              height={px(side)}
              rx={px(Math.min(2, side / 4))}
              fill={HEAT_COLORS[day.shade]}
            />
          );
        })}
      </ChartFrame>
    </ChartFocus>
  );
}

export default CalendarHeatmap;
