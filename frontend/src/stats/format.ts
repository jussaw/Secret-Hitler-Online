import type { BotSkill, GameRecord, Side } from "./record";

/**
 * The stats' words for results, lengths, counts and local times. Every local-time function takes
 * the time zone, the viewer's by default, so tests pass one instead of setting the process's.
 * The words are English whatever the machine's locale.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** The viewer's time zone, as the browser reports it. */
export function viewerTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** An English formatter of `options` in `timeZone`, made once per zone and kind. */
function formatter(kind: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${kind} ${timeZone}`;
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    formatters.set(key, found);
  }
  return found;
}

/** The parts of `ms` as `format` gives them, by type. */
function parts(format: Intl.DateTimeFormat, ms: number): Partial<Record<Intl.DateTimeFormatPartTypes, string>> {
  const out: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of format.formatToParts(ms)) out[part.type] = part.value;
  return out;
}

/** The day `ms` falls on in `timeZone`, as `YYYY-MM-DD`. */
export function localDayKey(ms: number, timeZone: string = viewerTimeZone()): string {
  const p = parts(formatter("day", timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }), ms);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The date `ms` falls on in `timeZone`: "Sat 14 Nov 2026". */
export function formatLocalDate(ms: number, timeZone: string = viewerTimeZone()): string {
  const p = parts(
    formatter("date", timeZone, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    ms
  );
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

/** The time of `ms` in `timeZone`, on a 12-hour clock: "9:42 PM". */
export function formatLocalTime(ms: number, timeZone: string = viewerTimeZone()): string {
  const p = parts(formatter("time", timeZone, { hour: "numeric", minute: "2-digit", hour12: true }), ms);
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/** The date and time of `ms` in `timeZone`: "Sat 14 Nov 2026, 9:42 PM". */
export function formatLocalDateTime(ms: number, timeZone: string = viewerTimeZone()): string {
  return `${formatLocalDate(ms, timeZone)}, ${formatLocalTime(ms, timeZone)}`;
}

/** A length in whole minutes, rounded: "38 min", or from an hour "1 h 05 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** A count and its noun, with an "s" unless the count is one: "1 round", "7 rounds". */
export function plural(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}

/** The winners' word in a result: "Liberals" or "Fascists". */
export function sideWord(side: Side): string {
  return side === "LIBERAL" ? "Liberals" : "Fascists";
}

const BOT_WORDS: Record<BotSkill, string> = { EASY: "Easy bots", NORMAL: "Normal bots", HARD: "Hard bots" };

/**
 * A game's bots as the stats pages tag them: "Easy bots", "Normal bots" or "Hard bots", or "Bots"
 * for no level (a format 1 record, recorded before levels were kept).
 */
export function botsLabel(skill: BotSkill | null): string {
  return skill === null ? "Bots" : BOT_WORDS[skill];
}

/**
 * A game's result: "Liberals win · 5 Liberal policies", "Liberals win · Hitler executed",
 * "Fascists win · 6 Fascist policies", "Fascists win · Hitler elected", or for a game the lobby
 * closed on, "Unfinished after round 6 · 4 L, 3 F".
 */
export function outcomeLabel(record: GameRecord): string {
  switch (record.outcome) {
    case "LIBERAL_POLICIES":
      return `${sideWord("LIBERAL")} win · ${record.liberalPolicies} Liberal policies`;
    case "HITLER_EXECUTED":
      return `${sideWord("LIBERAL")} win · Hitler executed`;
    case "FASCIST_POLICIES":
      return `${sideWord("FASCIST")} win · ${record.fascistPolicies} Fascist policies`;
    case "HITLER_ELECTED":
      return `${sideWord("FASCIST")} win · Hitler elected`;
    case "UNFINISHED":
      return `Unfinished after round ${record.rounds} · ${record.liberalPolicies} L, ${record.fascistPolicies} F`;
  }
}
