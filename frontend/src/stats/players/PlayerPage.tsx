import { useId } from "react";
import type { PageProps } from "../routes";

/** One player's page (`/stats/players/<number>`). A placeholder until Phase 22B fills it. */
export default function PlayerPage(_props: PageProps): JSX.Element {
  const titleId = useId();
  return (
    <section className="stats-card" aria-labelledby={titleId}>
      <h2 className="stats-card-title" id={titleId}>
        PLAYER
      </h2>
      <p>Coming in a later update.</p>
    </section>
  );
}
