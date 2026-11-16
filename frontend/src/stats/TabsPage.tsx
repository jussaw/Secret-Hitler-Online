import { useId } from "react";
import { formatLocalDateTime, outcomeLabel } from "./format";
import type { GameRecord } from "./record";
import { routePath, type PageProps } from "./routes";
import StatsLink from "./StatsLink";
import "./TabsPage.css";

/** Newest first: by `endedAt`, then `id`. */
function newestFirst(a: GameRecord, b: GameRecord): number {
  if (a.endedAt !== b.endedAt) return b.endedAt - a.endedAt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * The stats' home and its tabs (`/stats`, `/stats/<tab>`). A placeholder until the tabs come
 * (Phase 17A fills it): the ten latest games, each a link to its page, and a link to GAMES.
 */
export default function TabsPage({ data }: PageProps): JSX.Element {
  const titleId = useId();
  const latest = [...data.games].sort(newestFirst).slice(0, 10);
  return (
    <section className="stats-card latest-games" aria-labelledby={titleId}>
      <h2 className="stats-card-title" id={titleId}>
        LATEST GAMES
      </h2>
      {latest.length === 0 ? (
        <p>No games recorded yet.</p>
      ) : (
        <ul className="latest-games-list">
          {latest.map((record) => (
            <li key={record.id}>
              <StatsLink href={routePath({ page: "game", id: record.id })} className="latest-games-link">
                {`${formatLocalDateTime(record.startedAt)} · ${outcomeLabel(record)}`}
              </StatsLink>
            </li>
          ))}
        </ul>
      )}
      <StatsLink href={routePath({ page: "games" })} className="stats-link">
        All games ›
      </StatsLink>
    </section>
  );
}
