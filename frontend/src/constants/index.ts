import { serverUrls } from "./serverUrls";

export const LIBERAL = "LIBERAL";
export const FASCIST = "FASCIST";
export const HITLER = "HITLER";

export enum PAGE {
  LOGIN = "login",
  LOBBY = "lobby",
  GAME = "game",
}

export const DEBUG = import.meta.env.VITE_DEBUG !== undefined;
const urls = serverUrls(window.location, import.meta.env);
export const SERVER_ADDRESS = urls.address;
export const SERVER_ADDRESS_HTTP = urls.http;
export const WEBSOCKET_HEADER = urls.websocketHeader;

export const CHECK_LOGIN = "/check-login";
/** "true" in the /game and /check-login query makes a spectator, who needs no name. */
export const PARAM_SPECTATOR = "spectator";
export const PARAM_SPECTATOR_COUNT = "spectatorCount";
/**
 * In a player's /game query: a random key this page keeps for its lifetime. A reconnect that brings
 * it takes the player's name back from the page's old socket, which the server may still think is
 * live after the network dropped (it notices only at its 30 s idle timeout).
 */
export const PARAM_REJOIN_KEY = "rejoinKey";
export const NEW_LOBBY = "/new-lobby";
export const WEBSOCKET = "/game";
export const SERVER_PING = "/ping";
/**
 * The wait before each reconnect after a socket closes, in ms: the first at once, then longer, so a
 * few seconds without a network (a phone changing networks) or a server restart is ridden out.
 * After the last one fails, the page gives up and goes to the login page. The waits add up to 30 s,
 * and each attempt has REPLY_TIMEOUT to be answered.
 */
export const RECONNECT_DELAYS = [0, 1000, 2000, 4000, 8000, 15000];
/**
 * How long the server has to answer a new socket (it sends the state at once) or a ping (a pong),
 * in ms. A socket with no answer by then is dead, although the browser may not say so for minutes
 * (a network that died without a word, a phone waking with its screen off), so it is reconnected.
 */
export const REPLY_TIMEOUT = 10000;
export const LOBBY_CODE_LENGTH = 4;
export const SERVER_TIMEOUT = 4000;
/** The server closes a /game socket after 30 s with no traffic either way, so ping within that. */
export const PING_INTERVAL = 20000;

//////// Game Constants
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
/** The longest name a player can join under. */
export const MAX_NAME_LENGTH = 12;

//////// JSON Packet Data

// Packet Headers
export const PARAM_PACKET_TYPE = "type";
export const PACKET_INVESTIGATION = "investigation";
export const PACKET_PEEK = "peek";
export const PACKET_GAME_STATE = "game";
export const PACKET_LOBBY = "lobby";
export const PACKET_OK = "ok";
export const PACKET_PONG = "pong";

// Commands
//<editor-fold desc="Commands">
export const PARAM_COMMAND = "command";
export const PARAM_NAME = "name";
export const PARAM_LOBBY = "lobby";
export const PARAM_ICON = "icon"; // id of the selected portrait.
export const PARAM_VOTE = "vote";
export const PARAM_VETO = "veto"; // the veto decision (yes/no)
export const PARAM_CHOICE = "choice"; // the index of the chosen policy.

export const COMMAND_PING = "ping";
export const COMMAND_SELECT_ICON = "select-icon";
export const COMMAND_START_GAME = "start-game";
export const COMMAND_GET_STATE = "get-state";
export const COMMAND_NOMINATE_CHANCELLOR = "nominate-chancellor";
export const COMMAND_REGISTER_VOTE = "register-vote";
export const COMMAND_REGISTER_PRESIDENT_CHOICE = "register-president-choice";
export const COMMAND_REGISTER_CHANCELLOR_CHOICE = "register-chancellor-choice";
export const COMMAND_REGISTER_CHANCELLOR_VETO = "chancellor-veto";
export const COMMAND_REGISTER_PRESIDENT_VETO = "president-veto";
export const COMMAND_REGISTER_EXECUTION = "register-execution";
export const COMMAND_REGISTER_SPECIAL_ELECTION = "register-special-election";
export const COMMAND_GET_INVESTIGATION = "get-investigation";
export const COMMAND_REGISTER_PEEK = "register-peek";
export const COMMAND_END_TERM = "end-term";

//</editor-fold>

export const STATE_SETUP = "SETUP";
export const STATE_CHANCELLOR_NOMINATION = "CHANCELLOR_NOMINATION";
export const STATE_CHANCELLOR_VOTING = "CHANCELLOR_VOTING"; // Voting on the chancellor is taking place.
export const STATE_LEGISLATIVE_PRESIDENT = "LEGISLATIVE_PRESIDENT"; // In the legislative phase. The president is selecting a card to discard.
export const STATE_LEGISLATIVE_CHANCELLOR = "LEGISLATIVE_CHANCELLOR"; // In the legislative phase. The chancellor is selecting a card to enact.
export const STATE_LEGISLATIVE_PRESIDENT_VETO = "LEGISLATIVE_PRESIDENT_VETO"; // Chancellor decided to initiate veto, President chooses whether to allow.
export const STATE_PP_PEEK = "PRESIDENTIAL_POWER_PEEK"; // President may peek at the next three cards in the deck
export const STATE_PP_INVESTIGATE = "PRESIDENTIAL_POWER_INVESTIGATE"; // President can investigate a party membership
export const STATE_PP_EXECUTION = "PRESIDENTIAL_POWER_EXECUTION"; // President may choose a player to execute
export const STATE_PP_ELECTION = "PRESIDENTIAL_POWER_ELECTION"; // President chooses the next president, seat continues as normal after.
export const STATE_POST_LEGISLATIVE = "POST_LEGISLATIVE"; // Waiting for the President to end their turn.
export const STATE_LIBERAL_VICTORY_POLICY = "LIBERAL_VICTORY_POLICY"; // Liberal Party won through enacting Liberal policies.
export const STATE_LIBERAL_VICTORY_EXECUTION = "LIBERAL_VICTORY_EXECUTION"; // Liberal Party won through executing Hitler.
export const STATE_FASCIST_VICTORY_POLICY = "FASCIST_VICTORY_POLICY"; // Fascist Party won through enacting Fascist policies.
export const STATE_FASCIST_VICTORY_ELECTION = "FASCIST_VICTORY_ELECTION"; // Fascist Party won by successfully electing Hitler chancellor.

// Params
// <editor-fold desc="Params">

// Lobby
export const PARAM_USER_COUNT = "user-count";
export const PARAM_USERNAMES = "usernames";

// Peek
export const PARAM_PEEK = "peek";

// Investigation
export const PARAM_INVESTIGATION = "investigation";

// Incoming Data
export const PARAM_STATE = "state";
export const PARAM_LAST_STATE = "last-state";
export const PARAM_PLAYER_ORDER = "player-order";
export const PARAM_PLAYERS = "players";
export const PLAYER_IDENTITY = "id";
export const PLAYER_IS_ALIVE = "alive";
export const PLAYER_INVESTIGATED = "investigated";
export const PARAM_PRESIDENT = "president";
export const PARAM_CHANCELLOR = "chancellor";
export const PARAM_LAST_PRESIDENT = "last-president";
export const PARAM_LAST_CHANCELLOR = "last-chancellor";
export const PARAM_ELECTION_TRACKER = "election-tracker";
export const PARAM_ELEC_TRACKER_ADVANCED = "election-tracker-advanced";
export const PARAM_VOTES = "user-votes";
export const PARAM_LIBERAL_POLICIES = "liberal-policies";
export const PARAM_FASCIST_POLICIES = "fascist-policies";
export const PARAM_DRAW_DECK = "draw-size";
export const PARAM_DISCARD_DECK = "discard-size";
export const PARAM_PRESIDENT_CHOICES = "president-choices";
export const PARAM_CHANCELLOR_CHOICES = "chancellor-choices";
export const PARAM_TARGET = "target";
export const PARAM_LAST_POLICY = "last-policy";
export const PARAM_DID_VETO_OCCUR = "veto-occurred";
// </editor-fold>
