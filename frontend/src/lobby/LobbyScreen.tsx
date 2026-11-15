import { useRef } from "react";
import { Copy, Eye, UserPlus } from "lucide-react";
import { ABOUT_URL, ISSUES_URL, MAX_PLAYERS } from "../constants";
import SoundControl from "../sound/SoundControl";
import SpectatorCount from "../spectator/SpectatorCount";
import OutLink from "../util/OutLink";
import { copyText } from "./copyText";
import LobbyRoster from "./LobbyRoster";
import { isPicking, lobbyStatus } from "./lobbyStatus";
// The page, its header and the roster column are the game's (GameScreen.css lists the lobby's
// selectors beside its own).
import "../game/GameScreen.css";
import "./LobbyScreen.css";

export type LobbyScreenProps = {
  lobby: string;
  inviteLink: string;
  usernames: string[];
  icons: Record<string, string>;
  /** The viewer's name (the packets' `you`), "" for a spectator. */
  user: string;
  spectator: boolean;
  /** How many spectators are watching, shown in the header when above zero. */
  spectatorCount: number;
  /** Whether the page is signed in: a spectator gets PLAY INSTEAD signed in, SIGN IN TO PLAY not. */
  signedIn: boolean;
  /** Whether the server has Discord sign-in: without it, SIGN IN TO PLAY is off. */
  discord: boolean;
  /** SIGN IN TO PLAY's link: signing in with Discord, which comes back to watching this lobby. */
  signInHref: string;
  /**
   * A spectator's error line ("" for none): signed in, why PLAY INSTEAD took no seat; signed out,
   * a failed sign-in.
   */
  spectatorError: string;
  onStartGame: () => void;
  onChangeName: () => void;
  onChangeLook: () => void;
  onWatchInstead: () => void;
  onPlayInstead: () => void;
  onLeave: () => void;
  /** Called once COPY has finished, with whether the link was copied. */
  onCopied: (ok: boolean) => void;
};

const FULL_NOTE = `The lobby is full (${MAX_PLAYERS} / ${MAX_PLAYERS}). You can play when a seat frees up.`;
const NOT_SET_UP = "Sign-in is not set up on this server.";

/**
 * The one note under a spectator's buttons ("" for none). Signed in: the full lobby's note while
 * PLAY INSTEAD is off for it, otherwise PLAY INSTEAD's error. Signed out: a failed sign-in, then
 * a server without Discord sign-in, then the full lobby's note.
 */
function spectatorNote(props: LobbyScreenProps, full: boolean): string {
  if (props.signedIn) return full ? FULL_NOTE : props.spectatorError;
  if (props.spectatorError) return props.spectatorError;
  if (!props.discord) return NOT_SET_UP;
  return full ? FULL_NOTE : "";
}

/**
 * The lobby page below the prompts: the game's header, the roster of players beside (or, in tall
 * windows and on phones, above) the code card, the status line, the buttons and the footer links.
 * A player gets CHANGE NAME, CHANGE LOOK, WATCH INSTEAD and LEAVE LOBBY (the host START GAME above
 * them); a spectator PLAY INSTEAD signed in, SIGN IN TO PLAY signed out, and LEAVE LOBBY, with a
 * note under them when there is something to say.
 */
export default function LobbyScreen(props: LobbyScreenProps) {
  const { usernames, icons, user, spectator } = props;
  const linkField = useRef<HTMLInputElement>(null);
  const isHost = !spectator && usernames.length > 0 && usernames[0] === user;
  const everyonePicked = usernames.every((name) => !isPicking(name, icons));
  const full = usernames.length >= MAX_PLAYERS;
  const status = lobbyStatus(usernames, icons, { user, spectator });
  const note = spectator ? spectatorNote(props, full) : "";

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
          <LobbyRoster usernames={usernames} icons={icons} user={spectator ? "" : user} />
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
            {/* A player's four make two rows of two on phones (lobby-player-buttons). */}
            <div className={spectator ? "lobby-secondary" : "lobby-secondary lobby-player-buttons"}>
              {!spectator ? (
                <>
                  <button type="button" onClick={props.onChangeName}>
                    CHANGE NAME
                  </button>
                  <button type="button" onClick={props.onChangeLook}>
                    CHANGE LOOK
                  </button>
                  <button type="button" onClick={props.onWatchInstead}>
                    <Eye className="lobby-button-icon lobby-switch-icon" aria-hidden="true" />
                    WATCH INSTEAD
                  </button>
                </>
              ) : props.signedIn ? (
                <button type="button" disabled={full} onClick={props.onPlayInstead}>
                  <UserPlus className="lobby-button-icon lobby-switch-icon" aria-hidden="true" />
                  PLAY INSTEAD
                </button>
              ) : props.discord ? (
                <a className="button-link" href={props.signInHref}>
                  SIGN IN TO PLAY
                </a>
              ) : (
                <button type="button" disabled aria-describedby="lobby-note">
                  SIGN IN TO PLAY
                </button>
              )}
              <button type="button" onClick={props.onLeave}>
                LEAVE LOBBY
              </button>
            </div>
          </div>

          {/* Always there, so a screen reader announces a note as it comes; empty, it takes no
              room in the column (LobbyScreen.css). */}
          <p
            id="lobby-note"
            className={note === FULL_NOTE ? "lobby-note lobby-full-note" : "lobby-note"}
            role="status"
          >
            {note || null}
          </p>

          <footer className="lobby-footer">
            <OutLink href={ABOUT_URL}>About this project</OutLink>
            {" · "}
            <OutLink href={ISSUES_URL}>Report a bug</OutLink>
          </footer>
        </main>
      </div>
    </div>
  );
}
