import { useId } from "react";
import type { GameElo } from "../elo";
import { botsLabel, formatDuration, formatLocalDateTime, outcomeLabel, plural, sideWord } from "../format";
import { formatSigned } from "../numbers";
import PlayerName, { roleClass } from "../PlayerName";
import { botSkillOf, type GameRecord } from "../record";
import { RoleWord } from "./text";

/**
 * A game page's header card: the result, its first word in the winners' colour; the start, the
 * length, the rounds and the final board, then the bots' level for a game with bots whose record
 * keeps one ("Hard bots"; nothing for a format 1 record); the game's Elo change when it counted
 * under the default filter (`elo`, from `gameElo.ts`); and the seats in turn order, coloured by
 * role, Hitler's marked, each player's name a link to their page.
 */
export function GameHeader({ record, elo }: { record: GameRecord; elo?: GameElo | null }): JSX.Element {
  const seatsLabel = useId();
  // The result starts with the winners' word (outcomeLabel), which takes their colour.
  const label = outcomeLabel(record);
  const winners = record.winner ? sideWord(record.winner) : null;
  const level = record.hasCpu ? botSkillOf(record) : null;
  const facts = [
    formatLocalDateTime(record.startedAt),
    formatDuration(record.endedAt - record.startedAt),
    plural(record.rounds, "round"),
    `board ${record.liberalPolicies} L, ${record.fascistPolicies} F`,
    ...(level === null ? [] : [botsLabel(level)]),
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
      {elo && (
        <p className="game-elo">
          {"Elo: "}
          <span className={roleClass("LIBERAL")}>{sideWord("LIBERAL")}</span> {formatSigned(elo.liberalChange)}
          {" · "}
          <span className={roleClass("FASCIST")}>{sideWord("FASCIST")}</span> {formatSigned(-elo.liberalChange)}
        </p>
      )}
      <div className="game-seats-line">
        <span className="game-seats-label" id={seatsLabel}>
          Seats in order:
        </span>{" "}
        <ol className="game-seats" aria-labelledby={seatsLabel}>
          {record.seats.map((seat, i) => (
            <li key={i}>
              <PlayerName player={seat.player} name={seat.name} role={seat.role} />
              {seat.role === "HITLER" && (
                <span className="game-seat-note">
                  {" ("}
                  <RoleWord role="HITLER" />
                  {")"}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}

export default GameHeader;
