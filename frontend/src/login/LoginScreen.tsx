import type { Me } from "../account/account";
import { ABOUT_URL, ISSUES_URL, LOBBY_CODE_LENGTH, RULES_URL, STATS_PATH } from "../constants";
import { normalizeCode } from "../lobby/normalizeCode";
import SoundControl from "../sound/SoundControl";
import OutLink from "../util/OutLink";
// The page and its header are the game's and the lobby's, and the cards, the fields' focus, the
// centring, the grey buttons and the footer are the lobby's: GameScreen.css and LobbyScreen.css
// list the login page's selectors beside theirs.
import "../game/GameScreen.css";
import "../lobby/LobbyScreen.css";
import "./LoginScreen.css";

export type LoginScreenProps = {
  /** GET /me's answer: undefined until it comes, and when it failed (accountError says so). */
  account: Me | undefined;
  /** The account card's error line ("" for none): CONTACT_ERROR, or a failed sign-in. */
  accountError: string;
  /** SIGN IN WITH DISCORD's link, carrying the code field's lobby code. */
  discordHref: string;
  /** The lobby code field, which JOIN and WATCH share. */
  lobby: string;
  /** The line under JOIN and WATCH ("" for none). */
  joinError: string;
  /** The line under CREATE LOBBY ("" for none). */
  createLobbyError: string;
  onLobbyChange: (lobby: string) => void;
  onJoin: () => void;
  onWatch: () => void;
  onCreateLobby: () => void;
  onTestSignIn: () => void;
  onChangeName: () => void;
  onSignOut: () => void;
};

const GAME_URL = "https://www.secrethitler.com/";
const UPSTREAM_URL = "https://github.com/ShrimpCryptid/Secret-Hitler-Online";
const LICENCE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/";

/**
 * The login page: the game's header, then three cards in the lobby's look (the account; a lobby
 * code with JOIN and WATCH; CREATE LOBBY) and a footer with the links and the credit line. JOIN
 * needs a signed-in account with a name and the code, WATCH only the code, CREATE LOBBY only the
 * account with a name. Each card shows its own error line.
 */
export default function LoginScreen(props: LoginScreenProps) {
  const account = props.account;
  const signedIn = account?.signedIn === true;
  const hasName = signedIn && account.username !== null;
  const hasCode = props.lobby.length === LOBBY_CODE_LENGTH;

  return (
    <div className="login-screen">
      <header className="App-header">
        SECRET-HITLER
        <SoundControl />
      </header>

      <div className="login-body">
        <main className="login-cards">
          <AccountCard {...props} />

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
              {signedIn
                ? "WATCH needs only the code"
                : "JOIN needs you signed in · WATCH needs only the code"}
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
            {/* The stats in this tab: the login page has nothing to keep open. */}
            <a href={STATS_PATH}>Stats</a>
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

/** A space that keeps a line's height in a card waiting for its text. */
const BLANK = " ";

/**
 * The first card. Signed out: YOUR ACCOUNT, with SIGN IN WITH DISCORD (and TEST SIGN-IN where the
 * server has it). Signed in: YOUR NAME, the name, CHANGE NAME and who the account is, with Sign
 * out. Until /me answers, and while a first sign-in chooses its name, the card is the signed-in
 * one left blank at its height, so nothing below moves when the answer comes.
 */
function AccountCard(props: LoginScreenProps) {
  const account = props.account;

  if (account !== undefined && !account.signedIn) {
    return (
      <section className="login-card login-account" aria-labelledby="login-account-title">
        <h2 id="login-account-title">YOUR ACCOUNT</h2>
        <div className="login-account-buttons">
          {account.discord ? (
            <a className="button-link" href={props.discordHref}>
              SIGN IN WITH DISCORD
            </a>
          ) : (
            <button type="button" disabled aria-describedby="login-account-hint">
              SIGN IN WITH DISCORD
            </button>
          )}
          {account.testSignIn && (
            <button type="button" className="login-grey" onClick={props.onTestSignIn}>
              TEST SIGN-IN
            </button>
          )}
        </div>
        <p id="login-account-hint" className="login-hint">
          {account.discord
            ? "Sign in to play. Anyone can watch."
            : "Sign-in is not set up on this server."}
        </p>
        <p className="login-error" role="status">
          {props.accountError}
        </p>
      </section>
    );
  }

  if (account !== undefined && account.username !== null) {
    return (
      <section className="login-card login-account" aria-labelledby="login-account-title">
        <h2 id="login-account-title">YOUR NAME</h2>
        <p className="login-account-name">{account.username}</p>
        <button type="button" className="login-grey login-change-name" onClick={props.onChangeName}>
          CHANGE NAME
        </button>
        <p className="login-hint login-account-line">
          {account.test ? (
            `Signed in with a test account (${account.id})`
          ) : (
            <>
              Signed in with Discord as{" "}
              <strong className="login-discord-name">{account.discordUsername}</strong>
            </>
          )}
          {" · "}
          <button type="button" className="login-sign-out" onClick={props.onSignOut}>
            Sign out
          </button>
        </p>
        <p className="login-error" role="status">
          {props.accountError}
        </p>
      </section>
    );
  }

  // Waiting for /me (or it failed), or for a first sign-in's name: the signed-in card's lines,
  // blank, with the error (if any) over them.
  const pending = account === undefined;
  return (
    <section
      className="login-card login-account login-account-blank"
      aria-labelledby={pending ? undefined : "login-account-title"}
      aria-busy={pending && props.accountError === "" ? true : undefined}
    >
      {pending ? (
        <h2 aria-hidden="true">{BLANK}</h2>
      ) : (
        <h2 id="login-account-title">YOUR NAME</h2>
      )}
      <p className="login-account-name" aria-hidden="true">
        {BLANK}
      </p>
      <span className="login-account-button" aria-hidden="true" />
      <p className="login-hint login-account-line" aria-hidden="true">
        {BLANK}
      </p>
      <p className="login-error login-account-message" role="status">
        {props.accountError}
      </p>
    </section>
  );
}
