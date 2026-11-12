import React, { ReactElement } from "react";
import Player from "./Player";
import { PLAYER_IDENTITY } from "../constants";
import "./PlayerDisplay.css";
import { PlayerDisplayProps, usePlayerRows, withDefaultProps } from "./usePlayerRows";

export {
  DISABLE_NONE,
  DISABLE_EXECUTED_PLAYERS,
  DISABLE_INVESTIGATED_PLAYERS,
  DISABLE_TERM_LIMITED_PLAYERS,
} from "./usePlayerRows";
export type { PlayerDisplayProps } from "./usePlayerRows";

/**
 * Builds one card tile per displayed player, in display order, on top of usePlayerRows, and
 * handles selection. PlayerDisplay lays the tiles out in rows.
 */
export function usePlayerTiles(inputProps: PlayerDisplayProps): JSX.Element[] {
  const props = withDefaultProps(inputProps);
  const rows = usePlayerRows(inputProps);

  /**
   * Called when the player is selected. Calls props.onSelection if the player is a valid choice.
   * @param name the name of the player.
   * @effects If the player should be disabled (ie, {@code props.playerDisabledFilter(name, gamestate) !== ""}), ignores the selection.
   *          If the player is already selected, ignores the selection.
   *          Otherwise, calls {@code.props.onSelection(name)}.
   */
  const onPlayerSelected = (name: string): void => {
    if (
      props.playerDisabledFilter &&
      props.playerDisabledFilter(name, props.gameState) === "" &&
      props.useAsButtons &&
      name !== props.selection
    ) {
      props.onSelection && props.onSelection(name);
    }
  };

  return rows.map((row) => (
    <div id={"player-display-text-container"} key={row.name}>
      {props.showLabels && <p id="player-display-label">{row.office}</p>}
      <Player
        isBusy={row.busy}
        role={props.gameState.players[row.name][PLAYER_IDENTITY]}
        showRole={row.role !== undefined}
        highlight={row.isUser}
        disabled={row.disabledText !== ""}
        disabledText={row.disabledText}
        name={row.name}
        useAsButton={props.useAsButtons}
        isSelected={props.selection === row.name}
        onClick={() => onPlayerSelected(row.name)}
        showVote={row.showVote}
        vote={row.vote}
        icon={row.icon}
      />
    </div>
  ));
}

/**
 * Displays a row of player icons and handles displaying busy status, votes, and roles where applicable.
 */
export default function PlayerDisplay(props: PlayerDisplayProps): ReactElement {
  const tiles = usePlayerTiles(props);

  /* Note that there are three player-display-containers, so that the player tiles can be split into rows if there
   * is insufficient space for them.*/

  // divides the playerOrder at the given index to allow for even groupings if the page is too narrow to fit
  // all players.
  let div1, div2;
  if (tiles.length <= 4) {
    // all players can be sorted into the first group.
    div1 = tiles.length;
    div2 = tiles.length;
  } else if (tiles.length <= 8) {
    // divide the players into two groups, with size preference given to the second group.
    div1 = Math.floor(tiles.length / 2);
    div2 = tiles.length;
  } else {
    div1 = Math.floor(tiles.length / 3);
    div2 = Math.floor((tiles.length * 2) / 3);
  }

  return (
    <div id="player-display">
      <div id="player-display-container">{tiles.slice(0, div1)}</div>
      <div id="player-display-container">{tiles.slice(div1, div2)}</div>
      <div id="player-display-container">{tiles.slice(div2)}</div>
    </div>
  );
}
