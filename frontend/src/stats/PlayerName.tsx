import type { Role } from "./record";
import "./PlayerName.css";

const ROLE_CLASS: Record<Role, string> = {
  LIBERAL: "stats-liberal",
  FASCIST: "stats-fascist",
  HITLER: "stats-hitler",
};

/**
 * The class that colours a role's name or word on any stats page (`PlayerName.css`): Liberal blue,
 * Fascist red, Hitler red and underlined. A side is a role here too.
 */
export function roleClass(role: Role): string {
  return ROLE_CLASS[role];
}

export interface PlayerNameProps {
  /** The player's number, or null for a CPU seat. */
  player: number | null;
  name: string;
  /** Colours the name by role (Hitler underlined); none leaves it uncoloured. */
  role?: Role;
  /**
   * Whether the name may be a link to the player's page (the default). It does nothing until
   * names become links; a name inside a sentence or a headline passes `false`.
   */
  link?: boolean;
}

/**
 * The one way a stats page shows a seat's or a player's name: plain text, coloured by role when
 * given. Never put it inside an `<a>`.
 */
export function PlayerName({ player, name, role }: PlayerNameProps): JSX.Element {
  const className = role ? `player-name ${roleClass(role)}` : "player-name";
  return (
    <span className={className} data-player={player === null ? undefined : player}>
      {name}
    </span>
  );
}

export default PlayerName;
