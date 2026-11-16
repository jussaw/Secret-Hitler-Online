import { PROVISIONAL_GAMES, type PlayerRating } from "../elo";
import { ev } from "../game/sampleGames";
import type { Card, GameEvent, GameRecord, Outcome, Player, Role, Side, StatsData } from "../record";
import { makeRecord } from "../testRecords";
import type { StatsContext } from "../useStats";

/**
 * The player numbers' test data (Phase 22A's trophies and `player.ts`; Phase 22B's pages reuse it),
 * imported by tests only. Seven players and eight games of five seats in October and November 2026,
 * each starting at 20:00 UTC on its day and ending at 20:40:
 *
 * | id    | day    | seats 0 to 4                    | outcome            | dead |
 * |-------|--------|---------------------------------|--------------------|------|
 * | `g1`  | 2 Oct  | Ann L, Bo L, Cy L, Di F, Ed H   | `LIBERAL_POLICIES` |      |
 * | `g2`  | 5 Oct  | Ann F, Bo L, Cy L, Di L, Ed H   | `FASCIST_POLICIES` |      |
 * | `g3`  | 9 Oct  | Ann H, Bo L, Cy L, Fay L, Di F  | `HITLER_ELECTED`   |      |
 * | `g4`  | 1 Nov  | Ann L, Bo F, Cy L, Di L, Ed H   | `HITLER_EXECUTED`  | Ed   |
 * | `g5`  | 10 Nov | Ann L, Bo L, Cy F, Di L, Ed H   | `FASCIST_POLICIES` | Ann  |
 * | `cpu` | 12 Nov | Ann L, Gus L, CPU L, CPU F, CPU H | `LIBERAL_POLICIES` |    |
 * | `g6`  | 13 Nov | Ann L, Bo L, Cy L, Di F, Ed H   | `LIBERAL_POLICIES` |      |
 * | `unf` | 14 Nov | Ann L, Bo L, Cy L, Di F, Ed H   | `UNFINISHED`       |      |
 *
 * `g1`, `g2`, `g4` and `g6` hold one term each (`term`), as the plan's table gives them.
 */

/** The time the tests look at the data: Sun 15 Nov 2026, 12:00 UTC. */
export const SAMPLE_NOW = Date.UTC(2026, 10, 15, 12);
/** The zone the tests pass. */
export const TZ = "UTC";

/** The players, 1 Ann to 7 Gus. */
export const SAMPLE_PLAYERS: Player[] = ["Ann", "Bo", "Cy", "Di", "Ed", "Fay", "Gus"].map((name, i) => ({
  number: i + 1,
  name,
}));

const L: Role = "LIBERAL";
const F: Role = "FASCIST";
const H: Role = "HITLER";

/** How long each game lasts. */
const GAME_MS = 40 * 60_000;

/** Each finished outcome's winners. */
function winnerOf(outcome: Outcome): Side | null {
  switch (outcome) {
    case "LIBERAL_POLICIES":
    case "HITLER_EXECUTED":
      return "LIBERAL";
    case "FASCIST_POLICIES":
    case "HITLER_ELECTED":
      return "FASCIST";
    case "UNFINISHED":
      return null;
  }
}

/**
 * A game of five (or any number of) seats, `[player, role]` each (`null` for a CPU seat, named
 * `Bot 1`, `Bot 2`, … in seat order; a player's seat carries their `SAMPLE_PLAYERS` name), that
 * starts at 20:00 UTC on `day` (`[year, month from 1, day]`) and ends 40 minutes later. Its winner
 * follows `outcome`, `hasCpu` the seats; `o.dead` lists the seats dead at the end and `o.events`
 * its timeline, to which a finished game adds its `end`. Its rounds are the largest `r` of its
 * events (at least 1), and its board the last `enact`'s (5 Liberal or 6 Fascist when policies
 * won it).
 */
export function played(
  id: string,
  day: [number, number, number],
  seats: [number | null, Role][],
  outcome: Outcome,
  o: { dead?: number[]; events?: GameEvent[] } = {}
): GameRecord {
  const [year, month, date] = day;
  const startedAt = Date.UTC(year, month - 1, date, 20);
  const events = [...(o.events ?? [])];
  const rounds = events.reduce((most, e) => Math.max(most, e.r), 1);
  let board = { liberal: 1, fascist: 3 };
  for (const e of events) if (e.type === "enact") board = { liberal: e.liberal, fascist: e.fascist };
  if (outcome === "LIBERAL_POLICIES") board = { ...board, liberal: 5 };
  if (outcome === "FASCIST_POLICIES") board = { ...board, fascist: 6 };
  if (outcome !== "UNFINISHED") events.push(ev.end(rounds, GAME_MS, outcome));
  let bots = 0;
  const dead = new Set(o.dead ?? []);
  return makeRecord({
    id,
    startedAt,
    endedAt: startedAt + GAME_MS,
    outcome,
    winner: winnerOf(outcome),
    complete: true,
    hasCpu: seats.some(([player]) => player === null),
    liberalPolicies: board.liberal,
    fascistPolicies: board.fascist,
    rounds,
    seats: seats.map(([player, role], i) => ({
      player,
      name: player === null ? `Bot ${++bots}` : (SAMPLE_PLAYERS.find((p) => p.number === player)?.name ?? `Player ${player}`),
      cpu: player === null,
      role,
      alive: !dead.has(i),
    })),
    events,
  });
}

/**
 * One term of a five-seat game, from `t` in round `r`: the `nominate` at `t`; a Ja `vote` per seat
 * in seat order at `t + voteMs[seat]` (1000 by default) and the passed `election` with the last of
 * them; the president's `draw` of `hand` at +5 s and `discard` of `hand[discard]` at +6 s; the
 * chancellor's `enact` of `enact` at +8 s, with `board` (by default the one policy enacted); then,
 * with `execute`, the president's execution at +11 s and END TERM at +12 s, else END TERM at +9 s.
 */
export function term(o: {
  t: number;
  r: number;
  president: number;
  chancellor: number;
  voteMs?: Partial<Record<number, number>>;
  hand: Card[];
  discard: number;
  enact: Card;
  board?: { liberal: number; fascist: number };
  execute?: { target: number; role: Role };
}): GameEvent[] {
  const { t, r, president, chancellor, hand } = o;
  const seats = [0, 1, 2, 3, 4];
  const voteAt = (seat: number) => t + (o.voteMs?.[seat] ?? 1000);
  const board = o.board ?? { liberal: o.enact === "L" ? 1 : 0, fascist: o.enact === "F" ? 1 : 0 };
  const events: GameEvent[] = [
    ev.nominate(r, t, president, chancellor),
    ...seats.map((seat) => ev.vote(r, voteAt(seat), seat, true)),
    ev.election(r, Math.max(...seats.map(voteAt)), true, seats.length, 0),
    ev.draw(r, t + 5_000, president, hand.join("")),
    ev.discard(r, t + 6_000, president, o.discard, hand[o.discard]),
    ev.enact(r, t + 8_000, o.enact, "chancellor", chancellor, board.liberal, board.fascist),
  ];
  if (o.execute) {
    events.push(ev.execute(r, t + 11_000, president, o.execute.target, o.execute.role));
    events.push(ev.endTerm(r, t + 12_000, president, "president"));
  } else {
    events.push(ev.endTerm(r, t + 9_000, president, "president"));
  }
  return events;
}

/** The sample's eight games, oldest first, and its seven players. */
export function sampleData(): StatsData {
  const games = [
    played("g1", [2026, 10, 2], [[1, L], [2, L], [3, L], [4, F], [5, H]], "LIBERAL_POLICIES", {
      events: term({ t: 10_000, r: 1, president: 0, chancellor: 1, voteMs: { 0: 1500 }, hand: ["F", "F", "L"], discard: 0, enact: "L" }),
    }),
    played("g2", [2026, 10, 5], [[1, F], [2, L], [3, L], [4, L], [5, H]], "FASCIST_POLICIES", {
      events: term({ t: 10_000, r: 1, president: 1, chancellor: 0, voteMs: { 0: 2500 }, hand: ["L", "F", "F"], discard: 2, enact: "L" }),
    }),
    played("g3", [2026, 10, 9], [[1, H], [2, L], [3, L], [6, L], [4, F]], "HITLER_ELECTED"),
    played("g4", [2026, 11, 1], [[1, L], [2, F], [3, L], [4, L], [5, H]], "HITLER_EXECUTED", {
      dead: [4],
      events: term({
        t: 10_000,
        r: 1,
        president: 0,
        chancellor: 2,
        voteMs: { 0: 2000 },
        hand: ["F", "F", "F"],
        discard: 0,
        enact: "F",
        board: { liberal: 0, fascist: 4 },
        execute: { target: 4, role: "HITLER" },
      }),
    }),
    played("g5", [2026, 11, 10], [[1, L], [2, L], [3, F], [4, L], [5, H]], "FASCIST_POLICIES", { dead: [0] }),
    played("cpu", [2026, 11, 12], [[1, L], [7, L], [null, L], [null, F], [null, H]], "LIBERAL_POLICIES"),
    played("g6", [2026, 11, 13], [[1, L], [2, L], [3, L], [4, F], [5, H]], "LIBERAL_POLICIES", {
      events: term({ t: 10_000, r: 1, president: 0, chancellor: 1, voteMs: { 0: 2000 }, hand: ["F", "F", "F"], discard: 0, enact: "F" }),
    }),
    played("unf", [2026, 11, 14], [[1, L], [2, L], [3, L], [4, F], [5, H]], "UNFINISHED"),
  ];
  return { players: SAMPLE_PLAYERS.map((p) => ({ ...p })), games };
}

/**
 * `stats` with its Elo ratings replaced by `ratings` (player to rating and games): provisional
 * below `PROVISIONAL_GAMES`, the peak the rating itself, no last change. History and games stay.
 */
export function withRatings(
  stats: StatsContext,
  ratings: Record<number, { rating: number; games: number }>
): StatsContext {
  const replaced = new Map<number, PlayerRating>();
  for (const [key, { rating, games }] of Object.entries(ratings)) {
    const player = Number(key);
    replaced.set(player, { player, rating, games, provisional: games < PROVISIONAL_GAMES, lastChange: 0, peak: rating });
  }
  return { ...stats, elo: { ...stats.elo, ratings: replaced } };
}
