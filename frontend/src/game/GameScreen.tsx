import Board from "../board/Board";
import Deck from "../board/Deck";
import { GameState, LobbyState } from "../types";
import PlayerPolicyStatus from "../util/PlayerPolicyStatus";
import "./GameScreen.css";
import PlayerRoster from "./PlayerRoster";
import RoundTracker from "./RoundTracker";
import { RoundStep } from "./roundStep";
import SoundControl from "../sound/SoundControl";
import SpectatorCount from "../spectator/SpectatorCount";

export type GameScreenProps = {
  gameState: GameState;
  user: string;
  showVotes: boolean;
  showBusy: boolean;
  statusBarText: string;
  /** The round step lit with the status line. */
  statusStep: RoundStep | null;
  drawDeckSize: number;
  discardDeckSize: number;
  /** Policy counts and the election tracker are animated by App, so they lag gameState. */
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
  /** A spectator watches: END TERM keeps its place but is hidden. */
  spectator?: boolean;
  /** How many spectators are watching, shown in the header when above zero. */
  spectatorCount: number;
  onEndTerm: () => void;
};

/**
 * The game page below the overlays: the roster of players beside (or, in tall windows, above) the
 * table, which holds the round tracker over the boards and a column of END TERM and the decks.
 */
export default function GameScreen(props: GameScreenProps) {
  const { gameState, user } = props;
  // Only the president can end their term, once the legislative session is over.
  const canEndTerm =
    gameState.state === LobbyState.POST_LEGISLATIVE &&
    gameState.president === user;

  return (
    <div className="game-screen">
      <header className="App-header">
        SECRET-HITLER
        <SpectatorCount count={props.spectatorCount} />
        <SoundControl />
      </header>

      <div className="game-body">
        <PlayerRoster
          gameState={gameState}
          user={user}
          showVotes={props.showVotes}
          showBusy={props.showBusy}
        />

        <div className="game-table">
          <RoundTracker step={props.statusStep} text={props.statusBarText} />

          <div className="game-boards">
            <Board
              numPlayers={gameState.playerOrder.length}
              numFascistPolicies={props.fascistPolicies}
              numLiberalPolicies={props.liberalPolicies}
              electionTracker={props.electionTracker}
            />
          </div>

          <div className="game-decks">
            <button
              className="end-term"
              disabled={!canEndTerm}
              onClick={props.onEndTerm}
              style={props.spectator ? { visibility: "hidden" } : undefined}
            >
              END TERM
            </button>
            {/* Desktops keep this order; tall windows and phones rearrange it in GameScreen.css. */}
            <PlayerPolicyStatus
              numFascistPolicies={props.fascistPolicies}
              numLiberalPolicies={props.liberalPolicies}
              playerCount={gameState.playerOrder.length}
            />
            <div className="game-deck draw">
              <Deck cardCount={props.drawDeckSize} deckType={"DRAW"} />
            </div>
            <div className="game-deck discard">
              <Deck cardCount={props.discardDeckSize} deckType={"DISCARD"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
