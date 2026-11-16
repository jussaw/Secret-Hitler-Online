import { formatDuration, formatLocalDateTime, outcomeLabel, plural } from "../format";
import PlayerName from "../PlayerName";
import type { PageProps } from "../routes";
import StatsLink from "../StatsLink";
import "./GamePage.css";

/**
 * One game's page (`/stats/games/<id>`). A placeholder until Phase 16 fills it: the result, its
 * first word in the winners' colour, the start, length and rounds, and the seats in turn order
 * coloured by role. An ID with no record gets a short not-found page.
 */
export default function GamePage({ data, route }: PageProps): JSX.Element {
  const id = route.page === "game" ? route.id : null;
  const record = data.games.find((game) => game.id === id);
  if (!record) {
    return (
      <section className="stats-card">
        <p>This game was not found.</p>
        <StatsLink href="/stats/games" className="stats-link">
          All games
        </StatsLink>
      </section>
    );
  }

  const label = outcomeLabel(record);
  const space = label.indexOf(" ");
  const side = record.winner === "LIBERAL" ? "stats-liberal" : record.winner === "FASCIST" ? "stats-fascist" : null;
  return (
    <section className="stats-card game-page">
      <h1>
        {side ? (
          <>
            <span className={side}>{label.slice(0, space)}</span>
            {label.slice(space)}
          </>
        ) : (
          label
        )}
      </h1>
      <p>
        {`${formatLocalDateTime(record.startedAt)} · ${formatDuration(record.endedAt - record.startedAt)} · ${plural(
          record.rounds,
          "round"
        )}`}
      </p>
      <p className="game-seats">
        {"Seats in order: "}
        {record.seats.map((seat, i) => (
          <span key={i}>
            {i > 0 && " · "}
            <PlayerName player={seat.player} name={seat.name} role={seat.role} />
          </span>
        ))}
      </p>
    </section>
  );
}
