import SiteHeader, { type SitePlace } from "../header/SiteHeader";
import type { StatsRoute } from "./routes";
import StatsLink from "./StatsLink";

/** The header's place for each page kind: a game is under GAMES, a player under PLAYERS. */
const PLACES: Record<StatsRoute["page"], SitePlace | null> = {
  tab: "stats",
  games: "games",
  game: "games",
  players: "players",
  player: "players",
  notFound: null,
};

/**
 * The stats pages' header: the site header (shared with the login page), with STATS, GAMES and
 * PLAYERS as `StatsLink`s, which move the page in place, and PLAY a full load of the game. The
 * link of the page you are on is marked; a page that was not found marks none.
 */
export function StatsHeader({ route }: { route: StatsRoute }): JSX.Element {
  return <SiteHeader current={PLACES[route.page]} link={StatsLink} />;
}

export default StatsHeader;
