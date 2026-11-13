import { useRef } from "react";
import { Copy, Eye, UserPlus } from "lucide-react";
import { MAX_PLAYERS } from "../constants";
import SoundControl from "../sound/SoundControl";
import SpectatorCount from "../spectator/SpectatorCount";
import { copyText } from "./copyText";
import LobbyRoster from "./LobbyRoster";
import { isPicking, lobbyStatus } from "./lobbyStatus";
import "./LobbyScreen.css";

export type LobbyScreenProps = {
  lobby: string;
  inviteLink: string;
  usernames: string[];
  icons: Record<string, string>;
  /** The viewer's name, "" for a spectator. */
  user: string;
  spectator: boolean;
  /** How many spectators are watching, shown in the header when above zero. */
  spectatorCount: number;
  onStartGame: () => void;
  onChangeLook: () => void;
  onWatchInstead: () => void;
  onPlayInstead: () => void;
  onLeave: () => void;
  /** Called once COPY has finished, with whether the link was copied. */
  onCopied: (ok: boolean) => void;
};

const ABOUT_URL = "https://github.com/jussaw/Secret-Hitler-Online#readme";
const ISSUES_URL = "https://github.com/jussaw/Secret-Hitler-Online/issues";

/**
 * The lobby page below the prompts: the game's header, the roster of players beside (or, in tall
 * windows and on phones, above) the code card, the status line, the buttons and the footer links.
 * Spectators get PLAY INSTEAD in place of the players' buttons.
 */
export default function LobbyScreen(props: LobbyScreenProps) {
  const { usernames, icons, user, spectator } = props;
  const linkField = useRef<HTMLInputElement>(null);
  const isHost = !spectator && usernames.length > 0 && usernames[0] === user;
  const everyonePicked = usernames.every((name) => !isPicking(name, icons));
  const full = usernames.length >= MAX_PLAYERS;
  const status = lobbyStatus(usernames, icons, { user, spectator });

  const copy = async () => {
    props.onCopied(await copyText(props.inviteLink, linkField.current));
  };

  return (
    <div className="lobby-screen">
      <header className="App-header">
        SECRET-HITLER
        <SpectatorCount count={props.spectatorCount} />
        <SoundControl />
      </header>

      <div className="lobby-body">
        <div className="lobby-players">
          <div className="lobby-players-head">
            <span>PLAYERS</span>
            <span className="lobby-player-count">{`${usernames.length} / ${MAX_PLAYERS}`}</span>
          </div>
          <LobbyRoster usernames={usernames} icons={icons} user={user} />
        </div>

        <main className="lobby-main">
          <div className="lobby-code-card">
            <div className="lobby-code-head">
              <span className="lobby-code-label">LOBBY CODE</span>
              <span className="lobby-code">{props.lobby}</span>
            </div>
            <div className="lobby-invite">
              <label className="lobby-invite-label" htmlFor="linkText">
                Share this link to invite players
              </label>
              <div className="lobby-link-row">
                <input id="linkText" ref={linkField} type="text" readOnly value={props.inviteLink} />
                <button type="button" className="lobby-copy" onClick={copy}>
                  <Copy className="lobby-button-icon" aria-hidden="true" />
                  COPY
                </button>
              </div>
            </div>
          </div>

          <div className="lobby-status">
            <p id="lobby-status-text" aria-live="polite">
              {status.map((segment, i) =>
                segment.highlight ? (
                  <span key={i} className="lobby-status-name">
                    {segment.text}
                  </span>
                ) : (
                  segment.text
                )
              )}
            </p>
          </div>

          <div className="lobby-actions">
            {isHost && (
              <button
                type="button"
                className="lobby-start"
                disabled={!everyonePicked}
                onClick={props.onStartGame}
              >
                START GAME
              </button>
            )}
            <div className="lobby-secondary">
              {spectator ? (
                <button type="button" disabled={full} onClick={props.onPlayInstead}>
                  <UserPlus className="lobby-button-icon lobby-switch-icon" aria-hidden="true" />
                  PLAY INSTEAD
                </button>
              ) : (
                <>
                  <button type="button" onClick={props.onChangeLook}>
                    CHANGE LOOK
                  </button>
                  <button type="button" onClick={props.onWatchInstead}>
                    <Eye className="lobby-button-icon lobby-switch-icon" aria-hidden="true" />
                    WATCH INSTEAD
                  </button>
                </>
              )}
              <button type="button" onClick={props.onLeave}>
                LEAVE LOBBY
              </button>
            </div>
          </div>

          {spectator && full && (
            <p className="lobby-full-note">
              {`The lobby is full (${MAX_PLAYERS} / ${MAX_PLAYERS}). You can play when a seat frees up.`}
            </p>
          )}

          <footer className="lobby-footer">
            <a href={ABOUT_URL} target="_blank" rel="noopener noreferrer">
              About this project
            </a>
            {" · "}
            <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
              Report a bug
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
