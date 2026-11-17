import { useEffect, type ReactNode } from "react";
import { useStatsData } from "./api";
import GamePage from "./game/GamePage";
import GamesPage from "./games/GamesPage";
import PlayerPage from "./players/PlayerPage";
import PlayersPage from "./players/PlayersPage";
import { parseRoute, routePath, useLocation, type PageProps, type StatsRoute } from "./routes";
import StatsHeader from "./StatsHeader";
import StatsLink from "./StatsLink";
import TabsPage from "./TabsPage";
import "./StatsApp.css";

/** Each page kind's name in the window's title. */
const TITLES: Record<StatsRoute["page"], string> = {
  tab: "Stats",
  games: "Games",
  game: "Game",
  players: "Players",
  player: "Player",
  notFound: "Not found",
};

/** The page each route shows, from its own file (a later phase fills each one). */
const PAGES: Record<Exclude<StatsRoute["page"], "notFound">, (props: PageProps) => JSX.Element> = {
  tab: TabsPage,
  games: GamesPage,
  game: GamePage,
  players: PlayersPage,
  player: PlayerPage,
};

/**
 * The stats pages, loaded as a chunk of their own for their paths, under `/stats`, `/games` and
 * `/players` (`main.tsx`, `isStatsPath`): the header, then the page the address names. The records are fetched once per page load; until
 * they come the page says so, and if they cannot be loaded it says that instead. An address that
 * names no page gets a short not-found page.
 */
export default function StatsApp(): JSX.Element {
  const { pathname } = useLocation();
  const route = parseRoute(pathname);
  const { data, error } = useStatsData();

  useEffect(() => {
    document.title = `${TITLES[route.page]} · Secret Hitler Online`;
  }, [route.page]);

  let body: ReactNode;
  if (route.page === "notFound") {
    body = (
      <section className="stats-card stats-not-found">
        <p>This page was not found.</p>
        <StatsLink href={routePath({ page: "tab", tab: "overview" })} className="stats-link">
          Go to the stats
        </StatsLink>
      </section>
    );
  } else if (error !== null) {
    body = (
      <p className="stats-message" role="alert">
        {error}
      </p>
    );
  } else if (data === null) {
    body = (
      <p className="stats-message" role="status">
        Loading the games…
      </p>
    );
  } else {
    const Page = PAGES[route.page];
    body = <Page data={data} route={route} />;
  }

  return (
    <div className="stats-screen">
      <StatsHeader route={route} />
      <main className="stats-main">{body}</main>
    </div>
  );
}
