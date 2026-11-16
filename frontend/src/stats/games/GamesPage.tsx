import { useId } from "react";
import type { PageProps } from "../routes";

/** GAMES, every recorded game (`/stats/games`). A placeholder until Phase 15B fills it. */
export default function GamesPage(_props: PageProps): JSX.Element {
  const titleId = useId();
  return (
    <section className="stats-card" aria-labelledby={titleId}>
      <h2 className="stats-card-title" id={titleId}>
        GAMES
      </h2>
      <p>Coming in a later update.</p>
    </section>
  );
}
