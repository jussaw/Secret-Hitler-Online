import type { ReactNode } from "react";
// The paths are written out in constants, not taken from the stats' routes, so the login page's
// header brings none of the stats' code into the game's first download.
import { STATS_GAME_LIST_PATH, STATS_PATH, STATS_PLAYER_LIST_PATH } from "../constants";
import "./SiteHeader.css";

/** The four places the header links to. */
export type SitePlace = "stats" | "games" | "players" | "play";

/** What the header hands the component that draws STATS, GAMES and PLAYERS. */
export type HeaderLinkProps = {
  href: string;
  className: string;
  "aria-current"?: "page";
  children: ReactNode;
};

/** A plain link: a full load of its page. */
function PlainLink(props: HeaderLinkProps): JSX.Element {
  return <a {...props} />;
}

/** The links drawn with `link`, each with its place. */
const IN_PAGE: { place: SitePlace; label: string; href: string }[] = [
  { place: "stats", label: "STATS", href: STATS_PATH },
  { place: "games", label: "GAMES", href: STATS_GAME_LIST_PATH },
  { place: "players", label: "PLAYERS", href: STATS_PLAYER_LIST_PATH },
];

/**
 * The header of the login page and the stats pages: SECRET-HITLER, then STATS, GAMES, PLAYERS and
 * PLAY. The place you are at is marked (`aria-current="page"`, underlined); `null` marks none.
 * `link` draws STATS, GAMES and PLAYERS: the stats pass `StatsLink`, which moves the page in place,
 * and the login page leaves the default, a plain link. PLAY is always a plain link, a full load of
 * the game.
 */
export function SiteHeader({
  current,
  link: Link = PlainLink,
}: {
  current: SitePlace | null;
  link?: (props: HeaderLinkProps) => JSX.Element;
}): JSX.Element {
  const mark = (place: SitePlace) => (place === current ? "page" : undefined);
  return (
    <header className="site-header">
      <span className="site-title">SECRET-HITLER</span>
      <nav className="site-nav" aria-label="Stats pages">
        {IN_PAGE.map(({ place, label, href }) => (
          <Link key={place} href={href} className="site-nav-link" aria-current={mark(place)}>
            {label}
          </Link>
        ))}
        <a href="/" className="site-nav-link" aria-current={mark("play")}>
          PLAY
        </a>
      </nav>
    </header>
  );
}

export default SiteHeader;
