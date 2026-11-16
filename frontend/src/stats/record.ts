/**
 * The game record, format 1, as the server stores it and `GET /api/stats/games` serves it (the
 * spec's "The record"), and the check every response goes through before a page reads it. Seats
 * are referred to by index, cards and policies are `L` and `F`, `t` is milliseconds since
 * `startedAt` and `r` the round the move was made in.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

export type Card = "L" | "F";
export type Role = "LIBERAL" | "FASCIST" | "HITLER";
export type Side = "LIBERAL" | "FASCIST";
export type Outcome = "LIBERAL_POLICIES" | "HITLER_EXECUTED" | "FASCIST_POLICIES" | "HITLER_ELECTED" | "UNFINISHED";

export interface Seat {
  player: number | null;
  name: string;
  cpu: boolean;
  role: Role;
  alive: boolean;
}

interface At {
  t: number;
  r: number;
}
export type GameEvent =
  | (At & { type: "nominate"; president: number; chancellor: number })
  | (At & { type: "vote"; seat: number; ja: boolean })
  | (At & { type: "election"; passed: boolean; ja: number; nein: number })
  | (At & { type: "tracker"; value: number })
  | (At & { type: "draw"; seat: number; cards: Card[] })
  | (At & { type: "discard"; seat: number; index: number; card: Card })
  | (At & { type: "veto"; seat: number })
  | (At & { type: "vetoAnswer"; seat: number; accepted: boolean })
  | (At & { type: "enact"; policy: Card; by: "chancellor" | "chaos"; seat?: number; liberal: number; fascist: number })
  | (At & { type: "reshuffle"; drawPile: number })
  | (At & { type: "peek"; seat: number; cards: Card[] })
  | (At & { type: "investigate"; seat: number; target: number; result: Side })
  | (At & { type: "execute"; seat: number; target: number; role: Role })
  | (At & { type: "specialElection"; seat: number; target: number })
  | (At & { type: "endTerm"; seat: number; by: "president" | "countdown" })
  | (At & { type: "timerPause"; seat: number })
  | (At & { type: "timerResume"; seat: number })
  | (At & { type: "disconnect"; seat: number })
  | (At & { type: "reconnect"; seat: number })
  | (At & { type: "restored" })
  | (At & { type: "end"; outcome: Outcome });

export interface GameRecord {
  id: string;
  format: 1;
  startedAt: number;
  endedAt: number;
  outcome: Outcome;
  winner: Side | null;
  complete: boolean;
  hasCpu: boolean;
  liberalPolicies: number;
  fascistPolicies: number;
  rounds: number;
  seats: Seat[];
  events: GameEvent[];
}
export interface Player {
  number: number;
  name: string;
}
/** The response of `GET /api/stats/games`: every player, and every record, games oldest first. */
export interface StatsData {
  players: Player[];
  games: GameRecord[];
}

/** Where the page reads the records (`api.ts` re-exports it; the browser tests stub it). */
export const STATS_GAMES_PATH = "/api/stats/games";

/**
 * Each event type's keys besides `type`, `t` and `r`, in the spec's order. A chaos `enact` leaves
 * out `seat`.
 */
export const EVENT_FIELDS: { readonly [T in GameEvent["type"]]: readonly string[] } = {
  nominate: ["president", "chancellor"],
  vote: ["seat", "ja"],
  election: ["passed", "ja", "nein"],
  tracker: ["value"],
  draw: ["seat", "cards"],
  discard: ["seat", "index", "card"],
  veto: ["seat"],
  vetoAnswer: ["seat", "accepted"],
  enact: ["policy", "by", "seat", "liberal", "fascist"],
  reshuffle: ["drawPile"],
  peek: ["seat", "cards"],
  investigate: ["seat", "target", "result"],
  execute: ["seat", "target", "role"],
  specialElection: ["seat", "target"],
  endTerm: ["seat", "by"],
  timerPause: ["seat"],
  timerResume: ["seat"],
  disconnect: ["seat"],
  reconnect: ["seat"],
  restored: [],
  end: ["outcome"],
};

const OUTCOMES: readonly unknown[] = [
  "LIBERAL_POLICIES",
  "HITLER_EXECUTED",
  "FASCIST_POLICIES",
  "HITLER_ELECTED",
  "UNFINISHED",
];
const ROLES: readonly unknown[] = ["LIBERAL", "FASCIST", "HITLER"];
const WINNERS: readonly unknown[] = ["LIBERAL", "FASCIST", null];

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value);
}

/** Throws the problem at `path` unless `ok`, showing the value found when one is given. */
function check(ok: boolean, path: string, problem: string, ...found: unknown[]): void {
  if (!ok) {
    const shown = found.length > 0 ? `: ${JSON.stringify(found[0])}` : "";
    throw new Error(`Malformed games response: ${path} ${problem}${shown}`);
  }
}

function checkSeat(seat: unknown, path: string): void {
  check(isObject(seat), path, "is not an object");
  const s = seat as Json;
  check(s.player === null || isInteger(s.player), `${path}.player`, "is not a player number or null", s.player);
  check(typeof s.name === "string", `${path}.name`, "is not a string", s.name);
  check(typeof s.cpu === "boolean", `${path}.cpu`, "is not a boolean", s.cpu);
  check(ROLES.includes(s.role), `${path}.role`, "is not a role", s.role);
  check(typeof s.alive === "boolean", `${path}.alive`, "is not a boolean", s.alive);
}

function checkEvent(event: unknown, path: string): void {
  check(isObject(event), path, "is not an object");
  const e = event as Json;
  check(
    typeof e.type === "string" && Object.prototype.hasOwnProperty.call(EVENT_FIELDS, e.type),
    `${path}.type`,
    "is not an event type",
    e.type
  );
  check(typeof e.t === "number", `${path}.t`, "is not a number", e.t);
  check(typeof e.r === "number", `${path}.r`, "is not a number", e.r);
}

function checkGame(game: unknown, path: string): void {
  check(isObject(game), path, "is not an object");
  const g = game as Json;
  if (g.format !== 1) {
    throw new Error(`Unsupported game record format: ${String(g.format)}`);
  }
  check(typeof g.id === "string", `${path}.id`, "is not a string", g.id);
  check(typeof g.startedAt === "number", `${path}.startedAt`, "is not a number", g.startedAt);
  check(typeof g.endedAt === "number", `${path}.endedAt`, "is not a number", g.endedAt);
  check(OUTCOMES.includes(g.outcome), `${path}.outcome`, "is not an outcome", g.outcome);
  check(WINNERS.includes(g.winner), `${path}.winner`, "is not a side or null", g.winner);
  check(typeof g.complete === "boolean", `${path}.complete`, "is not a boolean", g.complete);
  check(typeof g.hasCpu === "boolean", `${path}.hasCpu`, "is not a boolean", g.hasCpu);
  for (const key of ["liberalPolicies", "fascistPolicies", "rounds"]) {
    check(isInteger(g[key]), `${path}.${key}`, "is not an integer", g[key]);
  }
  check(Array.isArray(g.seats), `${path}.seats`, "is not an array");
  (g.seats as unknown[]).forEach((seat, i) => checkSeat(seat, `${path}.seats[${i}]`));
  check(Array.isArray(g.events), `${path}.events`, "is not an array");
  (g.events as unknown[]).forEach((event, i) => checkEvent(event, `${path}.events[${i}]`));
}

/**
 * Checks a `GET /api/stats/games` response and returns it, typed and in its own order.
 * @throws Error naming the first problem found: `Unsupported game record format: <format>` for a
 *   record of a format other than 1, or the path of the first malformed field.
 */
export function parseStatsData(json: unknown): StatsData {
  check(isObject(json), "the response", "is not an object");
  const data = json as Json;
  check(Array.isArray(data.players), "players", "is not an array");
  (data.players as unknown[]).forEach((player, i) => {
    check(isObject(player), `players[${i}]`, "is not an object");
    const p = player as Json;
    check(isInteger(p.number), `players[${i}].number`, "is not an integer", p.number);
    check(typeof p.name === "string", `players[${i}].name`, "is not a string", p.name);
  });
  check(Array.isArray(data.games), "games", "is not an array");
  (data.games as unknown[]).forEach((game, i) => checkGame(game, `games[${i}]`));
  return json as StatsData;
}

/** The side a role plays for: Hitler is a Fascist. */
export function sideOf(role: Role): Side {
  return role === "LIBERAL" ? "LIBERAL" : "FASCIST";
}

/** The player's current name, or `Player <number>` for a number with no player. */
export function playerName(data: StatsData, player: number): string {
  const found = data.players.find((p) => p.number === player);
  return found ? found.name : `Player ${player}`;
}
