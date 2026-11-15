import React, { Component } from "react";
import "./App.css";
import "./fonts.css";
import CustomAlert, { ALERT_FADE_OUT_MS } from "./custom-alert/CustomAlert";
import RoleAlert from "./custom-alert/RoleAlert";
import EventBar from "./event-bar/EventBar";
import GameScreen from "./game/GameScreen";
import { RoundStep, stepForPolicyLine, stepForState } from "./game/roundStep";

// TODO: replace constants with enums from types
import {
  PAGE,
  RECONNECT_DELAYS,
  REPLY_TIMEOUT,
  PARAM_REJOIN_KEY,
  SERVER_ADDRESS_HTTP,
  NEW_LOBBY,
  CHECK_LOGIN,
  SERVER_ADDRESS,
  WEBSOCKET,
  PARAM_USERNAMES,
  PARAM_STATE,
  STATE_CHANCELLOR_NOMINATION,
  STATE_CHANCELLOR_VOTING,
  PARAM_PRESIDENT,
  STATE_LEGISLATIVE_PRESIDENT,
  STATE_LEGISLATIVE_CHANCELLOR,
  PARAM_PACKET_TYPE,
  PACKET_LOBBY,
  PACKET_GAME_STATE,
  PACKET_INVESTIGATION,
  PACKET_OK,
  STATE_SETUP,
  STATE_POST_LEGISLATIVE,
  STATE_LEGISLATIVE_PRESIDENT_VETO,
  STATE_PP_INVESTIGATE,
  STATE_PP_EXECUTION,
  STATE_PP_ELECTION,
  STATE_PP_PEEK,
  PLAYER_IS_ALIVE,
  PARAM_TARGET,
  STATE_FASCIST_VICTORY_ELECTION,
  STATE_FASCIST_VICTORY_POLICY,
  STATE_LIBERAL_VICTORY_EXECUTION,
  STATE_LIBERAL_VICTORY_POLICY,
  WEBSOCKET_HEADER,
  DEBUG,
  PACKET_PONG,
  PING_INTERVAL,
  SERVER_PING,
  PARAM_ICON,
  PARAM_INVESTIGATION,
  PARAM_SPECTATOR,
  PARAM_SPECTATOR_COUNT,
  PARAM_YOU,
  MAX_PLAYERS,
} from "./constants";

import PlayerDisplay, {
  DISABLE_EXECUTED_PLAYERS,
  DISABLE_NONE,
} from "./player/PlayerDisplay";
import VotingPrompt from "./custom-alert/VotingPrompt";
import PresidentLegislativePrompt from "./custom-alert/PresidentLegislativePrompt";
import ChancellorLegislativePrompt from "./custom-alert/ChancellorLegislativePrompt";
import VetoPrompt from "./custom-alert/VetoPrompt";
import ElectionTrackerAlert from "./custom-alert/ElectionTrackerAlert";
import PolicyEnactedAlert from "./custom-alert/PolicyEnactedAlert";
import {
  SelectExecutionPrompt,
  SelectInvestigationPrompt,
  SelectNominationPrompt,
  SelectSpecialElectionPrompt,
} from "./custom-alert/SelectPlayerPrompt";
import ButtonPrompt from "./custom-alert/ButtonPrompt";
import PeekPrompt from "./custom-alert/PeekPrompt";
import InvestigationAlert from "./custom-alert/InvestigationAlert";

import VictoryFascistHeader from "./assets/victory-fascist-header.png";
import VictoryLiberalHeader from "./assets/victory-liberal-header.png";
import IconSelection from "./custom-alert/IconSelection";
import { defaultPortrait } from "./assets";
import LobbyScreen from "./lobby/LobbyScreen";
import Cookies from "js-cookie";
import {
  GameState,
  LobbyState,
  Role,
  ServerRequestPayload,
  WSCommand,
  WSCommandType,
} from "./types";
import { sounds, type SoundName } from "./sound/SoundManager";
import SoundControl from "./sound/SoundControl";
import { CONNECT_ERROR, CONTACT_ERROR, joinErrorMessage } from "./lobby/joinError";
import { normalizeCode } from "./lobby/normalizeCode";
import LoginScreen from "./login/LoginScreen";
import NamePrompt from "./custom-alert/NamePrompt";
import {
  discordSignInHref,
  fetchMe,
  saveUsername,
  signOut,
  testSignIn,
  type Me,
} from "./account/account";
import { lobbySounds, SOUND_CUES, soundEvents, type Cue } from "./sound/soundEvents";
import {
  VICTORY_TEXT,
  policyText,
  resultText,
  trackerText,
  waitingText,
} from "./spectator/spectatorStatus";

const EVENT_BAR_FADE_OUT_DURATION = 500;

const DEFAULT_GAME_STATE: GameState = {
  liberalPolicies: 0,
  fascistPolicies: 0,
  discardSize: 0,
  drawSize: 17,
  players: {},
  playerOrder: [],
  state: LobbyState.SETUP,
  president: "",
  chancellor: "",
  electionTracker: 0,
  vetoOccurred: false,
  lastState: LobbyState.SETUP,
  lastChancellor: "",
  lastPresident: "",
  electionTrackerAdvanced: false,
  userVotes: {},
  presidentChoices: [],
  chancellorChoices: [],
  targetUser: "",
  lastPolicy: "",
  peek: [],
  icon: {},
};

const COOKIE_LOBBY = "lobby";
/** "true" while this browser watches COOKIE_LOBBY as a spectator, so a refresh goes back to it. */
const COOKIE_SPECTATOR = "spectator";
/** Under JOIN when the connection to the lobby is lost for good. */
const DISCONNECTED_ERROR = "Disconnected from the lobby.";
/** The snackbar when the server refuses a PLAY INSTEAD seat after its check passed. */
const SEAT_REFUSED = "Could not take a seat. You are still watching.";
/** The snackbar while reconnecting. */
const RETRYING = "Lost connection to the server: retrying...";
/** The close code the server refuses a socket with, and closes one with after a bad command. */
const CLOSE_REFUSED = 1002;
/** How long a spectator's status line shows what happened, in place of a player's alert. */
const SPECTATOR_RESULT_MS = 3000;
/** The account card's line after a failed Discord sign-in (the server sends the page to ?signin=failed). */
const SIGN_IN_FAILED = "Signing in with Discord failed. Please try again.";

/** The account's name prompt: CHOOSE A NAME after a first sign-in, or CHANGE NAME. */
type NamePromptKind = "choose" | "change";

/** A random PARAM_REJOIN_KEY: 128 bits as hex. getRandomValues works on plain http pages too. */
function newRejoinKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

if (DEBUG) {
  console.warn("Running in debug mode.");
}

// TODO: Turn App into a functional component
// TODO: Refactor out pages into separate components
// TODO: Refactor out AnimationQueue

// TODO: Remove this type and replace with actual state variables.
type AppState = {
  page: PAGE;
  /** GET /me's answer: undefined until it comes, and when it failed (accountError says so). */
  account?: Me;
  /** The account card's error line: CONTACT_ERROR when /me failed, or a failed Discord sign-in. */
  accountError: string;
  /** The JOIN A GAME card's code field, shared by JOIN and WATCH. */
  joinLobby: string;
  /** The JOIN A GAME card's error line. */
  joinError: string;
  /** The OR START ONE card's error line. */
  createLobbyError: string;
  /** Why PLAY INSTEAD took no seat ("" for none): the note under a signed-in spectator's buttons. */
  playInsteadError: string;
  /** The viewer's own name: the packets' `you` (a seat's name in a game), "" for a spectator. */
  name: string;
  lobby: string;
  /** Watching without a seat: name is "", and no prompt is ever queued. */
  spectator: boolean;
  spectatorCount: number;
  usernames: string[];
  icons: { [key: string]: string };
  gameState: GameState;
  /* Stores the last gameState[PARAM_STATE] value to check for changes. */
  lastState: any;
  liberalPolicies: number;
  fascistPolicies: number;
  /*The position of the election tracker, ranging from 0 to 3.*/
  electionTracker: number;
  showVotes: boolean;
  drawDeckSize: number;
  discardDeckSize: number;
  snackbarMessage: string;
  showAlert: boolean;
  alertContent: JSX.Element;
  /** The prompt overlay's key: toLoginPage changes it, so the overlay it closes goes at once. */
  alertKey: number;
  showEventBar: boolean;
  eventBarMessage: string;
  statusBarText: string;
  /** The round step lit beside the status line; null until a line lights one. */
  statusStep: RoundStep | null;
  allAnimationsFinished: boolean;
};

/** The login page's code field and error lines, which are filled and emptied together. */
type LoginForm = Pick<AppState, "joinLobby" | "joinError" | "createLobbyError">;

/** The login page's code field as given, and its error lines empty unless JOIN's is given. */
function loginForm(lobby = "", joinError = ""): LoginForm {
  return { joinLobby: lobby, joinError, createLobbyError: "" };
}

const defaultAppState: AppState = {
  page: PAGE.LOGIN,
  accountError: "",
  ...loginForm(),
  playInsteadError: "",
  name: "P1",
  lobby: "AAAAAA",
  spectator: false,
  spectatorCount: 0,
  usernames: [],
  icons: {},
  gameState: DEFAULT_GAME_STATE,
  lastState: {},
  liberalPolicies: 0,
  fascistPolicies: 0,
  electionTracker: 0,
  showVotes: false,
  drawDeckSize: 17,
  discardDeckSize: 0,
  snackbarMessage: "",
  showAlert: false,
  alertContent: <div />,
  alertKey: 0,
  showEventBar: false,
  eventBarMessage: "",
  statusBarText: "---",
  statusStep: null,
  allAnimationsFinished: true,
};

class App extends Component<{}, AppState> {
  websocket?: WebSocket = undefined;
  /** Reconnects tried since the last message; each waits its RECONNECT_DELAYS entry. */
  reconnectAttempts: number = 0;
  /** A reconnect waiting its turn after a lost socket; this.websocket is undefined meanwhile. */
  reconnectTimer?: ReturnType<typeof setTimeout> = undefined;
  /**
   * True from a lost socket until the server takes a reconnect's socket (its first message), through
   * any number of attempts that fail. A press in a game meanwhile waits in pendingCommands.
   */
  reconnecting = false;
  /** Presses made in a game while reconnecting, sent in order once the server takes the new socket. */
  pendingCommands: string[] = [];
  /** Whether the current socket has had a message: one the server refuses closes before its first. */
  socketAnswered = false;
  /** Due REPLY_TIMEOUT after a new socket or a ping, unless a message comes first. */
  replyTimer?: ReturnType<typeof setTimeout> = undefined;
  /** This page's PARAM_REJOIN_KEY, for the lifetime of the page. */
  readonly rejoinKey = newRejoinKey();
  pingInterval?: ReturnType<typeof setInterval> = undefined;
  reconnectOnConnectionClosed: boolean = true;
  snackbarMessages: number = 0;
  animationQueue: (() => void)[] = [];
  /** Bumped when an animation step starts and when the queue is cleared: names the running step. */
  animationStep = 0;
  /** What to do on the server's next OK, each with the animationStep it was added in. */
  okMessageListeners: { step: number; func: () => void }[] = [];
  allAnimationsFinished: boolean = true;
  gameOver: boolean = false;
  /** The last game state this socket delivered, the lobby (SETUP), or none yet: see soundEvents. */
  soundState?: GameState = undefined;
  /** The last lobby list this socket delivered, for playerJoined. */
  lobbyUsers?: string[] = undefined;
  /** Vote-tally sounds that a running showVotes has scheduled. */
  soundTimers: ReturnType<typeof setTimeout>[] = [];
  /**
   * The PLAY INSTEAD under way (its check on its way, or CHOOSE A NAME to answer first), by its
   * playInsteadSession, or 0 for none. Leaving, a game starting and the name prompt closing
   * unanswered end it (cancelPlayInstead), so a late answer takes no seat.
   */
  playInsteadPending = 0;
  /** Counts the PLAY INSTEAD presses, so a check that began under an earlier one does nothing. */
  playInsteadSession = 0;
  /** True while the PLAY INSTEAD under way waits for CHOOSE A NAME's CONTINUE to save a name. */
  playInsteadAwaitsName = false;
  /**
   * True from PLAY INSTEAD opening a player's socket until that socket's first message. A close
   * before then is the server refusing the seat (the game started, the last seat went, the
   * account joined from another tab), so the person goes back to watching.
   */
  seatPending = false;
  /** Counts the alerts shown, so a late fade timer does not blank a newer alert. */
  alertShowCount = 0;
  /** The alertShowCount at which the portrait picker was shown: it is on screen while this matches. */
  pickerShownAt = -1;
  /** True from the name prompt (CHOOSE A NAME or CHANGE NAME) being queued until it closes. */
  namePromptOpen = false;
  /** True while the name prompt is on screen (not just queued). */
  namePromptShown = false;
  /** Which name prompt is open, while one is. */
  namePromptKind: NamePromptKind = "choose";
  /** The queued step that shows the name prompt, so a prompt closed before it shows can be dropped. */
  namePromptStep?: () => void = undefined;
  /** Counts the name prompt's openings, so a reply that began under an earlier one touches no later one. */
  namePromptSession = 0;
  /**
   * Counts the requests that set the account (/me, test sign-in), so only the latest one's answer
   * shows. A saved name counts too: a /me asked before it may not have the name yet.
   */
  accountRequest = 0;
  /** True while TEST SIGN-IN's request is on its way: another press does nothing. */
  testSigningIn = false;
  /** True from Sign out (on the card or in CHOOSE A NAME) until the page has asked /me again. */
  signingOut = false;
  /** Whether the page opened on ?signin=failed (componentDidMount takes it out of the address). */
  readonly signInFailed: boolean;

  // noinspection DuplicatedCode
  constructor(props: any) {
    super(props);

    let lobby = Cookies.get(COOKIE_LOBBY) ? Cookies.get(COOKIE_LOBBY) : "";
    const query = new URLSearchParams(window.location.search);
    // A lobby link (?lobby=CODE) fills the code field in place of the saved lobby.
    const linked = query.get("lobby");
    this.signInFailed = query.get("signin") === "failed";

    this.state = {
      ...defaultAppState,
      ...loginForm(linked !== null ? normalizeCode(linked) : lobby || ""),
    };

    // These are necessary for handling class fields safely (ex: websocket)
    this.onWebSocketClose = this.onWebSocketClose.bind(this);
    this.tryOpenWebSocket = this.tryOpenWebSocket.bind(this);
    this.onClickLeaveLobby = this.onClickLeaveLobby.bind(this);
    this.onClickStartGame = this.onClickStartGame.bind(this);
    this.sendWSCommand = this.sendWSCommand.bind(this);
    this.showSnackBar = this.showSnackBar.bind(this);
    this.onAnimationFinish = this.onAnimationFinish.bind(this);
    this.onGameStateChanged = this.onGameStateChanged.bind(this);
    this.hideAlertAndFinish = this.hideAlertAndFinish.bind(this);
    this.onClickWatchInstead = this.onClickWatchInstead.bind(this);
    this.onClickPlayInstead = this.onClickPlayInstead.bind(this);
    this.onCopied = this.onCopied.bind(this);
    this.closeSocket = this.closeSocket.bind(this);
    this.openSeat = this.openSeat.bind(this);
    this.openWatch = this.openWatch.bind(this);
    this.addAnimationToQueue = this.addAnimationToQueue.bind(this);
    this.clearAnimationQueue = this.clearAnimationQueue.bind(this);
    this.queueAlert = this.queueAlert.bind(this);
    this.showChangeIconAlert = this.showChangeIconAlert.bind(this);
    this.updateChangeIconAlert = this.updateChangeIconAlert.bind(this);
    this.onClickChangeIcon = this.onClickChangeIcon.bind(this);
    this.closeNamePrompt = this.closeNamePrompt.bind(this);
    this.dropNamePrompt = this.dropNamePrompt.bind(this);

    // Ping the server to wake it up if it's not currently being used
    // This reduces the delay users experience when starting lobbies
    fetch(SERVER_ADDRESS_HTTP + SERVER_PING);
  }

  /////////// Server Communication
  // <editor-fold desc="Server Communication">

  /**
   * Attempts to request the server to create a new lobby and returns the response.
   * @return {Promise<Response>}
   */
  async tryCreateLobby() {
    return fetch(SERVER_ADDRESS_HTTP + NEW_LOBBY);
  }

  /**
   * Checks that this page's account can play in the lobby. The server knows the account by the
   * session cookie, so no name is sent.
   * @param lobby the lobby code.
   * @return {Promise<Response>} The response from the server.
   */
  async tryLogin(lobby: string) {
    return await fetch(SERVER_ADDRESS_HTTP + CHECK_LOGIN + "?lobby=" + encodeURIComponent(lobby));
  }

  /**
   * Checks that a spectator can watch the lobby (it exists).
   * @param lobby the lobby code.
   * @return {Promise<Response>} The response from the server: 200, or 404 for an unknown lobby.
   */
  async tryWatchLogin(lobby: string) {
    return await fetch(
      SERVER_ADDRESS_HTTP +
        CHECK_LOGIN +
        "?lobby=" +
        encodeURIComponent(lobby) +
        "&" +
        PARAM_SPECTATOR +
        "=true"
    );
  }

  /**
   * Asks who the page is signed in as, taking a failed Discord sign-in's ?signin=failed out of the
   * address (a lobby link's ?lobby= stays). A spectator who reloads goes straight back to watching
   * their lobby (COOKIE_SPECTATOR).
   */
  componentDidMount() {
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    const url = new URL(window.location.href);
    if (url.searchParams.has("signin")) {
      url.searchParams.delete("signin");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    this.loadAccount(this.signInFailed ? SIGN_IN_FAILED : "");
    const lobby = Cookies.get(COOKIE_LOBBY);
    const linked = new URLSearchParams(window.location.search).get("lobby");
    const otherLobby = linked !== null && normalizeCode(linked) !== lobby;
    if (Cookies.get(COOKIE_SPECTATOR) === "true" && lobby && !otherLobby) {
      this.watch(lobby);
    }
  }

  componentWillUnmount() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  /**
   * A page coming back into view (a phone's screen on again, a tab brought forward) pings at once,
   * so a socket that died while it was away is found within REPLY_TIMEOUT.
   */
  onVisibilityChange = () => {
    if (document.visibilityState === "visible" && this.websocket && !this.reconnecting) {
      this.ping();
    }
  };

  /** Pings the server, which answers with a pong; no answer within REPLY_TIMEOUT means the socket is dead. */
  ping() {
    this.sendWSCommand({ command: WSCommandType.PING });
    this.awaitReply();
  }

  /** Starts (or restarts) the wait for the current socket's next message. */
  awaitReply() {
    this.clearReplyTimer();
    const ws = this.websocket;
    this.replyTimer = setTimeout(() => {
      this.replyTimer = undefined;
      if (ws === this.websocket) this.onNoReply();
    }, REPLY_TIMEOUT);
  }

  clearReplyTimer() {
    if (this.replyTimer !== undefined) {
      clearTimeout(this.replyTimer);
      this.replyTimer = undefined;
    }
  }

  /** The server has not answered in time: the socket is dead, though the browser has not said so. */
  onNoReply() {
    console.log(`No reply from the server in ${REPLY_TIMEOUT / 1000} s: the socket is dead.`);
    this.closeSocket(); // the browser may take minutes to fire its close
    this.onWebSocketClose();
  }

  /**
   * Attempts to open a WebSocket with the server. A player's socket is the account of the page's
   * session cookie, so no name is sent.
   * @param name the name the page shows as the player's ("" for a spectator).
   * @param lobby the lobby to connect with.
   * @param spectator whether to watch without a seat.
   * @effects If a connection was successfully established, sets the state with the {@code name}, {@code lobby},
   *          and {@code ws} parameters. The WebSocket has a message callback to this.onWebSocketMessage().
   * @return {boolean} true if the connection was opened successfully. Otherwise, returns false.
   */
  tryOpenWebSocket(name: string, lobby: string, spectator = false) {
    if (DEBUG) {
      console.log("Opening connection with lobby: " + lobby);
      console.log("Reconnect attempts: " + this.reconnectAttempts);
    }
    // Logged without the rejoin key, so a console log can be shared.
    const shownUrl =
      WEBSOCKET_HEADER +
      SERVER_ADDRESS +
      WEBSOCKET +
      (spectator ? "?" + PARAM_SPECTATOR + "=true&" : "?") +
      "lobby=" +
      encodeURIComponent(lobby);
    // A player's socket brings the page's key, so a reconnect can take the seat back from a socket
    // the server has not yet seen die. A spectator has no seat to take back.
    const url = spectator ? shownUrl : shownUrl + "&" + PARAM_REJOIN_KEY + "=" + this.rejoinKey;
    if (DEBUG) {
      console.trace("TryOpenWebsocket URL: " + shownUrl);
    }

    // Build the new socket first: if that throws, the old one is left as it was.
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return false;
    }

    this.closeSocket();
    this.clearReconnectTimer(); // this socket takes the place of any reconnect still waiting

    console.log("Websocket created for " + shownUrl);
    this.websocket = ws;
    this.socketAnswered = false;
    this.awaitReply(); // the server sends the state as soon as it takes the socket
    this.seatPending = false;
    // A new socket has no history, so its first packet plays no sounds (no burst on reconnect).
    this.soundState = undefined;
    this.lobbyUsers = undefined;
    this.reconnectOnConnectionClosed = true;
    // A switch or a reconnect within the lobby on screen keeps its players until the first packet,
    // so the page never shows an empty lobby; the login page and RETURN TO LOBBY start empty.
    const sameLobby = this.state.page === PAGE.LOBBY && lobby === this.state.lobby;
    // Only move the player to the lobby page if they were logging in.
    // This is to prevent the bug where players flash in/out of the lobby page
    // at random points in the game.
    if (this.state.page === PAGE.LOGIN) {
      this.setState({ page: PAGE.LOBBY });
    }
    if (!sameLobby) {
      this.setState({ usernames: [] });
    }
    this.setState({
      name: name,
      lobby: lobby,
      spectator: spectator,
      ...loginForm(),
      playInsteadError: "",
    });
    ws.onmessage = (msg) => this.onWebSocketMessage(msg);
    ws.onclose = (event) => {
      if (ws === this.websocket) this.onWebSocketClose(event);
    };

    // Ping the web server at a set interval.
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.pingInterval = setInterval(() => this.ping(), PING_INTERVAL);

    return true;
  }

  /** Closes the current socket without the reconnect or leave path of onWebSocketClose. */
  closeSocket() {
    this.clearReplyTimer();
    if (this.websocket) {
      // Clear onClose event to prevent reconnection
      this.websocket.onclose = () => {};
      this.websocket.close();
      this.websocket = undefined;
    }
  }

  /**
   * Opens a player's socket, under the account's name, and remembers the lobby, as every join
   * does: a reload fills the code field with it, and JOIN takes the seat back.
   * @param name the name the page shows until the first packet's `you`: the account's.
   * @return {boolean} whether the socket opened.
   */
  openSeat(lobby: string, name = this.accountName()): boolean {
    this.stopReconnecting(); // a user action starts a fresh connection
    this.reconnectAttempts = 0;
    if (!this.tryOpenWebSocket(name, lobby)) return false;
    Cookies.set(COOKIE_LOBBY, lobby);
    Cookies.remove(COOKIE_SPECTATOR);
    return true;
  }

  /**
   * Opens a spectator's socket and remembers it (COOKIE_SPECTATOR).
   * @return {boolean} whether the socket opened.
   */
  openWatch(lobby: string): boolean {
    this.stopReconnecting(); // a user action starts a fresh connection
    this.reconnectAttempts = 0;
    if (!this.tryOpenWebSocket("", lobby, true)) return false;
    Cookies.set(COOKIE_LOBBY, lobby);
    Cookies.set(COOKIE_SPECTATOR, "true");
    return true;
  }

  /**
   * Called when the websocket closes.
   * @param event the close event: its code and reason say why (1006 for a network that dropped,
   *        1001 for the server's idle timeout, 1002 with the server's reason for a refusal).
   * @effects attempts to reopen the websocket connection, the first time at once and then after the
   *          waits in {@code RECONNECT_DELAYS}. If the user pressed the "Leave Lobby" button, the
   *          server refused the socket outright, or every attempt has failed, does not reopen the
   *          websocket connection and returns the user to the login screen with a relevant error
   *          message.
   */
  onWebSocketClose(event?: CloseEvent) {
    // Clear the server ping interval when the socket is closed.
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.clearReplyTimer();

    // When, what and how: what a player noting a drop needs (#26). The URL, with its key, is left out.
    console.log(
      `${new Date().toISOString()} A websocket closed (code ${event?.code}, reason ` +
        `"${event?.reason ?? ""}") in lobby ${this.state.lobby}, page ${document.visibilityState}, ` +
        `after ${this.reconnectAttempts} reconnect attempts.`
    );

    if (this.seatPending && this.reconnectOnConnectionClosed) {
      // The server refused the PLAY INSTEAD seat after its check: keep watching.
      this.seatPending = false;
      if (this.openWatch(this.state.lobby)) {
        this.showSnackBar(SEAT_REFUSED);
      } else {
        this.toLoginPage(CONNECT_ERROR);
      }
      return;
    }

    if (this.reconnectOnConnectionClosed && event?.code === CLOSE_REFUSED && !this.socketAnswered) {
      // Refused outright (the lobby is gone, full or playing without us, or another page has the
      // name): every attempt would be refused alike.
      this.toLoginPage(DISCONNECTED_ERROR);
      return;
    }

    if (
      this.reconnectOnConnectionClosed &&
      this.reconnectAttempts < RECONNECT_DELAYS.length
    ) {
      if (this.reconnectAttempts >= 1) {
        // Only show the error bar if the first attempt has failed.
        this.showSnackBar(RETRYING);
      }
      this.reconnecting = true;
      const delay = RECONNECT_DELAYS[this.reconnectAttempts];
      this.reconnectAttempts += 1;
      if (delay === 0) {
        this.reconnect();
      } else {
        this.websocket = undefined; // no socket while the reconnect waits
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.reconnect();
        }, delay);
      }
    } else if (this.reconnectOnConnectionClosed) {
      this.toLoginPage(DISCONNECTED_ERROR);
    } else {
      // User purposefully closed the connection.
      if (this.gameOver) {
        // Do not reopen if the game is over, since disconnecting is intentional.
      } else {
        this.toLoginPage("");
      }
    }
  }

  /** Reopens the lost socket under the same name, lobby and role. */
  reconnect() {
    // A socket that cannot even be built is a lost connection for good.
    if (!this.tryOpenWebSocket(this.state.name, this.state.lobby, this.state.spectator)) {
      this.toLoginPage(DISCONNECTED_ERROR);
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /** Ends any reconnecting (the person has gone elsewhere): drops the wait and the pending presses. */
  stopReconnecting() {
    this.clearReconnectTimer();
    this.reconnecting = false;
    this.pendingCommands = [];
  }

  /**
   * Leaves for the login page with the lobby code filled in: stops the ping and any waiting
   * reconnect, closes the alert and any prompt at once, and empties the animation queue. An
   * account still without a name gets CHOOSE A NAME again there, and the account is asked for
   * again, so a session that ended meanwhile shows at once.
   * @param error the message under JOIN and WATCH ("" for none).
   */
  toLoginPage(error: string) {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.clearReplyTimer();
    this.stopReconnecting();
    this.setState(
      (state) => ({
        page: PAGE.LOGIN,
        ...loginForm(state.lobby, error),
        showAlert: false,
        alertContent: <div />,
        alertKey: state.alertKey + 1,
      }),
      () => this.askForName() // once the page is the login page
    );
    this.cancelPlayInstead();
    this.dropNamePrompt();
    this.clearAnimationQueue();
    this.loadAccount();
  }

  async onWebSocketMessage(msg: MessageEvent) {
    this.clearReplyTimer(); // the socket is alive
    this.socketAnswered = true;
    this.reconnectAttempts = 0;
    this.seatPending = false; // the server took the seat
    if (this.reconnecting) {
      // The server took the new socket: send the presses made while it was away, in order.
      this.reconnecting = false;
      const pending = this.pendingCommands;
      this.pendingCommands = [];
      pending.forEach((payload) => this.sendPayload(payload));
    }
    let message = JSON.parse(msg.data);
    // Decode message contents as communication is encoded
    if (DEBUG) {
      console.log(message);
    }
    // A player's packets name the viewer (`you`): their name in the lobby, after a rename made here
    // or in another tab too, and their seat's in a game. A spectator's carry none: no name.
    const you: string | undefined =
      typeof message[PARAM_YOU] === "string" && !this.state.spectator
        ? message[PARAM_YOU]
        : undefined;
    switch (message[PARAM_PACKET_TYPE]) {
      case PACKET_LOBBY: {
        this.queueSounds(lobbySounds(this.lobbyUsers, message[PARAM_USERNAMES]), "now");
        this.lobbyUsers = message[PARAM_USERNAMES];
        this.soundState = DEFAULT_GAME_STATE;
        const usernames: string[] = message[PARAM_USERNAMES];
        // The icon dialog is rebuilt from this.state, so wait for the update to apply.
        this.setState(
          (state) => ({
            usernames,
            icons: message[PARAM_ICON],
            spectatorCount: message[PARAM_SPECTATOR_COUNT] ?? 0,
            page: PAGE.LOBBY,
            name: you ?? state.name,
            // A full lobby's note says it all, and PLAY INSTEAD's error is stale after it: one from
            // before, or one that landed behind the note (a 489 answering a press made at 9 / 10).
            playInsteadError:
              usernames.length >= MAX_PLAYERS || state.usernames.length >= MAX_PLAYERS
                ? ""
                : state.playInsteadError,
          }),
          () => {
            // Back in the lobby (after a game, say): an account with no name is asked again.
            this.askForName();
            if (this.state.spectator) {
              return; // a spectator has no portrait to pick
            }
            if (message[PARAM_ICON][this.state.name] === defaultPortrait) {
              this.showChangeIconAlert();
            }
            // Follow the lobby only while the picker itself is the alert on screen: any other
            // alert, or one fading out, must not turn into a picker.
            if (this.state.showAlert && this.pickerShownAt === this.alertShowCount) {
              this.updateChangeIconAlert();
            }
          }
        );
        break;
      }

      case PACKET_GAME_STATE: {
        // A game starting while PLAY INSTEAD is under way: no seat, keep watching.
        this.cancelPlayInstead();
        // The game page has no name prompt (a spectator's status lines must not wait on one):
        // it is asked again back in the lobby or on the login page.
        this.closeNamePrompt();
        if (message !== this.state.gameState) {
          // The seat's name, as this packet gives it, before the state below has it.
          this.onGameStateChanged(message, you ?? this.state.name);
        }
        this.setState((state) => ({
          gameState: message,
          spectatorCount: message[PARAM_SPECTATOR_COUNT] ?? 0,
          page: PAGE.GAME,
          name: you ?? state.name,
        }));
        break;
      }

      case PACKET_OK: {
        // The first listener whose step is still the current one answers; one from an earlier step
        // (a later step has started since, or the queue was cleared) must not finish a later step.
        const listener = this.okMessageListeners.find((l) => l.step === this.animationStep);
        listener?.func();
        this.okMessageListeners = []; // clear all listeners.
        break;
      }

      case PACKET_INVESTIGATION:
        // Trigger investigation screen when the server responds.
        console.log(
          "Investigated player role: " + message[PARAM_INVESTIGATION]
        );
        // Set party to liberal/fascist using sent packet
        const party = message[PARAM_INVESTIGATION];

        // The president hears the investigation with this alert; everyone else with the results.
        this.queueSounds(["investigate"], "result");
        this.queueAlert(
          <InvestigationAlert
            party={party}
            target={message[PARAM_TARGET]}
            hideAlert={this.hideAlertAndFinish}
          />,
          false
        );
        break;
      case PACKET_PONG:
      default:
      // No action
    }
  }

  /**
   * Sends a specified command to the server.
   * @param command the String command label.
   * @param params a dictionary of any parameters that need to be provided with the command.
   * @effects sends a message to the server with the following parameters:
   *          {@code PARAM_COMMAND}: {@code command}
   *          {@code PARAM_LOBBY}: {@code this.state.lobby}
   *          {@code PARAM_NAME}: {@code this.state.name}
   *          and each (key, value) pair in {@code params}.
   */
  sendWSCommand(request: ServerRequestPayload) {
    // A spectator only pings and asks for the state; the server drops anything else.
    if (
      this.state.spectator &&
      request.command !== WSCommandType.PING &&
      request.command !== WSCommandType.GET_STATE
    ) {
      return;
    }
    // Do not need to encode name + lobby because this is sent through websocket
    const data: WSCommand = {
      ...request,
      name: this.state.name,
      lobby: this.state.lobby,
    };

    const payload = JSON.stringify(data);
    if (DEBUG) {
      console.log(payload);
    }
    if (this.reconnecting && request.command !== WSCommandType.PING) {
      if (this.state.page === PAGE.GAME) {
        // A press in a game closes its prompt and the table waits on it: send it once the server
        // takes the new socket (onWebSocketMessage), however many attempts that takes.
        this.pendingCommands.push(payload);
        return;
      }
      if (this.websocket === undefined) {
        // In the lobby, waiting to reconnect: the button is still there to press again, against
        // the roster as it is by then. A socket still connecting sends it once open (sendPayload).
        this.showSnackBar(RETRYING);
        return;
      }
    }
    this.sendPayload(payload);
  }

  /** Sends an encoded command on the current socket, once it has opened. */
  sendPayload(payload: string) {
    const ws = this.websocket;
    if (ws !== undefined) {
      // A socket still connecting (a switch or a reconnect in the lobby) throws on send: wait for it.
      // The number, not WebSocket.CONNECTING, so a stand-in socket without the statics works too.
      if (ws.readyState === 0) {
        ws.addEventListener("open", () => ws.send(payload), { once: true });
      } else {
        ws.send(payload);
      }
    } else {
      this.showSnackBar(
        "Could not connect to the server. Try refreshing the page if this happens again."
      );
    }
  }

  //</editor-fold>

  /////////////////// Login Page
  // <editor-fold desc="Login Page">

  /** The account's name ("" signed out or before one is chosen): the name a seat is taken under. */
  accountName(): string {
    const account = this.state.account;
    return account?.signedIn ? account.username ?? "" : "";
  }

  /**
   * The name CHANGE NAME starts from: a player's in the lobby is the one the roster shows (the
   * packets' `you`, which follows a rename made in another tab), otherwise the account's.
   */
  nameToChange(): string {
    const { page, spectator, name } = this.state;
    return page === PAGE.LOBBY && !spectator && name !== "" ? name : this.accountName();
  }

  /**
   * Asks the server who the page is signed in as (GET /me); a first sign-in then gets CHOOSE A
   * NAME. Only the latest request that sets the account is shown. When /me cannot be reached the
   * card says so: blank before any answer, and otherwise still showing the account last known, so
   * JOIN can be tried again once the server is back.
   * @param error the account card's error line once /me answers ("" for none).
   */
  async loadAccount(error = "") {
    const request = ++this.accountRequest;
    try {
      const me = await fetchMe();
      if (request === this.accountRequest) this.setAccount(me, error);
    } catch {
      if (request === this.accountRequest) this.setState({ accountError: CONTACT_ERROR });
    }
  }

  /** Shows the account, then fits the name prompt to it (syncNamePrompt). */
  setAccount(me: Me, error = "") {
    this.setState({ account: me, accountError: error }, () => this.syncNamePrompt());
  }

  /**
   * Fits the name prompt to the account: signed out, no name prompt stays open; with a name, no
   * CHOOSE A NAME stays open; signed in with no name, CHOOSE A NAME is asked for.
   */
  syncNamePrompt() {
    const account = this.state.account;
    if (!account?.signedIn) {
      this.closeNamePrompt();
    } else if (account.username !== null) {
      if (this.namePromptKind === "choose") this.closeNamePrompt();
    } else {
      this.askForName();
    }
  }

  /**
   * Queues CHOOSE A NAME for a signed-in account with no name, on the login page or in the lobby
   * only (the game page has none), unless a name prompt is open.
   */
  askForName() {
    const account = this.state.account;
    const page = this.state.page;
    if (page !== PAGE.LOGIN && page !== PAGE.LOBBY) return;
    if (account?.signedIn && account.username === null) this.queueNamePrompt("choose");
  }

  /** TEST SIGN-IN (servers with test sign-in only): signs the page in as a new test account. */
  onClickTestSignIn = async () => {
    if (this.testSigningIn) return;
    this.testSigningIn = true;
    const request = ++this.accountRequest;
    try {
      const me = await testSignIn();
      if (request === this.accountRequest) this.setAccount(me);
    } catch {
      if (request === this.accountRequest) this.setState({ accountError: CONTACT_ERROR });
    } finally {
      this.testSigningIn = false;
    }
  };

  /** CHANGE NAME: the name prompt, filled with the name. */
  onClickChangeName = () => {
    this.queueNamePrompt("change");
  };

  /** Sign out: ends the session, then shows what the server says the page is now. */
  onClickSignOut = async () => {
    if (this.signingOut) return;
    this.signingOut = true;
    try {
      let failed = false;
      try {
        await signOut();
      } catch {
        failed = true;
      }
      await this.loadAccount(failed ? CONTACT_ERROR : "");
    } finally {
      this.signingOut = false;
    }
  };

  /**
   * Queues the name prompt: CHOOSE A NAME (CONTINUE, SIGN OUT), which nothing else puts away, or
   * CHANGE NAME (SAVE, CANCEL), filled with the name. One is open at a time.
   */
  queueNamePrompt(kind: NamePromptKind) {
    if (this.namePromptOpen) return;
    this.namePromptOpen = true;
    this.namePromptKind = kind;
    const session = ++this.namePromptSession;
    const choose = kind === "choose";
    const show = () => {
      this.namePromptStep = undefined;
      this.namePromptShown = true;
      this.alertShowCount += 1;
      this.setState({
        showAlert: true,
        alertContent: (
          <NamePrompt
            key={this.alertShowCount}
            title={choose ? "CHOOSE A NAME" : "CHANGE NAME"}
            initialName={choose ? "" : this.nameToChange()}
            confirmLabel={choose ? "CONTINUE" : "SAVE"}
            secondaryLabel={choose ? "SIGN OUT" : "CANCEL"}
            onConfirm={(name) => this.saveName(name, session)}
            onSecondary={() => {
              if (session !== this.namePromptSession) return;
              this.closeNamePrompt();
              if (choose) this.onClickSignOut();
            }}
          />
        ),
      });
    };
    this.namePromptStep = show;
    this.addAnimationToQueue(show);
  }

  /**
   * Saves the name (POST /me/username) and, if it was saved, shows it on the account and closes the
   * prompt it came from. A PLAY INSTEAD waiting for that prompt then takes its seat.
   * @return {Promise<string>} "" on success or when that prompt has closed meanwhile, otherwise the
   *         error for the prompt.
   */
  async saveName(name: string, session: number): Promise<string> {
    const account = this.state.account;
    const id = account?.signedIn ? account.id : undefined;
    const result = await saveUsername(name);
    const current = this.namePromptOpen && session === this.namePromptSession;
    if (!result.ok) return current ? result.error : "";
    // The name is saved even when its prompt went meanwhile: show it, on the same account only.
    const now = this.state.account;
    const sameAccount = now?.signedIn === true && now.id === id;
    if (sameAccount) {
      // A /me asked before the save may not have the name yet, so its answer is dropped; but a
      // sign-out's /me is the truth to show.
      if (!this.signingOut) this.accountRequest += 1;
      this.setState((state) =>
        state.account?.signedIn && state.account.id === id
          ? { account: { ...state.account, username: result.username } }
          : null
      );
    }
    // A PLAY INSTEAD waiting for a name has one now: closing the prompt below ends it, and the seat
    // is taken just after. (A prompt that closed unanswered ended it already: dropNamePrompt.)
    const seat = sameAccount && this.playInsteadAwaitsName ? this.playInsteadPending : 0;
    // A CHOOSE A NAME opened again meanwhile (the page left the lobby for the login page) is
    // answered too.
    if (current || (sameAccount && this.namePromptOpen && this.namePromptKind === "choose")) {
      this.closeNamePrompt();
    }
    if (seat !== 0) {
      this.playInsteadPending = seat;
      await this.playInstead(seat, result.username);
    }
    return "";
  }

  /**
   * Closes the name prompt, if it is open.
   * @param delayExit whether the animation queue waits for the prompt's fade-out.
   */
  closeNamePrompt(delayExit = true) {
    if (!this.namePromptOpen) return;
    const shown = this.namePromptShown;
    this.dropNamePrompt();
    if (shown) this.hideAlertAndFinish(delayExit);
  }

  /**
   * Forgets the name prompt without touching the alert box: a queued prompt leaves the queue. A
   * PLAY INSTEAD waiting for its name ends with it.
   */
  dropNamePrompt() {
    this.namePromptOpen = false;
    this.namePromptShown = false;
    const step = this.namePromptStep;
    this.namePromptStep = undefined;
    if (step) this.animationQueue = this.animationQueue.filter((queued) => queued !== step);
    if (this.playInsteadAwaitsName) this.cancelPlayInstead();
  }

  /** Updates the lobby code field, which JOIN and WATCH share. */
  updateJoinLobby = (text: string) => {
    this.setState({ joinLobby: text });
  };

  /**
   * Checks that the account can play in the lobby, then opens its socket. A 401 means the page's
   * session has ended (or has no name yet), so the account is asked for again.
   */
  onClickJoin = () => {
    // Capture the form value: tryOpenWebSocket clears it via setState.
    const lobby = this.state.joinLobby;
    this.setState({ joinError: "Connecting..." });
    this.tryLogin(lobby)
      .then((response) => {
        if (!response.ok) {
          if (DEBUG) {
            console.log("Response is not ok");
          }
          this.setState({ joinError: joinErrorMessage(response.status) });
          if (response.status === 401) this.loadAccount();
        } else {
          // The account and the lobby were verified. Try to open websocket.
          if (!this.openSeat(lobby)) {
            this.setState({ joinError: CONNECT_ERROR });
          }
        }
      })
      .catch(() => {
        this.setState({ joinError: CONTACT_ERROR });
      });
  };

  /** Watches the lobby in the code field as a spectator: no name needed. */
  onClickWatch = () => {
    this.watch(this.state.joinLobby);
  };

  /**
   * Checks the lobby, then opens a spectator's socket and remembers it (COOKIE_SPECTATOR), with
   * the same messages as JOIN. On failure the lobby code stays in the form.
   */
  watch(lobby: string) {
    this.setState({ joinError: "Connecting...", joinLobby: lobby });
    this.tryWatchLogin(lobby)
      .then((response) => {
        if (!response.ok) {
          Cookies.remove(COOKIE_SPECTATOR);
          this.setState({
            joinError:
              response.status === 404 ? "The lobby could not be found." : CONNECT_ERROR,
          });
        } else if (!this.openWatch(lobby)) {
          this.setState({ joinError: CONNECT_ERROR });
        }
      })
      .catch(() => {
        this.setState({ joinError: CONTACT_ERROR });
      });
  }

  /**
   * WATCH INSTEAD (a player in the lobby): reopens the connection as a spectator. The old socket's
   * onclose is replaced in tryOpenWebSocket, so the login page is not shown. If the spectator socket
   * cannot be built, the person lands on the login page with the lobby code.
   */
  onClickWatchInstead() {
    if (this.openWatch(this.state.lobby)) return;
    this.closeSocket();
    this.toLoginPage(CONNECT_ERROR);
  }

  /**
   * PLAY INSTEAD (a signed-in spectator in the lobby): takes a seat under the account's name at
   * once, with no prompt. An account with no name yet answers CHOOSE A NAME first, and the seat is
   * taken once CONTINUE has saved the name (saveName). One press at a time.
   */
  async onClickPlayInstead() {
    const account = this.state.account;
    if (this.playInsteadPending !== 0 || !this.state.spectator || !account?.signedIn) return;
    const session = ++this.playInsteadSession;
    this.playInsteadPending = session;
    this.setState({ playInsteadError: "" });
    if (account.username === null) {
      this.playInsteadAwaitsName = true;
      this.queueNamePrompt("choose"); // nothing new if CHOOSE A NAME is already open or queued
      return;
    }
    await this.playInstead(session);
  }

  /** Ends the PLAY INSTEAD under way, if any: its check, or a name saved later, takes no seat. */
  cancelPlayInstead() {
    this.playInsteadPending = 0;
    this.playInsteadAwaitsName = false;
  }

  /**
   * Checks that the account can play here, then reopens the connection as a player, under the
   * account's name. Whoever cannot stays watching, with the reason under the buttons. Does nothing
   * once its PLAY INSTEAD has ended (cancelPlayInstead).
   * @param session the PLAY INSTEAD this check belongs to.
   * @param name the account's name; a name just saved is passed, as the state may not show it yet.
   */
  async playInstead(session: number, name = this.accountName()) {
    const lobby = this.state.lobby;
    let response: Response | undefined;
    try {
      response = await this.tryLogin(lobby);
    } catch {
      // handled below
    }
    // Left, or a game started, meanwhile: keep watching, show nothing.
    if (session !== this.playInsteadPending) return;
    this.playInsteadPending = 0;
    if (response === undefined) {
      this.setState({ playInsteadError: CONTACT_ERROR });
    } else if (!response.ok) {
      this.setState({ playInsteadError: joinErrorMessage(response.status) });
      // The session has ended (or has no name): the account shows what it is now.
      if (response.status === 401) this.loadAccount();
    } else if (!this.openSeat(lobby, name)) {
      this.setState({ playInsteadError: CONNECT_ERROR });
    } else {
      this.seatPending = true;
    }
  }

  /**
   * Asks the server for a new lobby, then opens the account's socket to it. A 401 means the page's
   * session has ended (or has no name yet), so the account is asked for again.
   */
  onClickCreateLobby = () => {
    this.setState({ createLobbyError: "Connecting..." });
    this.tryCreateLobby()
      .then((response) => {
        if (response.ok) {
          response.text().then((lobbyCode) => {
            if (!this.openSeat(lobbyCode)) {
              // if the connection failed
              this.setState({ createLobbyError: CONNECT_ERROR });
            }
          });
        } else if (response.status === 401) {
          this.setState({ createLobbyError: joinErrorMessage(401) });
          this.loadAccount();
        } else {
          this.setState({ createLobbyError: CONNECT_ERROR });
        }
      })
      .catch(() => {
        this.setState({ createLobbyError: CONNECT_ERROR });
      });
  };

  /** The login page (CHOOSE A NAME and CHANGE NAME open over it, in render's prompt overlay). */
  renderLoginPage() {
    return (
      <LoginScreen
        account={this.state.account}
        accountError={this.state.accountError}
        discordHref={discordSignInHref(this.state.joinLobby)}
        lobby={this.state.joinLobby}
        joinError={this.state.joinError}
        createLobbyError={this.state.createLobbyError}
        onLobbyChange={this.updateJoinLobby}
        onJoin={this.onClickJoin}
        onWatch={this.onClickWatch}
        onCreateLobby={this.onClickCreateLobby}
        onTestSignIn={this.onClickTestSignIn}
        onChangeName={this.onClickChangeName}
        onSignOut={this.onClickSignOut}
      />
    );
  }

  //</editor-fold>

  /////////////////// Lobby Page
  //<editor-fold desc="Lobby Page">

  onClickChangeIcon() {
    this.showChangeIconAlert();
  }

  updateChangeIconAlert() {
    this.setState({
      alertContent: (
        <IconSelection
          onConfirm={() => {
            this.clearAnimationQueue();
            this.hideAlertAndFinish();
          }}
          sendWSCommand={this.sendWSCommand}
          playerToIcon={this.state.icons}
          players={this.state.usernames}
          user={this.state.name}
        />
      ),
    });
  }

  showChangeIconAlert() {
    // Not closed when the server confirms a selection. The picker is built when the step runs, so a
    // queued one can never surface as an empty box.
    this.addAnimationToQueue(() => {
      // Queued before a WATCH INSTEAD: a spectator has no portrait to pick.
      if (this.state.spectator) {
        this.onAnimationFinish();
        return;
      }
      this.alertShowCount += 1;
      this.pickerShownAt = this.alertShowCount;
      this.setState({ showAlert: true });
      this.updateChangeIconAlert();
    });
  }

  /**
   * Contacts the server and requests to start the game.
   */
  onClickStartGame() {
    this.sendWSCommand({ command: WSCommandType.START_GAME });
  }

  onClickLeaveLobby() {
    // A PLAY INSTEAD check answering before the socket's close must not seat the person.
    this.cancelPlayInstead();
    if (this.state.spectator) {
      Cookies.remove(COOKIE_SPECTATOR);
    }
    this.reconnectOnConnectionClosed = false;
    if (this.reconnectTimer !== undefined) {
      // Waiting to reconnect, there is no socket to close: leave now.
      this.toLoginPage("");
      return;
    }
    this.websocket?.close();
  }

  /** Tells the user whether COPY put the invite link on the clipboard. */
  onCopied(ok: boolean) {
    this.showSnackBar(ok ? "Copied!" : "Could not copy the link.");
  }

  showSnackBar(message: string) {
    this.setState({ snackbarMessage: message });
    let snackbar = document.getElementById("snackbar");
    if (snackbar === null) {
      return;
    }
    snackbar.className = "show";
    this.snackbarMessages++;
    setTimeout(() => {
      this.snackbarMessages--;
      if (this.snackbarMessages === 0) {
        snackbar!.className = snackbar!.className.replace("show", "");
      }
    }, 3000);
  }

  renderLobbyPage() {
    const account = this.state.account;
    const signedIn = account?.signedIn === true;
    return (
      <>
        <LobbyScreen
          lobby={this.state.lobby}
          inviteLink={window.location.origin + "/?lobby=" + this.state.lobby}
          usernames={this.state.usernames}
          icons={this.state.icons}
          user={this.state.name}
          spectator={this.state.spectator}
          spectatorCount={this.state.spectatorCount}
          signedIn={signedIn}
          discord={account?.discord ?? true}
          signInHref={discordSignInHref(this.state.lobby)}
          spectatorError={
            signedIn
              ? this.state.playInsteadError
              : // A failed Discord sign-in, back to watching through the spectator cookie.
                this.state.accountError === SIGN_IN_FAILED
                ? SIGN_IN_FAILED
                : ""
          }
          onStartGame={this.onClickStartGame}
          onChangeName={this.onClickChangeName}
          onChangeLook={this.onClickChangeIcon}
          onWatchInstead={this.onClickWatchInstead}
          onPlayInstead={this.onClickPlayInstead}
          onLeave={this.onClickLeaveLobby}
          onCopied={this.onCopied}
        />
        <div style={{ textAlign: "center" }}>
          <div id="snackbar">{this.state.snackbarMessage}</div>
        </div>
      </>
    );
  }

  //</editor-fold>

  /////////////////// Game Page
  //<editor-fold desc="Game Page">

  showExecutionResults(name: string, newState: GameState): void {
    if (name === newState.targetUser) {
      this.queueAlert(
        <ButtonPrompt
          label={"YOU HAVE BEEN EXECUTED"}
          headerText={
            "Executed players may not speak, vote, or run for office. You should not reveal your identity to the group."
          }
          buttonOnClick={this.hideAlertAndFinish}
        />,
        false
      );
    } else {
      this.queueAlert(
        <ButtonPrompt
          label={"EXECUTION RESULTS"}
          footerText={
            newState.targetUser +
            " has been executed. They may no longer speak, vote, or run for office."
          }
          buttonOnClick={this.hideAlertAndFinish}
          buttonText={"OKAY"}
        >
          <PlayerDisplay
            user={name}
            gameState={newState}
            showRoles={false}
            playerDisabledFilter={DISABLE_EXECUTED_PLAYERS}
            players={[newState.targetUser!]}
          />
        </ButtonPrompt>,
        false
      );
    }
  }

  /**
   * Queues animations for when the game state has changed.
   * @param newState {Object} the new game state sent from the server.
   * @param name the viewer's seat name: the packet's `you`, which this.state has only once the
   *        packet's update applies ("" for a spectator).
   */
  onGameStateChanged(newState: GameState, name: string = this.state.name) {
    let oldState = this.state.gameState;
    // A spectator acts on nothing and gets no prompt; status lines describe the table instead.
    const spectator = this.state.spectator;
    let isPresident = !spectator && name === newState.president;
    let isChancellor = !spectator && name === newState.chancellor;
    let state = newState.state;
    /** Queues the status line: a player's text, or what the table waits for, named, for a spectator. */
    const queueStatus = (playerText: string) =>
      this.queueStatusMessage(spectator ? waitingText(newState) : playerText, stepForState(newState));
    // A socket's first packet (joining, reloading or reconnecting mid-game) shows a spectator the
    // table as it is: no held lines and no vote reveal for what has already happened.
    const catchingUp = spectator && this.soundState === undefined;
    // Each sound is queued just before the animation it belongs to (SOUND_CUES).
    const soundNames = soundEvents(this.soundState, newState, name);
    this.soundState = newState;
    this.queueSounds(soundNames, "now");

    // If last state was setup, which indicates that the client is re-entering the game or starting the game, then
    // we set the card count, liberal/fascist policy count, and the tracker.
    if (
      oldState.hasOwnProperty(PARAM_STATE) &&
      oldState[PARAM_STATE] === STATE_SETUP
    ) {
      this.setState({
        liberalPolicies: newState.liberalPolicies,
        fascistPolicies: newState.fascistPolicies,
        electionTracker: newState.electionTracker,
        drawDeckSize: newState.drawSize,
        discardDeckSize: newState.discardSize,
      });
    }

    // Check for changes in enacted policies and election tracker.
    const statesToShowPolicyFor = [
      LobbyState.POST_LEGISLATIVE,
      LobbyState.PP_INVESTIGATE,
      LobbyState.PP_EXECUTION,
      LobbyState.PP_ELECTION,
      LobbyState.PP_PEEK,
      LobbyState.FASCIST_VICTORY_POLICY,
      LobbyState.LIBERAL_VICTORY_POLICY,
    ];
    if (statesToShowPolicyFor.includes(state)) {
      // Check if the election tracker changed positions.
      if (newState.electionTracker !== this.state.gameState.electionTracker) {
        let newPos = newState.electionTracker;
        let advancedToThree = newPos === 0 && newState.electionTrackerAdvanced;
        // We ignore all resets to 0, unless that reset was caused by the election tracker reaching 3.
        if (newPos !== 0 || advancedToThree) {
          // If the last phase was voting, we failed due to voting. Therefore, show votes.
          if (oldState[PARAM_STATE] === STATE_CHANCELLOR_VOTING && !catchingUp) {
            //this.queueAlert(<RoleAlert onClick={this.hideAlertAndFinish} />);
            this.addAnimationToQueue(() => this.showVotes(newState, soundNames));
          }

          let trackerPosition = newPos;
          if (advancedToThree) {
            // If the tracker was reset because it advanced to 3, show it moving to 3 in the dialog box.
            trackerPosition = 3;
          }
          this.queueSounds(soundNames, "tracker");
          if (spectator) {
            if (!catchingUp) {
              this.queueStatusMessage(
                trackerText(newState),
                stepForState(newState),
                SPECTATOR_RESULT_MS
              );
            }
          } else {
            this.queueAlert(
              <ElectionTrackerAlert
                trackerPosition={trackerPosition}
                closeAlert={this.hideAlertAndFinish}
              />
            );
          }
        }
      }

      let liberalChanged =
        newState.liberalPolicies !== oldState.liberalPolicies;
      let fascistChanged =
        newState.fascistPolicies !== oldState.fascistPolicies;

      if (liberalChanged || fascistChanged) {
        // Show an alert with the new policy
        this.queueSounds(soundNames, "policy");
        if (spectator) {
          if (!catchingUp) {
            this.queueStatusMessage(
              policyText(newState),
              stepForPolicyLine(newState),
              SPECTATOR_RESULT_MS
            );
          }
        } else {
          this.queueAlert(
            <PolicyEnactedAlert
              hideAlert={this.hideAlertAndFinish}
              policyType={newState.lastPolicy}
            />
          );
        }
      }

      // Update the decks, board with the new policies / election tracker.
      this.addAnimationToQueue(() => {
        this.setState({
          liberalPolicies: newState.liberalPolicies,
          fascistPolicies: newState.fascistPolicies,
          electionTracker: newState.electionTracker,
        });
        this.finishStepAfter(500);
      });
    }

    // Check for state change
    if (newState[PARAM_STATE] !== this.state.gameState[PARAM_STATE]) {
      // state has changed
      switch (newState[PARAM_STATE]) {
        case STATE_CHANCELLOR_NOMINATION:
          this.queueSounds(soundNames, "start");
          if (
            !spectator &&
            newState.electionTracker === 0 &&
            newState.liberalPolicies === 0 &&
            newState.fascistPolicies === 0
          ) {
            // If the game has just started (everything in default state), show the player's role.
            this.queueAlert(
              <RoleAlert
                role={newState.players[name].id}
                gameState={newState}
                name={name}
                onClick={() => {
                  this.hideAlertAndFinish();
                }}
              />,
              false
            );
          }

          this.queueEventUpdate("CHANCELLOR NOMINATION");
          queueStatus("Waiting for president to nominate a chancellor.");

          if (isPresident) {
            //Show the chancellor nomination window.
            this.queueSounds(soundNames, "prompt");
            this.queueAlert(
              SelectNominationPrompt(name, newState, this.sendWSCommand)
            );
          }

          break;

        case STATE_CHANCELLOR_VOTING:
          this.setState({ statusBarText: "" });
          this.queueSounds(soundNames, "phase");
          this.queueEventUpdate("VOTING");
          queueStatus("Waiting for all players to vote.");
          // Check if the player is dead or has already voted-- if so, do not show the voting prompt.
          if (
            !spectator &&
            newState.players[name][PLAYER_IS_ALIVE] &&
            !Object.keys(newState.userVotes).includes(name)
          ) {
            this.queueAlert(
              <VotingPrompt
                gameState={newState}
                sendWSCommand={this.sendWSCommand}
                user={name}
              />,
              true
            );
          }

          break;

        case STATE_LEGISLATIVE_PRESIDENT:
          // The vote completed, so show the votes.
          if (!catchingUp) {
            this.addAnimationToQueue(() => this.showVotes(newState, soundNames));
          }
          this.queueSounds(soundNames, "phase");
          this.queueEventUpdate("LEGISLATIVE SESSION");

          // TODO: Animate cards being pulled from the draw deck for all users.

          queueStatus("Waiting for the president to choose a policy to discard.");

          if (isPresident) {
            if (!newState.presidentChoices) {
              throw new Error("President choices not found.");
            }
            this.queueSounds(soundNames, "prompt");
            this.queueAlert(
              <PresidentLegislativePrompt
                policyOptions={newState.presidentChoices}
                sendWSCommand={this.sendWSCommand}
              />
            );
          }

          break;

        case STATE_LEGISLATIVE_CHANCELLOR:
          this.queueSounds(soundNames, "phase");
          queueStatus("Waiting for the chancellor to choose a policy to enact.");
          if (isChancellor) {
            if (!newState.chancellorChoices) {
              throw new Error("Chancellor choices not found.");
            }
            this.queueSounds(soundNames, "prompt");
            this.queueAlert(
              <ChancellorLegislativePrompt
                fascistPolicies={newState.fascistPolicies}
                showError={(message: string) =>
                  this.setState({ snackbarMessage: message })
                }
                policyOptions={newState.chancellorChoices}
                sendWSCommand={this.sendWSCommand}
                // Disable if veto has already happened
                enableVeto={
                  newState.fascistPolicies === 5 && !newState.vetoOccurred
                }
              />
            );
          }
          break;

        case STATE_LEGISLATIVE_PRESIDENT_VETO:
          this.queueSounds(soundNames, "phase");
          queueStatus(
            "Chancellor has motioned to veto the agenda. Waiting for the president to decide."
          );
          if (isPresident) {
            this.queueSounds(soundNames, "prompt");
            this.queueAlert(
              <VetoPrompt
                sendWSCommand={this.sendWSCommand}
                electionTracker={newState.electionTracker}
              />,
              true
            );
          }
          break;

        case STATE_PP_PEEK:
          this.queueSounds(soundNames, "phase");
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueSounds(soundNames, "prompt");
            if (!newState.peek) {
              throw new Error("Peek policies not found.");
            }
            this.queueAlert(
              <PeekPrompt
                policies={newState.peek}
                sendWSCommand={this.sendWSCommand}
              />,
              true
            );
          } else {
            queueStatus("Peek: President is previewing the next 3 policies.");
          }
          break;

        case STATE_PP_ELECTION:
          this.queueSounds(soundNames, "phase");
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueSounds(soundNames, "prompt");
            this.queueAlert(
              SelectSpecialElectionPrompt(name, newState, this.sendWSCommand)
            );
          } else {
            queueStatus("Special Election: President is choosing the next president.");
          }
          break;

        case STATE_PP_EXECUTION:
          this.queueSounds(soundNames, "phase");
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueSounds(soundNames, "prompt");
            this.queueAlert(
              SelectExecutionPrompt(name, newState, this.sendWSCommand),
              true
            );
          } else {
            queueStatus("Execution: President is choosing a player to execute.");
          }
          break;

        case STATE_PP_INVESTIGATE:
          this.queueSounds(soundNames, "phase");
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueSounds(soundNames, "prompt");
            this.queueAlert(
              SelectInvestigationPrompt(name, newState, this.sendWSCommand)
            );
          } else {
            queueStatus("Investigation: President is choosing a player to investigate.");
          }
          break;

        case STATE_POST_LEGISLATIVE:
          // Show results of any special elections, executions, or investigations.
          this.queueSounds(soundNames, "result");
          const result = spectator && !catchingUp ? resultText(newState) : "";
          if (result) {
            this.queueStatusMessage(result, stepForState(newState), SPECTATOR_RESULT_MS);
          }
          switch (spectator ? undefined : newState.lastState) {
            case STATE_PP_ELECTION:
              if (!isPresident) {
                console.log("Special Election Alert: " + newState.targetUser);
                this.queueAlert(
                  <ButtonPrompt
                    label={"SPECIAL ELECTION"}
                    footerText={
                      newState[PARAM_PRESIDENT] +
                      " has chosen " +
                      newState.targetUser +
                      " to be the next president." +
                      "\nThe normal presidential order will resume after the next round."
                    }
                    buttonText={"OKAY"}
                    buttonOnClick={this.hideAlertAndFinish}
                  >
                    <PlayerDisplay
                      user={name}
                      gameState={newState}
                      showLabels={false}
                      players={[newState.targetUser!]}
                    />
                  </ButtonPrompt>,
                  false
                );
              }
              break;
            case STATE_PP_EXECUTION:
              // If player was executed
              this.showExecutionResults(name, newState);
              break;
            case STATE_PP_INVESTIGATE:
              if (!isPresident) {
                let isTarget = newState.targetUser === name;
                let footerText = isTarget
                  ? `You have been investigated by ${newState[PARAM_PRESIDENT]}. The president now knows your party affiliation.`
                  : `${newState.targetUser} has been investigated by ${newState[PARAM_PRESIDENT]}. The president now knows their party affiliation.`;
                this.queueAlert(
                  <ButtonPrompt
                    label={"INVESTIGATION RESULTS"}
                    // If target: You have been investigated by [President Name].
                    //            The president now knows your party affiliation.
                    // If not target: [Target Name] has been investigated by [President Name].
                    //                The president now knows their party affiliation.
                    footerText={footerText}
                    buttonOnClick={this.hideAlertAndFinish}
                    buttonText={"OKAY"}
                  >
                    <PlayerDisplay
                      user={name}
                      gameState={newState}
                      showLabels={false}
                      players={[newState.targetUser!]}
                    />
                  </ButtonPrompt>,
                  true
                );
              } else {
                // Is President; do nothing because we handle the
                // response directly from the server.
              }
              break;
            case STATE_PP_PEEK: // No additional case is necessary for peeking.
            default:
          }

          // END TERM is the president's turn too.
          this.queueSounds(soundNames, "prompt");
          queueStatus("Waiting for the president to end their term.");
          break;

        case STATE_LIBERAL_VICTORY_EXECUTION:
        case STATE_FASCIST_VICTORY_ELECTION:
        case STATE_FASCIST_VICTORY_POLICY:
        case STATE_LIBERAL_VICTORY_POLICY:
          // Show normal enactments when victory events happen.
          if (newState.state === STATE_LIBERAL_VICTORY_EXECUTION) {
            this.queueSounds(soundNames, "result");
            if (spectator) {
              if (!catchingUp) this.queueStatusMessage(resultText(newState), stepForState(newState), SPECTATOR_RESULT_MS);
            } else {
              this.showExecutionResults(name, newState);
            }
          }
          if (newState.state === STATE_FASCIST_VICTORY_ELECTION && !catchingUp) {
            this.addAnimationToQueue(() => this.showVotes(newState, soundNames));
          }
          // Policies will already be shown for policy-based victories.
          // If the game was won via election, show the votes.

          // Divide fascist and liberal players.
          const fascistPlayers: string[] = [];
          const liberalPlayers: string[] = [];
          newState.playerOrder.forEach((player) => {
            const role = newState.players[player].id;
            if (role === Role.FASCIST || role === Role.HITLER) {
              fascistPlayers.push(player);
            } else {
              liberalPlayers.push(player);
            }
          });

          const victoryMessage = VICTORY_TEXT[newState.state];
          let messageClass: string, headerImage: string, headerAlt: string;
          let players: string[] = [];
          let state = newState.state;
          if (state === STATE_FASCIST_VICTORY_ELECTION || state === STATE_FASCIST_VICTORY_POLICY) {
            players = fascistPlayers.concat(liberalPlayers);
            headerImage = VictoryFascistHeader;
            headerAlt = "Fascist Victory, written in red with a skull icon.";
            messageClass = "highlight";
          } else {
            players = liberalPlayers.concat(fascistPlayers);
            headerImage = VictoryLiberalHeader;
            headerAlt = "Liberal Victory, written in blue with a dove icon.";
            messageClass = "highlight-blue";
          }
          if (DEBUG) {
            console.log("Player ordering: " + players);
          }
          if (spectator) {
            this.queueStatusMessage(waitingText(newState), stepForState(newState)); // the winners, under the victory screen
          }
          this.queueSounds(soundNames, "end");
          this.addAnimationToQueue(() => {
            this.alertShowCount += 1;
            this.setState({
              alertContent: (
                <ButtonPrompt
                  renderLabel={() => {
                    return (
                      <>
                        <img
                          src={headerImage}
                          alt={headerAlt}
                          id={"victory-header"}
                        />
                        <p
                          style={{ textAlign: "center" }}
                          className={messageClass}
                        >
                          {victoryMessage}
                        </p>
                      </>
                    );
                  }}
                  buttonText={"RETURN TO LOBBY"}
                  buttonOnClick={() => {
                    this.gameOver = false;
                    this.reconnectOnConnectionClosed = true;
                    this.stopReconnecting();
                    this.reconnectAttempts = 0;
                    if (
                      this.tryOpenWebSocket(
                        this.state.name,
                        this.state.lobby,
                        this.state.spectator
                      )
                    ) {
                      this.hideAlertAndFinish();
                      this.setState({ page: PAGE.LOBBY });
                    } else {
                      this.toLoginPage(CONNECT_ERROR);
                    }
                    this.setState({
                      gameState: DEFAULT_GAME_STATE,
                      liberalPolicies: 0,
                      fascistPolicies: 0,
                      electionTracker: 0,
                      drawDeckSize: 17,
                      discardDeckSize: 0,
                      statusBarText: "---",
                      statusStep: null,
                    });
                  }}
                >
                  <PlayerDisplay
                    players={players}
                    playerDisabledFilter={DISABLE_NONE}
                    showRoles={true}
                    showLabels={false}
                    useAsButtons={false}
                    user={name}
                    gameState={newState}
                  />
                </ButtonPrompt>
              ),
              showAlert: true,
            });
          });
          this.gameOver = true;
          this.reconnectOnConnectionClosed = false;
          this.websocket?.close();
          break;

        default:
        // Do nothing
      }
    }

    // Update the draw decks
    this.addAnimationToQueue(() => {
      this.setState({
        drawDeckSize: newState.drawSize,
        discardDeckSize: newState.discardSize,
      });
      this.onAnimationFinish();
    });
  }

  //// Animation Handling
  // <editor-fold desc="Animation Handling">

  /**
   * Plays the next animation in the queue if it exists.
   * @effects If {@code this.animationQueue} is not empty,
   *          removes the function at the front of the animation queue and calls it.
   */
  onAnimationFinish() {
    if (this.animationQueue.length > 0) {
      let func = this.animationQueue.shift();
      if (func !== undefined) {
        this.startAnimationStep(func);
      }
    } else {
      // the animation queue is empty, so we set a flag.
      this.allAnimationsFinished = true;
      this.setState({ allAnimationsFinished: true });
    }
  }

  /**
   * Clears the animation queue and ends any currently playing animations.
   */
  clearAnimationQueue() {
    this.allAnimationsFinished = true;
    this.setState({ allAnimationsFinished: true });
    this.animationQueue = [];
    this.animationStep += 1; // the running step is over
    this.okMessageListeners = []; // and so is any prompt waiting for the server's OK
    // A name prompt that was still queued went with it, and so did a PLAY INSTEAD waiting for it.
    if (!this.namePromptShown) {
      this.namePromptOpen = false;
      this.namePromptStep = undefined;
      if (this.playInsteadAwaitsName) this.cancelPlayInstead();
    }
    // Sounds still in the queue go with it; so does a vote tally that has not sounded yet.
    this.soundTimers.forEach(clearTimeout);
    this.soundTimers = [];
  }

  playSounds(names: SoundName[]) {
    names.forEach((name) => sounds.play(name));
  }

  /**
   * Plays the sounds whose cue is `cue` (SOUND_CUES): at once for "now", otherwise as an instant
   * step in the animation queue, so they start with the animation queued right after them.
   */
  queueSounds(names: SoundName[], cue: Cue) {
    const due = names.filter((name) => SOUND_CUES[name] === cue);
    if (due.length === 0) return;
    if (cue === "now") {
      this.playSounds(due);
      return;
    }
    this.addAnimationToQueue(() => {
      this.playSounds(due);
      this.onAnimationFinish();
    });
  }

  /**
   * Adds the specified animation to the end of the queue.
   * @param func {function} the function to add to the animation queue.
   * @effects Adds the function to the back of the animation queue. If no animations are currently playing,
   *          starts the specified animation.
   */
  addAnimationToQueue(func: () => void) {
    this.animationQueue.push(func);
    if (this.allAnimationsFinished) {
      this.allAnimationsFinished = false;
      this.setState({ allAnimationsFinished: false });
      let func = this.animationQueue.shift();
      if (func !== undefined) {
        this.startAnimationStep(func);
      }
    }
  }

  /** Runs a step from the queue as the current one (animationStep). */
  startAnimationStep(func: () => void) {
    this.animationStep += 1;
    func();
  }

  /**
   * Finishes the running step after `ms`, unless it is over by then (the queue was cleared, so
   * a later step may be running): a step's timer must not cut short a step it does not own.
   */
  finishStepAfter(ms: number) {
    const step = this.animationStep;
    setTimeout(() => {
      if (this.animationStep === step) {
        this.onAnimationFinish();
      }
    }, ms);
  }

  /** @param names the state change's sounds; the vote result plays with the tally line. */
  showVotes(newState: GameState, names: SoundName[] = []) {
    this.setState({ statusBarText: "Tallying votes...", statusStep: RoundStep.ELECTION });
    setTimeout(() => {
      this.setState({ showVotes: true });
    }, 1000);
    // Calculate final result:

    let noVotes = 0;
    let yesVotes = 0;
    Object.values(newState.userVotes).forEach((value) => {
      if (value) {
        yesVotes++;
      } else {
        noVotes++;
      }
    });
    setTimeout(() => {
      if (yesVotes > noVotes) {
        this.setState({
          statusBarText: yesVotes + " - " + noVotes + ": Vote passed",
          statusStep: RoundStep.ELECTION,
        });
      } else {
        this.setState({
          statusBarText: yesVotes + " - " + noVotes + ": Vote failed",
          statusStep: RoundStep.ELECTION,
        });
      }
    }, 2000);
    // The result sounds with the tally line above.
    const tally = setTimeout(() => {
      this.soundTimers = this.soundTimers.filter((timer) => timer !== tally);
      this.playSounds(names.filter((name) => SOUND_CUES[name] === "votes"));
    }, 2000);
    this.soundTimers.push(tally);
    setTimeout(
      () => this.setState({ showVotes: false, statusBarText: "" }),
      6000
    );
    this.finishStepAfter(6500);
  }

  /**
   * Adds a listener to be called when the server returns an 'OK' status.
   * @param func The function to be called.
   * @effects adds the listener, tied to the current animation step. On the server's next 'OK',
   *          the first listener whose step is still the current one is called and every listener
   *          is cleared: one from an earlier step (a later step has started since, or the queue
   *          was cleared) never runs.
   */
  addServerOKListener(func: () => void) {
    this.okMessageListeners.push({ step: this.animationStep, func });
  }

  /**
   * Hides the CustomAlert and marks this animation as finished.
   * @param delayExit {boolean} When true, delays advancing the animation queue until after the alert is hidden.
   * @effects: Sets {@code this.state.showAlert} to false and hides the CustomAlert.
   *           If delayExit is true, waits until the CustomAlert is done hiding before advancing the animation queue.
   *           Otherwise, immediately queues the next animation.
   */
  hideAlertAndFinish(delayExit = true) {
    this.setState({ showAlert: false });
    if (delayExit) {
      const shownAt = this.alertShowCount;
      const step = this.animationStep;
      setTimeout(() => {
        // Another alert was shown during the fade (the queue had been cleared): it owns the box.
        if (this.alertShowCount === shownAt) {
          this.setState({ alertContent: <div /> }); // reset the alert box contents
        }
        // Finish only this alert's own step: one that started after a cleared queue runs its course.
        if (this.animationStep === step) {
          this.onAnimationFinish();
        }
      }, ALERT_FADE_OUT_MS);
    } else {
      this.setState({ alertContent: <div /> });
      this.onAnimationFinish();
    }
  }

  /**
   * Shows the eventBar for a set period of time.
   * @param message {String} the message for the Event Bar to be fully visible.
   * @param duration {Number} the duration (in ms) for the Event Bar to be visible. (default is 3000 ms).
   * @effects Adds a function to the animation queue that, when called, shows the EventBar with the given message
   *          for {@code duration} ms, then advances to the next animation when finished.
   */
  queueEventUpdate(message: string, duration = 2000) {
    this.addAnimationToQueue(() => {
      this.setState({
        showEventBar: true,
        eventBarMessage: message,
      });
      setTimeout(() => {
        this.setState({ showEventBar: false });
      }, duration);
      this.finishStepAfter(duration + EVENT_BAR_FADE_OUT_DURATION);
    });
  }

  /**
   * Adds a CustomAlert to the animation queue.
   * @param content {html} the contents to be shown in the AlertBox.
   * @param closeOnOK {boolean} whether to close the alert when the server responds with an ok message. (default = true)
   * @effects Adds a new function to the animation queue that, when called, causes a CustomAlert with the
   *          given {@code content} to appear. If {@code closeOnOK} is true, once shown, the alert box will
   *          be closed when the server responds with an 'ok' to any command. (There will be a short delay before the
   *          animation queue advances if not waiting for a server response.)
   */
  queueAlert(content: React.JSX.Element, closeOnOK = true) {
    this.addAnimationToQueue(() => {
      this.alertShowCount += 1;
      this.setState({
        alertContent: content,
        showAlert: true,
      });
      if (closeOnOK) {
        // Remove the exit delay if waiting for the server response, because otherwise the player will lag
        // behind everyone else.
        this.addServerOKListener(() => this.hideAlertAndFinish(false));
      }
    });
  }

  /**
   * Adds an update to the status message to the animation queue.
   * @param message {String} the text for the status bar to display.
   * @param step the round step to light with the message, or null to leave the lit step alone.
   * @param holdMs how long the message shows before the queue moves on (default 0).
   * @effects Adds a new function to the animation queue that, when called, updates {@code this.state.statusBarText} to
   *          the message provided then advances the animation queue, at once or after {@code holdMs}.
   */
  queueStatusMessage(message: string, step: RoundStep | null, holdMs = 0) {
    this.addAnimationToQueue(() => {
      if (step === null) this.setState({ statusBarText: message });
      else this.setState({ statusBarText: message, statusStep: step });
      if (holdMs > 0) {
        this.finishStepAfter(holdMs);
      } else {
        this.onAnimationFinish();
      }
    });
  }

  // </editor-fold>

  /**
   * Renders the game page.
   */
  renderGamePage() {
    return (
      <>
        <EventBar
          show={this.state.showEventBar}
          message={this.state.eventBarMessage}
        />

        <GameScreen
          gameState={this.state.gameState}
          user={this.state.name}
          showVotes={this.state.showVotes}
          showBusy={this.state.allAnimationsFinished} // Only show busy when there isn't an active animation.
          statusBarText={this.state.statusBarText}
          statusStep={this.state.statusStep}
          drawDeckSize={this.state.drawDeckSize}
          discardDeckSize={this.state.discardDeckSize}
          liberalPolicies={this.state.liberalPolicies}
          fascistPolicies={this.state.fascistPolicies}
          electionTracker={this.state.electionTracker}
          spectator={this.state.spectator}
          spectatorCount={this.state.spectatorCount}
          onEndTerm={() => {
            this.sendWSCommand({ command: WSCommandType.END_TERM });
          }}
          onPauseTerm={() => this.sendWSCommand({ command: WSCommandType.PAUSE_TERM_TIMER })}
          onResumeTerm={() => this.sendWSCommand({ command: WSCommandType.RESUME_TERM_TIMER })}
        />

        <div>
          <div id="snackbar">{this.state.snackbarMessage}</div>
        </div>
      </>
    );
  }

  //</editor-fold>

  /**
   * The page, under the one prompt overlay every page shares: it stays in the same place in the
   * tree, so a prompt open when the page changes (CHOOSE A NAME from the login page to the lobby,
   * say) stays as it is. Leaving for the login page gives it a new key (toLoginPage), so a prompt
   * closed there goes at once, with no fade-out.
   */
  render() {
    let page_render;
    switch (this.state.page) {
      case PAGE.LOBBY:
        page_render = this.renderLobbyPage();
        break;
      case PAGE.GAME:
        page_render = this.renderGamePage();
        break;
      case PAGE.LOGIN: // login is default
      default:
        page_render = this.renderLoginPage();
    }
    return (
      <div className="App">
        <CustomAlert key={this.state.alertKey} show={this.state.showAlert}>
          {this.state.alertContent}
        </CustomAlert>
        {page_render}
      </div>
    );
  }
}

export default App;
