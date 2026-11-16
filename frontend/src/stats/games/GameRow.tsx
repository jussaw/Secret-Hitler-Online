import { Fragment } from "react";
import { formatDuration, formatLocalDate, formatLocalDateTime, formatLocalTime, outcomeLabel, plural } from "../format";
import PlayerName from "../PlayerName";
import type { GameRecord } from "../record";
import { routePath } from "../routes";
import StatsLink from "../StatsLink";

/**
 * A game's result as a row shows it: `outcomeLabel`, its first word (the winners) in their side's
 * colour when the game has a winner.
 */
function Result({ record }: { record: GameRecord }): JSX.Element {
  const label = outcomeLabel(record);
  if (record.winner === null) return <>{label}</>;
  const space = label.indexOf(" ");
  const winners = record.winner === "LIBERAL" ? "stats-liberal" : "stats-fascist";
  return (
    <>
      <span className={winners}>{label.slice(0, space)}</span>
      {label.slice(space)}
    </>
  );
}

/**
 * One game in GAMES' list (`games.jpg`): its local date and result, the time it started and its
 * length, its seats in turn order coloured by role, and its seat and round counts, with a `CPU`
 * tag for a game with CPU players.
 *
 * The date and result are the row's one link, to the game's page, and the link's `::after`
 * stretches over the whole row, so a press anywhere on it opens the game. The seats sit above that
 * (`.games-row-seats`) and outside the link, so names can be links of their own one day, and no
 * anchor ever wraps one.
 */
export function GameRow({ record }: { record: GameRecord }): JSX.Element {
  const label = `${formatLocalDateTime(record.startedAt)} · ${outcomeLabel(record)}${
    record.hasCpu ? " · with CPU players" : ""
  }`;
  return (
    <li className="games-row">
      <StatsLink href={routePath({ page: "game", id: record.id })} className="games-row-link" aria-label={label}>
        <span className="games-row-date">{formatLocalDate(record.startedAt)}</span>
        <span className="games-row-result">
          <Result record={record} />
          {record.hasCpu && <> <span className="games-row-cpu">CPU</span></>}
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
