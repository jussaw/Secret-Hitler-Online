import Board from "../board/Board";
import Deck from "../board/Deck";
import PlayerDisplay, { DISABLE_EXECUTED_PLAYERS } from "../player/PlayerDisplay";
import StatusBar from "../status-bar/StatusBar";
import { GameState, LobbyState } from "../types";
import PlayerPolicyStatus from "../util/PlayerPolicyStatus";
import "./GameScreen.css";

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
 * The game page below the overlays: players, status text, decks and boards.
 */
export default function GameScreen(props: GameScreenProps) {
  const { gameState, user } = props;
  // Only the president can end their term, once the legislative session is over.
  const canEndTerm =
    gameState.state === LobbyState.POST_LEGISLATIVE &&
    gameState.president === user;

  return (
    <div className="game-screen">
      <header className="App-header">SECRET-HITLER.ONLINE</header>

      <div className="game-players">
        <PlayerDisplay
          gameState={gameState}
          user={user}
          showVotes={props.showVotes}
          showBusy={props.showBusy}
          playerDisabledFilter={DISABLE_EXECUTED_PLAYERS}
        />
      </div>

      <StatusBar>{props.statusBarText}</StatusBar>

      <div className="game-board-area">
        <div className="game-board-layout">
          <div className="game-deck-row">
            <Deck cardCount={props.drawDeckSize} deckType={"DRAW"} />

            <div className="game-end-term">
              <button disabled={!canEndTerm} onClick={props.onEndTerm}>
                {" "}
                END TERM
              </button>

              <PlayerPolicyStatus
                numFascistPolicies={props.fascistPolicies}
                numLiberalPolicies={props.liberalPolicies}
                playerCount={gameState.playerOrder.length}
              />
            </div>

            <Deck cardCount={props.discardDeckSize} deckType={"DISCARD"} />
          </div>

          <Board
            numPlayers={gameState.playerOrder.length}
            numFascistPolicies={props.fascistPolicies}
            numLiberalPolicies={props.liberalPolicies}
            electionTracker={props.electionTracker}
          />
        </div>
      </div>
    </div>
  );
}
