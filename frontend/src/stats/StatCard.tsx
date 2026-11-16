import { useId, type ReactNode } from "react";
import "./StatCard.css";

/** What a card says when the filter leaves it no games. */
export const NO_GAMES = "No games yet with these players.";

export interface StatCardProps {
  title: string;
  /** One line in plain words: what the stat counts. */
  definition: string;
  /**
   * In place of the children: `true` says `NO_GAMES`, a string says that string (a card with games
   * but nothing to show says why).
   */
  empty?: boolean | string;
  className?: string;
  children?: ReactNode;
}

/**
 * One stat in the game's card look: a region named by its title, the definition, then the stat
 * (a table or a chart), or the empty line.
 */
export function StatCard({ title, definition, empty, className, children }: StatCardProps): JSX.Element {
  const titleId = useId();
  const emptyLine = empty === true ? NO_GAMES : typeof empty === "string" ? empty : null;
  return (
    <section className={`stats-card stat-card${className ? ` ${className}` : ""}`} aria-labelledby={titleId}>
      <h3 className="stats-card-title" id={titleId}>
        {title}
      </h3>
      <p className="stat-card-definition">{definition}</p>
      {emptyLine !== null ? <p className="stat-card-empty">{emptyLine}</p> : children}
    </section>
  );
}

export default StatCard;
