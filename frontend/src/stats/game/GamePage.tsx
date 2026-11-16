import { routePath, type PageProps } from "../routes";
import StatsLink from "../StatsLink";
import GameHeader from "./GameHeader";
import "./GamePage.css";

/**
 * One game's page (`/stats/games/<id>`): its header, a note when its first rounds were not
 * recorded, and a line at the end when its lobby closed before it finished. An ID that is not
 * exactly a record's gets a short not-found page.
 */
export default function GamePage({ data, route }: PageProps): JSX.Element {
  const id = route.page === "game" ? route.id : null;
  const record = data.games.find((game) => game.id === id);
  if (!record) {
    return (
      <section className="stats-card game-not-found">
        <p>This game was not found.</p>
        <StatsLink href={routePath({ page: "games" })} className="stats-link">
          All games
        </StatsLink>
      </section>
    );
  }

  return (
    <div className="game-page">
      <GameHeader record={record} />
      {!record.complete && <p className="game-note">The first rounds of this game were not recorded.</p>}
      {record.outcome === "UNFINISHED" && <p className="game-note">Unfinished: the lobby closed</p>}
    </div>
  );
}
