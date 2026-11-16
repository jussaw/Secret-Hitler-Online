import { filterSearch, parseFilter } from "./counting";
import type { Role } from "./record";
import { parseRoute, routePath, useLocation } from "./routes";
import StatsLink from "./StatsLink";
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

/**
 * The address of `player`'s page, seen from the address `at`: the stats filter comes along from a
 * tab, PLAYERS or a player page, and nothing from GAMES or a game page, whose address holds GAMES'
 * own filter (or anywhere else).
 */
export function playerHref(player: number, at: { pathname: string; search: string }): string {
  const path = routePath({ page: "player", number: player });
  const page = parseRoute(at.pathname).page;
  const carries = page === "tab" || page === "players" || page === "player";
  return carries ? path + filterSearch(parseFilter(at.search)) : path;
}

export interface PlayerNameProps {
  /** The player's number, or null for a CPU seat. */
  player: number | null;
  name: string;
  /** Colours the name by role (Hitler underlined); none leaves it uncoloured. */
  role?: Role;
  /** Whether the name is a link to the player's page (the default); a name in a sentence or a headline passes `false`. */
  link?: boolean;
}

/**
 * The one way a stats page shows a seat's or a player's name, coloured by role when given: a
 * player's name links to their page (`playerHref`); a CPU seat's, or one with `link={false}`, is
 * plain text. Never put it inside an `<a>`, a button or a label.
 */
export function PlayerName({ player, name, role, link = true }: PlayerNameProps): JSX.Element {
  const className = role ? `player-name ${roleClass(role)}` : "player-name";
  if (player === null || !link) {
    return (
      <span className={className} data-player={player === null ? undefined : player}>
        {name}
      </span>
    );
  }
  return <PlayerLink player={player} name={name} role={role} />;
}

/** A player's name as a link to their page, from wherever the address is now. */
function PlayerLink({ player, name, role }: { player: number; name: string; role?: Role }): JSX.Element {
  const at = useLocation();
  const className = role ? `player-name player-link ${roleClass(role)}` : "player-name player-link";
  return (
    <StatsLink href={playerHref(player, at)} className={className} data-player={player}>
      {name}
    </StatsLink>
  );
}

export default PlayerName;
