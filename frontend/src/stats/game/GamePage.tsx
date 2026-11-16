import { useMemo } from "react";
import { routePath, type PageProps } from "../routes";
import { rounds } from "../rounds";
import StatsLink from "../StatsLink";
import { gameEloChange } from "./gameElo";
import GameHeader from "./GameHeader";
import RoundBlock from "./RoundBlock";
import "./GamePage.css";

/**
 * One game's page (`/stats/games/<id>`): its header (with the game's Elo change when it counts
 * under the default filter), a note when its first rounds were not recorded, a block per round, and a line at the end when its lobby closed before it finished.
 * An ID that is not exactly a record's gets a short not-found page.
 */
export default function GamePage({ data, route }: PageProps): JSX.Element {
  const id = route.page === "game" ? route.id : null;
  const record = data.games.find((game) => game.id === id);
  const played = useMemo(() => (record ? rounds(record) : []), [record]);
  const elo = useMemo(() => (record ? gameEloChange(data, record.id) : null), [data, record]);
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
      <GameHeader record={record} elo={elo} />
      {!record.complete && <p className="game-note">The first rounds of this game were not recorded.</p>}
      {played.length > 0 && (
        <ol className="game-rounds">
          {played.map((round) => (
            <li key={round.r}>
              <RoundBlock round={round} seats={record.seats} />
            </li>
          ))}
        </ol>
      )}
      {record.outcome === "UNFINISHED" && <p className="game-note">Unfinished: the lobby closed</p>}
    </div>
  );
}
