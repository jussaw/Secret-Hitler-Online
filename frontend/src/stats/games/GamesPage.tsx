import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import PlayerName from "../PlayerName";
import { OUTCOMES, type Outcome } from "../record";
import { navigate, routePath, useLocation, type PageProps } from "../routes";
import StatsLink from "../StatsLink";
import GameRow from "./GameRow";
import {
  CPU_CHOICES,
  ENDING_PARAM,
  endingFromParam,
  filterGames,
  gamesFilterSearch,
  isFiltered,
  NO_GAMES_FILTER,
  parseGamesFilter,
  PER_PAGE,
  SEAT_COUNTS,
  type CpuChoice,
  type GamesFilter,
  type PerPage,
} from "./gamesFilter";
import { gamesSummary, pageCount, pageLinks } from "./pages";
import "./GamesPage.css";

const GAMES_PATH = routePath({ page: "games" });

/** Each ending's name in the Ending select. */
const ENDING_LABEL: Record<Outcome, string> = {
  LIBERAL_POLICIES: "Liberal policies",
  HITLER_EXECUTED: "Hitler executed",
  FASCIST_POLICIES: "Fascist policies",
  HITLER_ELECTED: "Hitler elected",
  UNFINISHED: "Unfinished",
};

/** Each choice's name in the Bots (CPU players) select. */
const CPU_LABEL: Record<CpuChoice, string> = {
  any: "With or without CPU",
  without: "Without Bots",
  with: "With Bots",
};

/** GAMES' address for `filter`. */
function gamesHref(filter: GamesFilter): string {
  return GAMES_PATH + gamesFilterSearch(filter);
}

/**
 * A day the address can take from a date field: none (`""`), or a whole day of a year from 1000.
 * A date field reports a day as each part is typed, so typing 2026 reports the years 2, 20 and 202
 * first; those are kept in the field until the year is whole, not put in the address.
 */
const WHOLE_DAY = /^[1-9]\d{3}-\d{2}-\d{2}$/;

/** How long a date field waits after the last part typed before it puts the day in the address. */
const DAY_SETTLE_MS = 800;

/**
 * From or To: a date field and its label. What is typed stays in the field, and reaches the
 * address once it is a whole day (or empty) and typing has paused for DAY_SETTLE_MS, or at once on
 * Enter or on leaving the field. So a day typed part by part (the 1st, then the 14th) is one step
 * back, not one per part. Leaving the field with no whole day in it puts back the address's day.
 */
function DateField(props: {
  label: string;
  value: string | null;
  min?: string | null;
  max?: string | null;
  onDay: (day: string | null) => void;
}): JSX.Element {
  const { label, value, min, max, onDay } = props;
  const [draft, setDraft] = useState(value ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setDraft(value ?? ""), [value]);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  /** Puts `typed` in the address if it is a day the address can take; false if it is not. */
  const commit = (typed: string): boolean => {
    cancel();
    if (typed !== "" && !WHOLE_DAY.test(typed)) return false;
    if (typed !== (value ?? "")) onDay(typed === "" ? null : typed);
    return true;
  };
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    setDraft(typed);
    cancel();
    if (typed === "" || WHOLE_DAY.test(typed)) timer.current = setTimeout(() => commit(typed), DAY_SETTLE_MS);
  };
  return (
    <label className="games-field games-date">
      <span className="games-field-label">{label}</span>
      <input
        type="date"
        value={draft}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={change}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(draft);
        }}
        onBlur={() => {
          if (!commit(draft)) setDraft(value ?? "");
        }}
      />
    </label>
  );
}

/** Previous on the first page, or Next on the last: a link with nowhere to go, announced as unavailable. */
function DisabledLink({ text }: { text: string }): JSX.Element {
  return (
    <span role="link" aria-disabled="true">
      {text}
    </span>
  );
}

/**
 * GAMES (`/stats/games`): every recorded game, newest first, under its own filter in the address
 * (`gamesFilter.ts`), 20, 50 or 100 to a page. Player numbers the response does not have are
 * dropped, and a page past the last shows the last. Every control moves to a new address, back to
 * page 1 for anything but a page link; a new page brings the summary line into view, since
 * `navigate` keeps the scroll position for a change of search.
 */
export default function GamesPage({ data }: PageProps): JSX.Element {
  const { search } = useLocation();
  const playersLabel = useId();
  const names = useMemo(() => new Map(data.players.map((p) => [p.number, p.name])), [data.players]);
  const { filter, games } = useMemo(() => {
    const parsed = parseGamesFilter(search);
    const known: GamesFilter = { ...parsed, players: parsed.players.filter((n) => names.has(n)) };
    return { filter: known, games: filterGames(data.games, known) };
  }, [data.games, names, search]);

  const pageTotal = pageCount(games.length, filter.per);
  const page = Math.min(filter.page, pageTotal);
  const start = (page - 1) * filter.per;
  const shown = games.slice(start, start + filter.per);
  const filtered = isFiltered(filter);
  const summary = gamesSummary(data.games.length, games.length, shown.length > 0 ? start + 1 : 0, start + shown.length, filtered);

  // A new page of the same filter brings the summary line, and the list under it, into view.
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const filterKey = gamesFilterSearch({ ...filter, page: 1 });
  const lastShown = useRef<{ filterKey: string; page: number } | null>(null);
  useEffect(() => {
    const before = lastShown.current;
    lastShown.current = { filterKey, page };
    if (before !== null && before.filterKey === filterKey && before.page !== page) {
      summaryRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [filterKey, page]);

  /** Moves to the filter with `change`, on its first page. */
  const applyFilter = (change: Partial<GamesFilter>) => navigate(gamesHref({ ...filter, ...change, page: 1 }));

  const others = data.players
    .filter((p) => !filter.players.includes(p.number))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "accent" }) || a.number - b.number);

  const pageLink = (n: number, text: string) => (
    <StatsLink key={`${text}-${n}`} href={gamesHref({ ...filter, page: n })}>
      {text}
    </StatsLink>
  );

  if (data.games.length === 0) {
    return (
      <div className="games-page">
        <p className="games-summary">{summary}</p>
      </div>
    );
  }

  return (
    <div className="games-page">
      <section className="stats-card games-filter" aria-label="Filter games">
        <div className="games-players" role="group" aria-labelledby={playersLabel}>
          <span className="games-field-label" id={playersLabel}>
            Players
          </span>
          {filter.players.map((number) => {
            const name = names.get(number)!;
            return (
              <button
                key={number}
                type="button"
                className="games-chip"
                aria-label={`Remove ${name}`}
                onClick={() => applyFilter({ players: filter.players.filter((n) => n !== number) })}
              >
                <PlayerName player={number} name={name} link={false} />
                <X aria-hidden="true" size={16} strokeWidth={2.5} />
              </button>
            );
          })}
          <select
            className="games-add"
            aria-label="Add a player"
            value=""
            disabled={others.length === 0}
            onChange={(event) => {
              const n = Number(event.target.value);
              if (n > 0) applyFilter({ players: [...filter.players, n].sort((a, b) => a - b) });
            }}
          >
            <option value="">Add a player</option>
            {others.map((p) => (
              <option key={p.number} value={p.number}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="games-controls">
          <DateField label="From" value={filter.from} max={filter.to} onDay={(from) => applyFilter({ from })} />
          <DateField label="To" value={filter.to} min={filter.from} onDay={(to) => applyFilter({ to })} />
          <select
            aria-label="Seats"
            value={filter.size === null ? "" : String(filter.size)}
            onChange={(event) => applyFilter({ size: event.target.value === "" ? null : Number(event.target.value) })}
          >
            <option value="">Any size</option>
            {SEAT_COUNTS.map((size) => (
              <option key={size} value={size}>
                {`${size} seats`}
              </option>
            ))}
          </select>
          <select
            aria-label="Ending"
            value={filter.ending === null ? "" : ENDING_PARAM[filter.ending]}
            onChange={(event) => applyFilter({ ending: endingFromParam(event.target.value) })}
          >
            <option value="">Any ending</option>
            {OUTCOMES.map((outcome) => (
              <option key={outcome} value={ENDING_PARAM[outcome]}>
                {ENDING_LABEL[outcome]}
              </option>
            ))}
          </select>
          <select
            className="games-cpu"
            aria-label="Bots"
            value={filter.cpu}
            onChange={(event) => applyFilter({ cpu: event.target.value as CpuChoice })}
          >
            {CPU_CHOICES.map((cpu) => (
              <option key={cpu} value={cpu}>
                {CPU_LABEL[cpu]}
              </option>
            ))}
          </select>
          {filtered && (
            <StatsLink href={gamesHref({ ...NO_GAMES_FILTER, per: filter.per })} className="stats-link games-clear">
              Clear filters
            </StatsLink>
          )}
        </div>
      </section>

      <div className="games-summary-row">
        <p className="games-summary" ref={summaryRef} aria-live="polite">
          {summary}
        </p>
        <select
          className="games-per"
          aria-label="Games a page"
          value={String(filter.per)}
          onChange={(event) => applyFilter({ per: Number(event.target.value) as PerPage })}
        >
          {PER_PAGE.map((per) => (
            <option key={per} value={per}>
              {`${per} a page`}
            </option>
          ))}
        </select>
      </div>

      {shown.length > 0 ? (
        // role="list": Safari drops a list's role when it has no bullets.
        <ol className="games-list" role="list">
          {shown.map((record) => (
            <GameRow key={record.id} record={record} />
          ))}
        </ol>
      ) : (
        <div className="stats-card">
          <p>No games match these filters.</p>
        </div>
      )}

      {pageTotal > 1 && (
        <nav className="games-pages" aria-label="Pages">
          {page > 1 ? pageLink(page - 1, "‹ Previous") : <DisabledLink text="‹ Previous" />}
          {pageLinks(page, pageTotal).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="games-gap">
                …
              </span>
            ) : n === page ? (
              <span key={n} aria-current="page">
                {n}
              </span>
            ) : (
              pageLink(n, String(n))
            )
          )}
          {page < pageTotal ? pageLink(page + 1, "Next ›") : <DisabledLink text="Next ›" />}
        </nav>
      )}
    </div>
  );
}
