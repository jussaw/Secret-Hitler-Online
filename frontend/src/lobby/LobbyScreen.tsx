import { useRef, useState } from "react";
import { Copy, Eye, Minus, Plus, UserPlus } from "lucide-react";
import { ABOUT_URL, ISSUES_URL, MAX_PLAYERS, MIN_PLAYERS } from "../constants";
import SoundControl from "../sound/SoundControl";
import SpectatorCount from "../spectator/SpectatorCount";
import { BOT_SKILLS, type BotSkill } from "../types";
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
  /** The bots the game will seat, as the lobby packet names them (`Bot 1`, `Bot 2`, …). */
  bots: string[];
  /** The level the bots play at, as the lobby packet says. */
  botSkill: BotSkill;
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
  /** The host's stepper: asks the server for this many bots, which it keeps inside the range. */
  onSetBots: (count: number) => void;
  /** The host's switch: asks the server for this level. */
  onSetBotSkill: (skill: BotSkill) => void;
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
 * A host's press, held until the next lobby packet answers it: `fromPacket` is what the last
 * packet says, and `bots` that packet's bots, which App makes anew from every lobby packet. After
 * `hold(value)` the page shows `value` until `bots` changes, and then the packet's value again,
 * whatever the server made of the press.
 */
function useHeldUntilNextPacket<T>(bots: string[], fromPacket: T): [T, (value: T) => void] {
  const [held, setHeld] = useState<{ on: string[]; value: T } | null>(null);
  const shown = held !== null && held.on === bots ? held.value : fromPacket;
  return [shown, (value: T) => setHeld({ on: bots, value })];
}

/**
 * The host's stepper, at the left of START GAME: − 2 BOTS +. People and bots together stay between
 * MIN_PLAYERS and MAX_PLAYERS, so − is off at the fewest bots that make a table of five and + at
 * the most that keep it at ten (the server keeps the count inside the same range). A press asks
 * the server for one bot fewer or more, and the stepper shows that count until the next lobby
 * packet, a new `bots`, answers: so a second press before then steps on from the first rather than
 * asking for the same count again. The roster's rows are the packets' alone.
 */
function BotStepper(props: { people: number; bots: string[]; onSetBots: (count: number) => void }) {
  const { people, bots, onSetBots } = props;
  const [count, hold] = useHeldUntilNextPacket(bots, bots.length);
  const fewest = Math.max(0, MIN_PLAYERS - people);
  const most = Math.max(0, MAX_PLAYERS - people);
  const press = (next: number) => {
    hold(next);
    onSetBots(next);
  };
  return (
    <div className="lobby-bots" role="group" aria-label="Bots">
      <button
        type="button"
        className="lobby-bots-step"
        aria-label="Fewer bots"
        disabled={count <= fewest}
        onClick={() => press(count - 1)}
      >
        <Minus className="lobby-bots-icon" aria-hidden="true" />
      </button>
      <span className="lobby-bots-count">
        <span className="lobby-bots-number">{count}</span> <span className="lobby-bots-word">{count === 1 ? "BOT" : "BOTS"}</span>
      </span>
      <button
        type="button"
        className="lobby-bots-step"
        aria-label="More bots"
        disabled={count >= most}
        onClick={() => press(count + 1)}
      >
        <Plus className="lobby-bots-icon" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The host's BOT SKILL row, under START GAME's row (#72): the label, then EASY, NORMAL and HARD,
 * the level the bots play at pressed. It stays on with no bots to seat, so the level is ready when
 * someone leaves. A press shows the new level at once and asks the server for it, and the switch
 * shows that level until the next lobby packet, a new `bots`, answers, as the stepper does: the
 * packet then says the server's level, whatever it is. A press of the level shown sends nothing.
 */
function BotSkillSwitch(props: { skill: BotSkill; bots: string[]; onSetBotSkill: (skill: BotSkill) => void }) {
  const { bots, onSetBotSkill } = props;
  const [shown, hold] = useHeldUntilNextPacket(bots, props.skill);
  const press = (skill: BotSkill) => {
    if (skill === shown) return;
    hold(skill);
    onSetBotSkill(skill);
  };
  return (
    <div className="lobby-skill" role="group" aria-label="Bot skill">
      <span className="lobby-skill-label" aria-hidden="true">
        BOT SKILL
      </span>
      <div className="lobby-skill-options">
        {BOT_SKILLS.map((skill) => (
          <button
            key={skill}
            type="button"
            className="lobby-skill-option"
            aria-pressed={skill === shown}
            onClick={() => press(skill)}
          >
            {skill}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Everyone else's line in the same place as the host's BOT SKILL row: the label, then the level
 * the bots play at, without buttons.
 */
function BotSkillLine(props: { skill: BotSkill }) {
  return (
    <p className="lobby-skill-line">
      <span className="lobby-skill-label">BOT SKILL</span> <span className="lobby-skill-level">{props.skill}</span>
    </p>
  );
}

/**
 * The lobby page below the prompts: the game's header, the roster of players and bots beside (or,
 * in tall windows and on phones, above) the code card, the status line, the buttons and the footer
 * links. A player gets CHANGE NAME, CHANGE LOOK, WATCH INSTEAD and LEAVE LOBBY (the host the bot
 * stepper and START GAME above them, with the BOT SKILL row under those); a spectator PLAY INSTEAD
 * signed in, SIGN IN TO PLAY signed out, and LEAVE LOBBY, with a note under them when there is
 * something to say. Everyone but the host sees the bots' level on a line above their buttons, where
 * the host's BOT SKILL row is.
 */
export default function LobbyScreen(props: LobbyScreenProps) {
  const { usernames, bots, icons, user, spectator } = props;
  const linkField = useRef<HTMLInputElement>(null);
  const isHost = !spectator && usernames.length > 0 && usernames[0] === user;
  const everyonePicked = usernames.every((name) => !isPicking(name, icons));
  // Bots give their seats up to people, so only people fill the lobby.
  const full = usernames.length >= MAX_PLAYERS;
  const status = lobbyStatus(usernames, icons, { user, spectator }, bots.length);
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
            <span className="lobby-player-count">{`${usernames.length + bots.length} / ${MAX_PLAYERS}`}</span>
          </div>
          <LobbyRoster usernames={usernames} bots={bots} icons={icons} user={spectator ? "" : user} />
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
            {isHost ? (
              // START GAME's row and the BOT SKILL row under it, in a column as wide as the wider.
              <div className="lobby-host-controls">
                <div className="lobby-start-row">
                  <BotStepper people={usernames.length} bots={bots} onSetBots={props.onSetBots} />
                  <button
                    type="button"
                    className="lobby-start"
                    disabled={!everyonePicked}
                    onClick={props.onStartGame}
                  >
                    START GAME
                  </button>
                </div>
                <BotSkillSwitch skill={props.botSkill} bots={bots} onSetBotSkill={props.onSetBotSkill} />
              </div>
            ) : (
              <BotSkillLine skill={props.botSkill} />
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
            {/* Each in a new tab, so the lobby stays open. */}
            <OutLink href={ABOUT_URL}>About this project</OutLink>
            {" · "}
            <OutLink href={ISSUES_URL}>Report a bug</OutLink>
          </footer>
        </main>
      </div>
    </div>
  );
}
