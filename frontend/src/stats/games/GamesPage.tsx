import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import PlayerName from "../PlayerName";
import { OUTCOMES, type Outcome } from "../record";
import { navigate, routePath, useLocation, type PageProps } from "../routes";
import StatsLink from "../StatsLink";
import GameRow from "./GameRow";
import {
  ENDING_PARAM,
  filterGames,
  gamesFilterSearch,
  isFiltered,
  parseGamesFilter,
  PER_PAGE,
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

const SIZES = [5, 6, 7, 8, 9, 10];

const CPU_LABEL: [CpuChoice, string][] = [
  ["any", "With or without CPU"],
  ["without", "Without CPU players"],
  ["with", "With CPU players"],
];

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

/**
 * From or To: a date field and its label. What is typed stays in the field and reaches the
 * address once it is a whole day, or empty; leaving the field puts back the address's day.
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
  useEffect(() => setDraft(value ?? ""), [value]);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    setDraft(typed);
    if (typed === "") onDay(null);
    else if (WHOLE_DAY.test(typed)) onDay(typed);
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
        onBlur={() => setDraft(value ?? "")}
      />
    </label>
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

  const count = pageCount(games.length, filter.per);
  const page = Math.min(filter.page, count);
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
  const go = (change: Partial<GamesFilter>) => navigate(gamesHref({ ...filter, ...change, page: 1 }));

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
                onClick={() => go({ players: filter.players.filter((n) => n !== number) })}
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
              if (n > 0) go({ players: [...filter.players, n].sort((a, b) => a - b) });
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
          <DateField label="From" value={filter.from} max={filter.to} onDay={(from) => go({ from })} />
          <DateField label="To" value={filter.to} min={filter.from} onDay={(to) => go({ to })} />
          <select
            aria-label="Seats"
            value={filter.size === null ? "" : String(filter.size)}
            onChange={(event) => go({ size: event.target.value === "" ? null : Number(event.target.value) })}
          >
            <option value="">Any size</option>
            {SIZES.map((size) => (
              <option key={size} value={size}>
                {`${size} seats`}
              </option>
            ))}
          </select>
          <select
            aria-label="Ending"
            value={filter.ending === null ? "" : ENDING_PARAM[filter.ending]}
            onChange={(event) => go({ ending: OUTCOMES.find((o) => ENDING_PARAM[o] === event.target.value) ?? null })}
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
            aria-label="CPU players"
            value={filter.cpu}
            onChange={(event) => go({ cpu: event.target.value as CpuChoice })}
          >
            {CPU_LABEL.map(([cpu, label]) => (
              <option key={cpu} value={cpu}>
                {label}
              </option>
            ))}
          </select>
          {filtered && (
            <StatsLink href={GAMES_PATH} className="stats-link games-clear">
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
          onChange={(event) => go({ per: Number(event.target.value) as PerPage })}
        >
          {PER_PAGE.map((per) => (
            <option key={per} value={per}>
              {`${per} a page`}
            </option>
          ))}
        </select>
      </div>

      {shown.length > 0 ? (
        <ol className="games-list">
          {shown.map((record) => (
            <GameRow key={record.id} record={record} />
          ))}
        </ol>
      ) : (
        <div className="stats-card">
          <p>No games match these filters.</p>
        </div>
      )}

      {count > 1 && (
        <nav className="games-pages" aria-label="Pages">
          {page > 1 ? pageLink(page - 1, "‹ Previous") : <span aria-disabled="true">‹ Previous</span>}
          {pageLinks(page, count).map((n, i) =>
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
          {page < count ? pageLink(page + 1, "Next ›") : <span aria-disabled="true">Next ›</span>}
        </nav>
      )}
    </div>
  );
}
