import { useId } from "react";
import type { PageProps } from "../routes";

/** PLAYERS, every player (`/stats/players`). A placeholder until Phase 22B fills it. */
export default function PlayersPage(_props: PageProps): JSX.Element {
  const titleId = useId();
  return (
    <section className="stats-card" aria-labelledby={titleId}>
      <h2 className="stats-card-title" id={titleId}>
        PLAYERS
      </h2>
      <p>Coming in a later update.</p>
    </section>
  );
}
