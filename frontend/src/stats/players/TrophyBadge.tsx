import type { Trophy } from "../trophies";
import "./TrophyBadge.css";

/**
 * A trophy as a text badge in the game's office orange: its label in a pill, its rule as the
 * badge's title. RECORDS' trophy holders show it, and a player's page (Phase 22B) lists theirs.
 */
export function TrophyBadge({ trophy }: { trophy: Trophy }): JSX.Element {
  return (
    <span className="trophy-badge" title={trophy.rule} data-trophy={trophy.id}>
      {trophy.label}
    </span>
  );
}

export default TrophyBadge;
