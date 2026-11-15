import {
  ABOUT_URL,
  ISSUES_URL,
  LOBBY_CODE_LENGTH,
  MAX_NAME_LENGTH,
  RULES_URL,
} from "../constants";
import { normalizeCode } from "../lobby/normalizeCode";
import { normalizeName, typedName } from "../lobby/normalizeName";
import SoundControl from "../sound/SoundControl";
import OutLink from "../util/OutLink";
// The page and its header are the game's and the lobby's, and the cards, the fields' focus, the
// centring and the footer are the lobby's: GameScreen.css and LobbyScreen.css list the login
// page's selectors beside theirs.
import "../game/GameScreen.css";
import "../lobby/LobbyScreen.css";
import "./LoginScreen.css";

export type LoginScreenProps = {
  /** The one name field, which JOIN and CREATE LOBBY share. */
  name: string;
  /** The lobby code field, which JOIN and WATCH share. */
  lobby: string;
  /** The line under JOIN and WATCH ("" for none). */
  joinError: string;
  /** The line under CREATE LOBBY ("" for none). */
  createLobbyError: string;
  onNameChange: (name: string) => void;
  onLobbyChange: (lobby: string) => void;
  onJoin: () => void;
  onWatch: () => void;
  onCreateLobby: () => void;
};

const GAME_URL = "https://www.secrethitler.com/";
const UPSTREAM_URL = "https://github.com/ShrimpCryptid/Secret-Hitler-Online";
const LICENCE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/";

/**
 * The login page: the game's header, then three cards in the lobby's look (the name; a lobby code
 * with JOIN and WATCH; CREATE LOBBY) and a footer with the links and the credit line. JOIN needs
 * the name and the code, WATCH only the code, CREATE LOBBY only the name. Each of the two lower
 * cards shows its own error line.
 */
export default function LoginScreen(props: LoginScreenProps) {
  const hasName = normalizeName(props.name) !== "";
  const hasCode = props.lobby.length === LOBBY_CODE_LENGTH;

  return (
    <div className="login-screen">
      <header className="App-header">
        SECRET-HITLER
        <SoundControl />
      </header>

      <div className="login-body">
        <main className="login-cards">
          <section className="login-card login-name" aria-labelledby="login-name-title">
            <h2 id="login-name-title">
              <label htmlFor="login-name-field">YOUR NAME</label>
            </h2>
            <input
              id="login-name-field"
              type="text"
              value={props.name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              aria-describedby="login-name-hint"
              onChange={(e) => props.onNameChange(typedName(e.target.value))}
            />
            <p id="login-name-hint" className="login-hint">
              {`Up to ${MAX_NAME_LENGTH} characters`}
            </p>
          </section>

          <section className="login-card login-join" aria-labelledby="login-join-title">
            <h2 id="login-join-title">JOIN A GAME</h2>
            <div className="login-join-row">
              <input
                id="login-lobby-field"
                type="text"
                aria-label="Lobby code"
                placeholder="Lobby code"
                value={props.lobby}
                maxLength={LOBBY_CODE_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-describedby="login-join-hint"
                onChange={(e) => props.onLobbyChange(normalizeCode(e.target.value))}
              />
              <div className="login-join-buttons">
                <button type="button" disabled={!(hasName && hasCode)} onClick={props.onJoin}>
                  JOIN
                </button>
                <button type="button" disabled={!hasCode} onClick={props.onWatch}>
                  WATCH
                </button>
              </div>
            </div>
            <p id="login-join-hint" className="login-hint">
              WATCH needs only the code
            </p>
            <p className="login-error" role="status">
              {props.joinError}
            </p>
          </section>

          <section className="login-card login-start" aria-labelledby="login-start-title">
            <h2 id="login-start-title">OR START ONE</h2>
            <button type="button" disabled={!hasName} onClick={props.onCreateLobby}>
              CREATE LOBBY
            </button>
            <p className="login-error" role="status">
              {props.createLobbyError}
            </p>
          </section>
        </main>

        <footer className="login-footer">
          <p>
            <OutLink href={RULES_URL}>How to play</OutLink>
            {" · "}
            <OutLink href={ABOUT_URL}>About this project</OutLink>
            {" · "}
            <OutLink href={ISSUES_URL}>Report a bug</OutLink>
          </p>
          {/* The credit the CC BY-NC-SA 4.0 licence asks for. */}
          <p className="login-credit">
            Adapted from the <OutLink href={GAME_URL}>Secret Hitler</OutLink> board game by Goat,
            Wolf &amp; Cabbage. Based on <OutLink href={UPSTREAM_URL}>Secret Hitler Online</OutLink>{" "}
            by ShrimpCryptid. <OutLink href={LICENCE_URL}>CC BY-NC-SA 4.0</OutLink>.
          </p>
        </footer>
      </div>
    </div>
  );
}
