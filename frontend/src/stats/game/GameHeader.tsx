import { formatDuration, formatLocalDateTime, outcomeLabel, plural, sideWord } from "../format";
import PlayerName, { roleClass } from "../PlayerName";
import type { GameRecord } from "../record";
import { joined, RoleWord } from "./text";

/**
 * A game page's header card: the result, its first word in the winners' colour; the start, the
 * length, the rounds and the final board; and the seats in turn order, coloured by role, Hitler's
 * marked.
 */
export function GameHeader({ record }: { record: GameRecord }): JSX.Element {
  // The result starts with the winners' word (outcomeLabel), which takes their colour.
  const label = outcomeLabel(record);
  const winners = record.winner ? sideWord(record.winner) : null;
  const facts = [
    formatLocalDateTime(record.startedAt),
    formatDuration(record.endedAt - record.startedAt),
    plural(record.rounds, "round"),
    `board ${record.liberalPolicies} L, ${record.fascistPolicies} F`,
  ].join(" · ");
  return (
    <header className="stats-card game-header">
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
      <p className="game-facts">{facts}</p>
      <p className="game-seats">
        {"Seats in order: "}
        {joined(
          record.seats.map((seat) => (
            <>
              <PlayerName player={seat.player} name={seat.name} role={seat.role} />
              {seat.role === "HITLER" && (
                <>
                  {" ("}
                  <RoleWord role="HITLER" />
                  {")"}
                </>
              )}
            </>
          )),
          " · "
        )}
      </p>
    </header>
  );
}

export default GameHeader;
