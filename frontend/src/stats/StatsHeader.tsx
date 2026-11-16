import type { StatsRoute } from "./routes";
import StatsLink from "./StatsLink";
import "./StatsHeader.css";

const PAGES: { label: string; href: string; marks: StatsRoute["page"][] }[] = [
  { label: "STATS", href: "/stats", marks: ["tab"] },
  { label: "GAMES", href: "/stats/games", marks: ["games", "game"] },
  { label: "PLAYERS", href: "/stats/players", marks: ["players", "player"] },
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
        {PAGES.map((page) => (
          <StatsLink
            key={page.label}
            href={page.href}
            className="stats-nav-link"
            aria-current={page.marks.includes(route.page) ? "page" : undefined}
          >
            {page.label}
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
