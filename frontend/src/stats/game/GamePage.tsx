import { formatDuration, formatLocalDateTime, outcomeLabel, plural, sideWord } from "../format";
import PlayerName, { roleClass } from "../PlayerName";
import { routePath, type PageProps } from "../routes";
import StatsLink from "../StatsLink";

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
        <StatsLink href={routePath({ page: "games" })} className="stats-link">
          All games
        </StatsLink>
      </section>
    );
  }

  // The result starts with the winners' word (outcomeLabel), which takes their colour.
  const label = outcomeLabel(record);
  const winners = record.winner ? sideWord(record.winner) : null;
  return (
    <section className="stats-card game-page">
      <h1>
        {record.winner && winners && label.startsWith(winners) ? (
          <>
            <span className={roleClass(record.winner)}>{winners}</span>
            {label.slice(winners.length)}
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
