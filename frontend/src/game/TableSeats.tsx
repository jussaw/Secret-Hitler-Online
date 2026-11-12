import { CSSProperties } from "react";
import { DISABLE_EXECUTED_PLAYERS, usePlayerTiles } from "../player/PlayerDisplay";
import { GameState } from "../types";
import { seatColumns, seatPositions } from "./seatPositions";
import "./TableSeats.css";

type TableSeatsProps = {
  gameState: GameState;
  user: string;
  showVotes: boolean;
  showBusy: boolean;
};

/**
 * Seats every player around the table, the user at bottom centre and the rest clockwise in
 * playerOrder. Each seat is the same tile PlayerDisplay shows, with its labels, votes and icons.
 * On phones TableSeats.css turns the seats into a grid, seatColumns() to a row.
 */
export default function TableSeats(props: TableSeatsProps) {
  const { gameState, user } = props;
  const tiles = usePlayerTiles({
    gameState,
    user,
    showVotes: props.showVotes,
    showBusy: props.showBusy,
    playerDisabledFilter: DISABLE_EXECUTED_PLAYERS,
  });
  const seats = seatPositions(
    gameState.playerOrder.length,
    gameState.playerOrder.indexOf(user)
  );

  const grid = { "--seat-columns": seatColumns(gameState.playerOrder.length) } as CSSProperties;

  return (
    <div className="table-seats" style={grid}>
      {tiles.map((tile) => {
        // Each tile is keyed by its player's name; place it by that, not by its index.
        const name = String(tile.key);
        const seat = seats[gameState.playerOrder.indexOf(name)];
        return (
          <div className="table-seat" key={name} style={{ left: `${seat.x}%`, top: `${seat.y}%` }}>
            {tile}
          </div>
        );
      })}
    </div>
  );
}
