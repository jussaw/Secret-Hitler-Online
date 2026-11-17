import { localDaysBetween, type Rate } from "../counting";
import { viewerTimeZone } from "../format";
import { formatSigned } from "../numbers";
import { NO_VALUE, rateText } from "../tabs/cellText";

/**
 * The words PLAYERS and a player's page share: rates, points, short dates and when someone last
 * played. Every local date takes the time zone, the viewer's by default, so tests pass one.
 */

/** A rate as a whole percent, or below its minimum `NO_VALUE` and its chances: "83%", "— (1)". */
export function formatRate(rate: Rate): string {
  return rate.value === null ? `${NO_VALUE} (${rate.chances})` : rateText(rate.value);
}

/** A share as signed percentage points, rounded: "+7%", "−3%", "0%". */
export function formatPoints(fraction: number): string {
  return `${formatSigned(fraction * 100)}%`;
}

const shortDates = new Map<string, Intl.DateTimeFormat>();

/** The day, month and year of `ms` in `timeZone`, from a formatter made once per zone. */
function dateParts(ms: number, timeZone: string): { day: string; month: string; year: string } {
  let format = shortDates.get(timeZone);
  if (!format) {
    // English month names as `format.ts` writes them on the other stats pages ("Sep", not "Sept").
    format = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone });
    shortDates.set(timeZone, format);
  }
  const out = { day: "", month: "", year: "" };
  for (const part of format.formatToParts(ms)) {
    if (part.type === "day" || part.type === "month" || part.type === "year") out[part.type] = part.value;
  }
  return out;
}

/** The local day of `ms`, "2 Oct", with the year when it is not `now`'s year: "2 Oct 2025". */
export function formatShortDate(ms: number, now: number, timeZone: string = viewerTimeZone()): string {
  const { day, month, year } = dateParts(ms, timeZone);
  const short = `${day} ${month}`;
  return year === dateParts(now, timeZone).year ? short : `${short} ${year}`;
}

/** How long ago `ms` was, in local days up to `now`: "today", "yesterday", "3 days ago". */
export function formatLastPlayed(ms: number, now: number, timeZone: string = viewerTimeZone()): string {
  const days = localDaysBetween(ms, now, timeZone);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
