import React, { Component } from "react";
import "./App.css";
import "./fonts.css";
import MaxLengthTextField from "./util/MaxLengthTextField";
import CustomAlert, { ALERT_FADE_OUT_MS } from "./custom-alert/CustomAlert";
import RoleAlert from "./custom-alert/RoleAlert";
import EventBar from "./event-bar/EventBar";
import GameScreen from "./game/GameScreen";
import { RoundStep, stepForPolicyLine, stepForState } from "./game/roundStep";

// TODO: replace constants with enums from types
import {
  PAGE,
  MAX_FAILED_CONNECTIONS,
  SERVER_ADDRESS_HTTP,
  NEW_LOBBY,
  CHECK_LOGIN,
  SERVER_ADDRESS,
  WEBSOCKET,
  PARAM_USERNAMES,
  LOBBY_CODE_LENGTH,
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
  MAX_NAME_LENGTH,
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
import LoginPageContent from "./LoginPageContent";
import Cookies from "js-cookie";
import AnnouncementBox from "./util/AnnouncementBox";
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
import { normalizeName } from "./lobby/normalizeName";
import PlayInsteadPrompt from "./custom-alert/PlayInsteadPrompt";
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

const COOKIE_NAME = "name";
const COOKIE_LOBBY = "lobby";
/** "true" while this browser watches COOKIE_LOBBY as a spectator, so a refresh goes back to it. */
const COOKIE_SPECTATOR = "spectator";
/** Under JOIN when the connection to the lobby is lost for good. */
const DISCONNECTED_ERROR = "Disconnected from the lobby.";
/** The snackbar when the server refuses a PLAY INSTEAD seat after its check passed. */
const SEAT_REFUSED = "Could not take a seat. You are still watching.";
/** How long a spectator's status line shows what happened, in place of a player's alert. */
const SPECTATOR_RESULT_MS = 3000;

if (DEBUG) {
  console.warn("Running in debug mode.");
}

// TODO: Turn App into a functional component
// TODO: Refactor out pages into separate components
// TODO: Refactor out AnimationQueue

// TODO: Remove this type and replace with actual state variables.
type AppState = {
  page: PAGE;
  joinName: string;
  joinLobby: string;
  joinError: string;
  createLobbyName: string;
  createLobbyError: string;
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
  showEventBar: boolean;
  eventBarMessage: string;
  statusBarText: string;
  /** The round step lit beside the status line; null until a line lights one. */
  statusStep: RoundStep | null;
  allAnimationsFinished: boolean;
};

const defaultAppState: AppState = {
  page: PAGE.LOGIN,
  joinName: "",
  joinLobby: "",
  joinError: "",
  createLobbyName: "",
  createLobbyError: "",
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
  showEventBar: false,
  eventBarMessage: "",
  statusBarText: "---",
  statusStep: null,
  allAnimationsFinished: true,
};

class App extends Component<{}, AppState> {
  websocket?: WebSocket = undefined;
  failedConnections: number = 0;
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
  /** True from PLAY INSTEAD being pressed until its prompt closes; a game starting closes it. */
  playInsteadOpen = false;
  /** True while the PLAY INSTEAD prompt is on screen (not just queued). */
  playInsteadShown = false;
  /** The queued step that shows the prompt, so a prompt closed before it shows can be dropped. */
  playInsteadStep?: () => void = undefined;
  /** Counts the PLAY INSTEAD openings, so a check that began under an earlier prompt does nothing. */
  playInsteadSession = 0;
  /**
   * True from PLAY INSTEAD opening a player's socket until that socket's first message. A close
   * before then is the server refusing the seat (the game started, the last seat went, the name
   * was taken), so the person goes back to watching.
   */
  seatPending = false;
  /** Counts the alerts shown, so a late fade timer does not blank a newer alert. */
  alertShowCount = 0;
  /** The alertShowCount at which the portrait picker was shown: it is on screen while this matches. */
  pickerShownAt = -1;

  // noinspection DuplicatedCode
  constructor(props: any) {
    super(props);

    let name = Cookies.get(COOKIE_NAME) ? Cookies.get(COOKIE_NAME) : "";
    let lobby = Cookies.get(COOKIE_LOBBY) ? Cookies.get(COOKIE_LOBBY) : "";
    // A lobby link (?lobby=CODE) fills the Lobby field in place of the saved lobby.
    const linked = new URLSearchParams(window.location.search).get("lobby");

    this.state = {
      ...defaultAppState,
      joinName: name || "",
      joinLobby: linked !== null ? linked.toUpperCase().substring(0, 4) : lobby || "",
      createLobbyName: name || "",
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
    this.playInstead = this.playInstead.bind(this);
    this.closePlayInstead = this.closePlayInstead.bind(this);
    this.closeSocket = this.closeSocket.bind(this);
    this.dropPlayInstead = this.dropPlayInstead.bind(this);
    this.openSeat = this.openSeat.bind(this);
    this.openWatch = this.openWatch.bind(this);
    this.addAnimationToQueue = this.addAnimationToQueue.bind(this);
    this.clearAnimationQueue = this.clearAnimationQueue.bind(this);
    this.queueAlert = this.queueAlert.bind(this);
    this.showChangeIconAlert = this.showChangeIconAlert.bind(this);
    this.updateChangeIconAlert = this.updateChangeIconAlert.bind(this);
    this.onClickChangeIcon = this.onClickChangeIcon.bind(this);

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
   * Checks if the login is valid.
   * @param name the name of the user.
   * @param lobby the lobby code.
   * @return {Promise<Response>} The response from the server.
   */
  async tryLogin(name: string, lobby: string) {
    return await fetch(
      SERVER_ADDRESS_HTTP +
        CHECK_LOGIN +
        "?name=" +
        encodeURIComponent(name) +
        "&lobby=" +
        encodeURIComponent(lobby)
    );
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

  /** A spectator who reloads goes straight back to watching their lobby (COOKIE_SPECTATOR). */
  componentDidMount() {
    const lobby = Cookies.get(COOKIE_LOBBY);
    const linked = new URLSearchParams(window.location.search).get("lobby");
    const otherLobby = linked !== null && linked.toUpperCase().substring(0, 4) !== lobby;
    if (Cookies.get(COOKIE_SPECTATOR) === "true" && lobby && !otherLobby) {
      this.watch(lobby);
    }
  }

  /**
   * Attempts to open a WebSocket with the server.
   * @param name the name of the user to connect with ("" for a spectator).
   * @param lobby the lobby to connect with.
   * @param spectator whether to watch without a seat (no name is sent).
   * @effects If a connection was successfully established, sets the state with the {@code name}, {@code lobby},
   *          and {@code ws} parameters. The WebSocket has a message callback to this.onWebSocketMessage().
   * @return {boolean} true if the connection was opened successfully. Otherwise, returns false.
   */
  tryOpenWebSocket(name: string, lobby: string, spectator = false) {
    if (DEBUG) {
      console.log("Opening connection with lobby: " + lobby);
      console.log("Failed connections: " + this.failedConnections);
    }
    let url =
      WEBSOCKET_HEADER +
      SERVER_ADDRESS +
      WEBSOCKET +
      (spectator ? "?" + PARAM_SPECTATOR + "=true" : "?name=" + encodeURIComponent(name)) +
      "&lobby=" +
      encodeURIComponent(lobby);
    if (DEBUG) {
      console.trace("TryOpenWebsocket URL: " + url);
    }

    // Build the new socket first: if that throws, the old one is left as it was.
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return false;
    }

    this.closeSocket();

    console.log("Websocket created for " + url);
    this.websocket = ws;
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
      joinName: "",
      joinLobby: "",
      joinError: "",
      createLobbyName: "",
      createLobbyError: "",
    });
    ws.onmessage = (msg) => this.onWebSocketMessage(msg);
    ws.onclose = () => this.onWebSocketClose();

    // Ping the web server at a set interval.
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.pingInterval = setInterval(() => {
      this.sendWSCommand({ command: WSCommandType.PING });
    }, PING_INTERVAL);

    return true;
  }

  /** Closes the current socket without the reconnect or leave path of onWebSocketClose. */
  closeSocket() {
    if (this.websocket) {
      // Clear onClose event to prevent reconnection
      this.websocket.onclose = () => {};
      this.websocket.close();
      this.websocket = undefined;
    }
  }

  /**
   * Opens a player's socket and remembers the login (name for 7 days, lobby), as every join does.
   * @return {boolean} whether the socket opened.
   */
  openSeat(name: string, lobby: string): boolean {
    this.failedConnections = 0; // a user action starts a fresh connection
    if (!this.tryOpenWebSocket(name, lobby)) return false;
    Cookies.set(COOKIE_NAME, name, { expires: 7 });
    Cookies.set(COOKIE_LOBBY, lobby);
    Cookies.remove(COOKIE_SPECTATOR);
    return true;
  }

  /**
   * Opens a spectator's socket and remembers it (COOKIE_SPECTATOR); the name cookie stays.
   * @return {boolean} whether the socket opened.
   */
  openWatch(lobby: string): boolean {
    this.failedConnections = 0; // a user action starts a fresh connection
    if (!this.tryOpenWebSocket("", lobby, true)) return false;
    Cookies.set(COOKIE_LOBBY, lobby);
    Cookies.set(COOKIE_SPECTATOR, "true");
    return true;
  }

  /**
   * Called when the websocket closes.
   * @effects attempts to reopen the websocket connection.
   *          If the user pressed the "Leave Lobby" button or a maximum number of attempts has been reached
   *          ({@code MAX_FAILED_CONNECTIONS}), does not reopen the websocket connection and returns the user to the
   *          login screen with a relevant error message.
   */
  onWebSocketClose() {
    // Clear the server ping interval when the socket is closed.
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    console.log(
      "A websocket closed: " +
        this.websocket?.url +
        ". Reopening to current lobby " +
        this.state.lobby
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

    if (
      this.reconnectOnConnectionClosed &&
      this.failedConnections < MAX_FAILED_CONNECTIONS
    ) {
      if (this.failedConnections >= 1) {
        // Only show the error bar if the first attempt has failed.
        this.showSnackBar("Lost connection to the server: retrying...");
      }
      this.failedConnections += 1;
      // A socket that cannot even be built is a lost connection for good.
      if (!this.tryOpenWebSocket(this.state.name, this.state.lobby, this.state.spectator)) {
        this.toLoginPage(DISCONNECTED_ERROR);
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

  /**
   * Leaves for the login page with the lobby code and the name to rejoin under filled in: stops the
   * ping, closes the alert and any PLAY INSTEAD prompt, and empties the animation queue.
   * @param error the message under JOIN ("" for none).
   */
  toLoginPage(error: string) {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.setState({
      page: PAGE.LOGIN,
      joinName: this.rejoinName(),
      joinLobby: this.state.lobby,
      joinError: error,
      showAlert: false,
      alertContent: <div />,
    });
    this.dropPlayInstead();
    this.clearAnimationQueue();
  }

  /** The JOIN form's name after leaving: the player's, or for a spectator (who has none) the saved one. */
  rejoinName(): string {
    return this.state.name || (Cookies.get(COOKIE_NAME) ?? "");
  }

  async onWebSocketMessage(msg: MessageEvent) {
    this.failedConnections = 0;
    this.seatPending = false; // the server took the seat
    let message = JSON.parse(msg.data);
    // Decode message contents as communication is encoded
    if (DEBUG) {
      console.log(message);
    }
    switch (message[PARAM_PACKET_TYPE]) {
      case PACKET_LOBBY:
        this.queueSounds(lobbySounds(this.lobbyUsers, message[PARAM_USERNAMES]), "now");
        this.lobbyUsers = message[PARAM_USERNAMES];
        this.soundState = DEFAULT_GAME_STATE;
        // The icon dialog is rebuilt from this.state, so wait for the update to apply.
        this.setState(
          {
            usernames: message[PARAM_USERNAMES],
            icons: message[PARAM_ICON],
            spectatorCount: message[PARAM_SPECTATOR_COUNT] ?? 0,
            page: PAGE.LOBBY,
          },
          () => {
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

      case PACKET_GAME_STATE:
        // A game starting under an open PLAY INSTEAD prompt: close it and keep watching.
        this.closePlayInstead();
        if (message !== this.state.gameState) {
          this.onGameStateChanged(message);
        }
        this.setState({
          gameState: message,
          spectatorCount: message[PARAM_SPECTATOR_COUNT] ?? 0,
          page: PAGE.GAME,
        });
        break;

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

    if (DEBUG) {
      console.log(JSON.stringify(data));
    }
    const ws = this.websocket;
    if (ws !== undefined) {
      const payload = JSON.stringify(data);
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

  /**
   * Updates the "Name" field under Join Game.
   * @param text the text to update the text field to.
   */
  updateJoinName = (text: string) => {
    this.setState({
      joinName: text,
    });
  };

  /**
   * Updates the Lobby field under Join Game.
   * @param text the text to update the text field to.
   */
  updateJoinLobby = (text: string) => {
    this.setState({
      joinLobby: text,
    });
  };

  /**
   * Updates the Name field under Create Lobby.
   * @param text the text to update the text field to.
   */
  updateCreateLobbyName = (text: string) => {
    this.setState({
      createLobbyName: text,
    });
  };

  shouldJoinButtonBeEnabled() {
    return (
      this.state.joinLobby.length === LOBBY_CODE_LENGTH &&
      normalizeName(this.state.joinName) !== ""
    );
  }

  shouldCreateLobbyButtonBeEnabled() {
    return normalizeName(this.state.createLobbyName) !== "";
  }

  /**
   * Attempts to connect to the lobby via websocket.
   */
  onClickJoin = () => {
    // Capture the form values: tryOpenWebSocket clears them via setState.
    const name = normalizeName(this.state.joinName);
    const lobby = this.state.joinLobby;
    this.setState({ joinError: "Connecting..." });
    this.tryLogin(name, lobby)
      .then((response) => {
        if (!response.ok) {
          if (DEBUG) {
            console.log("Response is not ok");
          }
          this.setState({ joinError: joinErrorMessage(response.status, name) });
        } else {
          // Username and lobby were verified. Try to open websocket.
          if (!this.openSeat(name, lobby)) {
            this.setState({ joinError: CONNECT_ERROR });
          }
        }
      })
      .catch(() => {
        this.setState({ joinError: CONTACT_ERROR });
      });
  };

  /** Watches the lobby in the Lobby field as a spectator: no name needed. */
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
   * onclose is replaced in tryOpenWebSocket, so the login page is not shown. The name cookie stays.
   * If the spectator socket cannot be built, the person lands on the login page with the lobby code.
   */
  onClickWatchInstead() {
    if (this.openWatch(this.state.lobby)) return;
    this.closeSocket();
    this.toLoginPage(CONNECT_ERROR);
  }

  /** PLAY INSTEAD (a spectator in the lobby): opens the prompt for the name to play under. */
  onClickPlayInstead() {
    if (this.playInsteadOpen) return;
    this.playInsteadOpen = true;
    this.playInsteadSession += 1;
    const show = () => {
      this.playInsteadStep = undefined;
      this.playInsteadShown = true;
      this.alertShowCount += 1;
      this.setState({
        showAlert: true,
        alertContent: (
          <PlayInsteadPrompt
            key={this.alertShowCount}
            initialName={Cookies.get(COOKIE_NAME) ?? ""}
            onContinue={this.playInstead}
            onCancel={() => this.closePlayInstead()}
          />
        ),
      });
    };
    this.playInsteadStep = show;
    this.addAnimationToQueue(show);
  }

  /**
   * Closes the PLAY INSTEAD prompt, if it is open.
   * @param delayExit whether the animation queue waits for the prompt's fade-out.
   */
  closePlayInstead(delayExit = true) {
    if (!this.playInsteadOpen) return;
    const shown = this.playInsteadShown;
    this.dropPlayInstead();
    if (shown) this.hideAlertAndFinish(delayExit);
  }

  /** Forgets the prompt without touching the alert box: a queued prompt is removed from the queue. */
  dropPlayInstead() {
    this.playInsteadOpen = false;
    this.playInsteadShown = false;
    const step = this.playInsteadStep;
    this.playInsteadStep = undefined;
    if (step) this.animationQueue = this.animationQueue.filter((queued) => queued !== step);
  }

  /**
   * Checks the name, then reopens the connection as a player.
   * @return {Promise<string>} "" on success, otherwise the error for the prompt. Whoever fails stays watching.
   */
  async playInstead(name: string): Promise<string> {
    const lobby = this.state.lobby;
    const session = this.playInsteadSession;
    let response: Response | undefined;
    try {
      response = await this.tryLogin(name, lobby);
    } catch {
      // handled below
    }
    // The prompt closed meanwhile (CANCEL, or a game started): keep watching, show nothing.
    if (!this.playInsteadOpen || session !== this.playInsteadSession) return "";
    if (response === undefined) return CONTACT_ERROR;
    if (!response.ok) return joinErrorMessage(response.status, name);
    if (!this.openSeat(name, lobby)) return CONNECT_ERROR;
    this.seatPending = true;
    // Free the alert slot at once: the new socket's lobby packet may queue the portrait picker.
    this.closePlayInstead(false);
    return "";
  }

  /**
   * Attempts to connect to the server and create a new lobby, and then opens a connection to the lobby.
   */
  onClickCreateLobby = () => {
    // Capture the form value: tryOpenWebSocket clears it via setState.
    const name = normalizeName(this.state.createLobbyName);
    this.setState({ createLobbyError: "Connecting..." });
    this.tryCreateLobby()
      .then((response) => {
        if (response.ok) {
          response.text().then((lobbyCode) => {
            if (!this.openSeat(name, lobbyCode)) {
              // if the connection failed
              this.setState({ createLobbyError: CONNECT_ERROR });
            }
          });
        } else {
          this.setState({ createLobbyError: CONNECT_ERROR });
        }
      })
      .catch(() => {
        this.setState({ createLobbyError: CONNECT_ERROR });
      });
  };

  renderLoginPage() {
    return (
      <div className="App">
        <header className="App-header">
          SECRET-HITLER
          <SoundControl />
        </header>
        <br />
        <div style={{ textAlign: "center" }}>
          {/** TODO: Add reusable announcement component. 
                    <div style={{backgroundColor: "#222222", width: "50vmin", margin: "0 auto", padding: "20px"}}>
                        <p>
                            Hello! Secret Hitler Online is currently undergoing some maintenance.
                            Sorry for the interruption and please check back in in a few hours! -Shrimp
                        </p>
                        <p style={{fontStyle: "italic", fontSize: "calc(8px + 1vmin)"}}>(DATE TIME PM PT)</p>

                    </div>
                    */}
          <h2>JOIN A GAME</h2>
          <MaxLengthTextField
            label={"Lobby"}
            onChange={this.updateJoinLobby}
            value={this.state.joinLobby}
            maxLength={LOBBY_CODE_LENGTH}
            showCharCount={false}
            forceUpperCase={true}
          />

          <MaxLengthTextField
            label={"Your Name"}
            onChange={this.updateJoinName}
            value={this.state.joinName}
            maxLength={MAX_NAME_LENGTH}
          />
          <p id={"errormessage"}>{this.state.joinError}</p>
          <button
            onClick={this.onClickJoin}
            disabled={!this.shouldJoinButtonBeEnabled()}
          >
            JOIN
          </button>
          <button
            onClick={this.onClickWatch}
            disabled={this.state.joinLobby.length !== LOBBY_CODE_LENGTH}
          >
            WATCH
          </button>
        </div>
        <br />
        <div>
          <h2>CREATE A LOBBY</h2>
          <MaxLengthTextField
            label={"Your Name"}
            onChange={this.updateCreateLobbyName}
            value={this.state.createLobbyName}
            maxLength={MAX_NAME_LENGTH}
          />
          <p id={"errormessage"}>{this.state.createLobbyError}</p>
          <button
            onClick={this.onClickCreateLobby}
            disabled={!this.shouldCreateLobbyButtonBeEnabled()}
          >
            CREATE LOBBY
          </button>
        </div>
        <AnnouncementBox>
          <h2>Announcing: BOTS!</h2>
          <p>
            You can now start games with only 1-4 players; extra spots will be
            filled by bots.
          </p>
          <p>
            Bots are still in beta, so{" "}
            <a
              href={
                "https://github.com/ShrimpCryptid/Secret-Hitler-Online/issues/44"
              }
              target={"_blank"}
              rel="noreferrer"
            >
              leave feedback on GitHub!
            </a>
          </p>
          <p style={{ fontStyle: "italic", fontSize: "calc(8px + 1vmin)" }}>
            (Please be nice, they are trying their best.)
          </p>
        </AnnouncementBox>
        <br />
        <LoginPageContent />
      </div>
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
    if (this.state.spectator) {
      Cookies.remove(COOKIE_SPECTATOR);
    }
    this.websocket?.close();
    this.reconnectOnConnectionClosed = false;
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
    return (
      <div className="App">
        <CustomAlert show={this.state.showAlert}>
          {this.state.alertContent}
        </CustomAlert>

        <LobbyScreen
          lobby={this.state.lobby}
          inviteLink={window.location.origin + "/?lobby=" + this.state.lobby}
          usernames={this.state.usernames}
          icons={this.state.icons}
          user={this.state.name}
          spectator={this.state.spectator}
          spectatorCount={this.state.spectatorCount}
          onStartGame={this.onClickStartGame}
          onChangeLook={this.onClickChangeIcon}
          onWatchInstead={this.onClickWatchInstead}
          onPlayInstead={this.onClickPlayInstead}
          onLeave={this.onClickLeaveLobby}
          onCopied={this.onCopied}
        />
        <div style={{ textAlign: "center" }}>
          <div id="snackbar">{this.state.snackbarMessage}</div>
        </div>
      </div>
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
   */
  onGameStateChanged(newState: GameState) {
    let oldState = this.state.gameState;
    let name = this.state.name;
    // A spectator acts on nothing and gets no prompt; status lines describe the table instead.
    const spectator = this.state.spectator;
    let isPresident = !spectator && this.state.name === newState.president;
    let isChancellor = !spectator && this.state.name === newState.chancellor;
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
                role={newState.players[this.state.name].id}
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
                user={this.state.name}
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
                    this.failedConnections = 0;
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
                    user={this.state.name}
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
    // A PLAY INSTEAD prompt that was still queued went with it.
    if (!this.playInsteadShown) {
      this.playInsteadOpen = false;
      this.playInsteadStep = undefined;
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
      <div className="App">
        <CustomAlert show={this.state.showAlert}>
          {this.state.alertContent}
        </CustomAlert>

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
      </div>
    );
  }

  //</editor-fold>

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
      <>
        {page_render}
      </>
    );
  }
}

export default App;
