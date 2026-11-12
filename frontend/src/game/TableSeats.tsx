import { DISABLE_EXECUTED_PLAYERS, usePlayerTiles } from "../player/PlayerDisplay";
import { GameState } from "../types";
import { seatPositions } from "./seatPositions";
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

  return (
    <div className="table-seats">
      {tiles.map((tile, i) => (
        <div
          className="table-seat"
          key={gameState.playerOrder[i]}
          style={{ left: `${seats[i].x}%`, top: `${seats[i].y}%` }}
        >
          {tile}
        </div>
      ))}
    </div>
  );
}
