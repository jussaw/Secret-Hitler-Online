// TODO: Change these all to camelCase
export const enum WSCommandType {
  PING = "ping",
  START_GAME = "start-game",
  GET_STATE = "get-state",
  REGISTER_CHANCELLOR_VETO = "chancellor-veto",
  REGISTER_PRESIDENT_VETO = "president-veto",
  REGISTER_PEEK = "register-peek",
  END_TERM = "end-term",
  // The president pauses and resumes the END TERM countdown.
  PAUSE_TERM_TIMER = "pause-term-timer",
  RESUME_TERM_TIMER = "resume-term-timer",
  // Select an icon
  SELECT_ICON = "select-icon",
  // The host chooses how many bots join, in the lobby (#70).
  SET_BOT_COUNT = "set-bot-count",
  // The host chooses how well the bots play, in the lobby (#72).
  SET_BOT_SKILL = "set-bot-skill",
  // Select a player
  NOMINATE_CHANCELLOR = "nominate-chancellor",
  REGISTER_EXECUTION = "register-execution",
  REGISTER_SPECIAL_ELECTION = "register-special-election",
  GET_INVESTIGATION = "get-investigation",
  // Voting action
  REGISTER_VOTE = "register-vote",
  // Policy action
  REGISTER_CHANCELLOR_CHOICE = "register-chancellor-choice",
  REGISTER_PRESIDENT_CHOICE = "register-president-choice",
}

/**
 * How well the bots play (#72), by the server's `BotSkill` names: the host's set-bot-skill sends
 * one, and every lobby packet's `botSkill` says the one a game started now seats. The stats pages
 * have a type of the same name (`src/stats/record.ts`), kept apart on purpose: the stats chunk
 * imports nothing from the game's code, and `record.ts` imports nothing at all.
 */
export type BotSkill = "EASY" | "NORMAL" | "HARD";

/** The levels, in the order the host's switch shows them. */
export const BOT_SKILLS: readonly BotSkill[] = ["EASY", "NORMAL", "HARD"];

/** A lobby packet's botSkill: one of BOT_SKILLS, or NORMAL for anything else (missing, unknown). */
export function botSkillOf(value: unknown): BotSkill {
  return BOT_SKILLS.find((skill) => skill === value) ?? "NORMAL";
}

/** All possible commands and associated parameters. */
export type ServerRequestPayload =
  | { command: WSCommandType.PING }
  | { command: WSCommandType.START_GAME }
  | { command: WSCommandType.GET_STATE }
  | { command: WSCommandType.REGISTER_CHANCELLOR_VETO }
  | { command: WSCommandType.REGISTER_PRESIDENT_VETO; veto: boolean }
  | { command: WSCommandType.REGISTER_PEEK }
  | { command: WSCommandType.END_TERM }
  | { command: WSCommandType.PAUSE_TERM_TIMER }
  | { command: WSCommandType.RESUME_TERM_TIMER }
  | { command: WSCommandType.SELECT_ICON; icon: string }
  | { command: WSCommandType.SET_BOT_COUNT; count: number }
  | { command: WSCommandType.SET_BOT_SKILL; skill: BotSkill }
  | { command: WSCommandType.NOMINATE_CHANCELLOR; target: string }
  | { command: WSCommandType.REGISTER_EXECUTION; target: string }
  | { command: WSCommandType.REGISTER_SPECIAL_ELECTION; target: string }
  | { command: WSCommandType.GET_INVESTIGATION; target: string }
  | { command: WSCommandType.REGISTER_VOTE; vote: boolean }
  | { command: WSCommandType.REGISTER_CHANCELLOR_CHOICE; choice: number }
  | { command: WSCommandType.REGISTER_PRESIDENT_CHOICE; choice: number };

export type SendWSCommand = (payload: ServerRequestPayload) => void;

/**
 * A WebSocket command to send to the server.
 * @param {WSCommandType} command The command type.
 * @param {string} lobby The lobby to send the command to.
 * @param {string} name The name of the player sending the command.
 *
 * Optional, depending on command:
 * @param {number} icon The icon to select.
 * @param {number} count The number of bots the host chose (set-bot-count).
 * @param {BotSkill} skill How well the bots play, as the host chose (set-bot-skill).
 * @param {string} target The target of the command. Used for powers and nominations.
 * @param {boolean} vote The vote to register.
 * @param {number} choice The policy index to register.
 */
export type WSCommand = {
  name: string;
  lobby: string;
} & ServerRequestPayload;
