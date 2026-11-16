import { routePath, type StatsRoute } from "./routes";
import StatsLink from "./StatsLink";
import "./StatsHeader.css";

/** The header's in-page links, each with the pages it is marked on. */
const NAV_LINKS: { label: string; href: string; marks: StatsRoute["page"][] }[] = [
  { label: "STATS", href: routePath({ page: "tab", tab: "overview" }), marks: ["tab"] },
  { label: "GAMES", href: routePath({ page: "games" }), marks: ["games", "game"] },
  { label: "PLAYERS", href: routePath({ page: "players" }), marks: ["players", "player"] },
];

/**
 * The stats pages' header: SECRET-HITLER, and the links STATS, GAMES and PLAYERS, which move the
 * page in place, and PLAY, a full load of the game. The link of the page you are on is marked
 * (`aria-current="page"`, underlined); a page that was not found marks none.
 */
export function StatsHeader({ route }: { route: StatsRoute }): JSX.Element {
  return (
    <header className="stats-header">
      <span className="stats-title">SECRET-HITLER</span>
      <nav className="stats-nav" aria-label="Stats pages">
        {NAV_LINKS.map((link) => (
          <StatsLink
            key={link.label}
            href={link.href}
            className="stats-nav-link"
            aria-current={link.marks.includes(route.page) ? "page" : undefined}
          >
            {link.label}
          </StatsLink>
        ))}
        <a href="/" className="stats-nav-link">
          PLAY
        </a>
      </nav>
    </header>
  );
}

export default StatsHeader;
