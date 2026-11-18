import { Fragment } from "react";
import {
  botsLabel,
  formatDuration,
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
  outcomeLabel,
  plural,
  sideWord,
} from "../format";
import PlayerName, { roleClass } from "../PlayerName";
import { botSkillOf, type GameRecord } from "../record";
import { routePath } from "../routes";
import StatsLink from "../StatsLink";

/**
 * A game's result as a row shows it: `outcomeLabel`, whose first word for a finished game is the
 * winners' (`sideWord`), in their side's colour.
 */
function Result({ record }: { record: GameRecord }): JSX.Element {
  const label = outcomeLabel(record);
  if (record.winner === null) return <>{label}</>;
  const winners = sideWord(record.winner);
  return (
    <>
      <span className={roleClass(record.winner)}>{winners}</span>
      {label.slice(winners.length)}
    </>
  );
}

/**
 * One game in GAMES' list (`games.jpg`): its local date and result, the time it started and its
 * length, its seats in turn order coloured by role, and its seat and round counts, with the bots'
 * tag for a game with CPU players, their level's `botsLabel` ("Hard bots", or "Bots" for a format
 * 1 record), which its link's name ends with too ("with Hard bots").
 *
 * The date and result are the row's one link, to the game's page, and the link's `::after`
 * stretches over the whole row, so a press anywhere on it opens the game. The seats sit above that
 * (`.games-row-seats`) and outside the link, so names can be links of their own one day, and no
 * anchor ever wraps one.
 */
export function GameRow({ record }: { record: GameRecord }): JSX.Element {
  const bots = botsLabel(botSkillOf(record));
  const label = `${formatLocalDateTime(record.startedAt)} · ${outcomeLabel(record)}${
    record.hasCpu ? ` · with ${bots}` : ""
  }`;
  return (
    <li className="games-row">
      <StatsLink href={routePath({ page: "game", id: record.id })} className="games-row-link" aria-label={label}>
        <span className="games-row-date">{formatLocalDate(record.startedAt)}</span>
        <span className="games-row-result">
          <Result record={record} />
          {record.hasCpu && <> <span className="games-row-cpu">{bots}</span></>}
        </span>
      </StatsLink>{" "}
      <span className="games-row-when">
        {`${formatLocalTime(record.startedAt)} · ${formatDuration(record.endedAt - record.startedAt)}`}
      </span>{" "}
      <span className="games-row-seats">
        {record.seats.map((seat, i) => (
          <Fragment key={i}>
            {i > 0 && " · "}
            <PlayerName player={seat.player} name={seat.name} role={seat.role} />
          </Fragment>
        ))}
      </span>{" "}
      <span className="games-row-counts">
        <span>{plural(record.seats.length, "seat")}</span>{" "}
        <span>{plural(record.rounds, "round")}</span>
      </span>
    </li>
  );
}

export default GameRow;
