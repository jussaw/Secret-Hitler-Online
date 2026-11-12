import Board from "../board/Board";
import Deck from "../board/Deck";
import StatusBar from "../status-bar/StatusBar";
import { GameState, LobbyState } from "../types";
import PlayerPolicyStatus from "../util/PlayerPolicyStatus";
import "./GameScreen.css";
import { centreBox } from "./seatPositions";
import TableSeats from "./TableSeats";
import SoundControl from "../sound/SoundControl";

export type GameScreenProps = {
  gameState: GameState;
  user: string;
  showVotes: boolean;
  showBusy: boolean;
  statusBarText: string;
  drawDeckSize: number;
  discardDeckSize: number;
  /** Policy counts and the election tracker are animated by App, so they lag gameState. */
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
  onEndTerm: () => void;
};

/**
 * The game page below the overlays: a round table with the players seated around the boards,
 * decks, status text and END TERM.
 */
export default function GameScreen(props: GameScreenProps) {
  const { gameState, user } = props;
  // Only the president can end their term, once the legislative session is over.
  const canEndTerm =
    gameState.state === LobbyState.POST_LEGISLATIVE &&
    gameState.president === user;
  // The centre box comes from the seat geometry, so seats and boards cannot drift apart.
  const centre = centreBox(gameState.playerOrder.length);

  return (
    <div className="game-screen">
      <header className="App-header">
        SECRET-HITLER.ONLINE
        <SoundControl />
      </header>

      <div className="game-table">
        <TableSeats
          gameState={gameState}
          user={user}
          showVotes={props.showVotes}
          showBusy={props.showBusy}
        />

        <div
          className="game-centre"
          style={{
            left: `${centre.left}%`,
            right: `${100 - centre.right}%`,
            top: `${centre.top}%`,
            bottom: `${100 - centre.bottom}%`,
          }}
        >
          <div className="game-boards">
            <Board
              numPlayers={gameState.playerOrder.length}
              numFascistPolicies={props.fascistPolicies}
              numLiberalPolicies={props.liberalPolicies}
              electionTracker={props.electionTracker}
            />
          </div>

          <div className="game-decks">
            <Deck cardCount={props.drawDeckSize} deckType={"DRAW"} />
            <PlayerPolicyStatus
              numFascistPolicies={props.fascistPolicies}
              numLiberalPolicies={props.liberalPolicies}
              playerCount={gameState.playerOrder.length}
            />
            <Deck cardCount={props.discardDeckSize} deckType={"DISCARD"} />
          </div>

          <div className="game-status">
            <StatusBar>{props.statusBarText}</StatusBar>
            <button disabled={!canEndTerm} onClick={props.onEndTerm}>
              END TERM
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
