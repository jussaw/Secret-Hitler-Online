import type { GameRecord, Outcome, Player, Role, Seat, Side, StatsData } from "./record";
import { makeRecord } from "./testRecords";

/**
 * Builders of records for the stats' unit tests and browser tests (never imported by the page):
 * seats by player number, a finished or unfinished game, a two-sided match, and a seeded set of
 * records. It imports only `record.ts` and `testRecords.ts`, so the browser tests can use it.
 */

const L: Role = "LIBERAL";
const F: Role = "FASCIST";
const HITLER: Role = "HITLER";

/** Each seat count's roles, Liberals first, then the Fascists, then Hitler. */
export const ROLES: Record<number, Role[]> = {
  5: [L, L, L, F, HITLER],
  6: [L, L, L, L, F, HITLER],
  7: [L, L, L, L, F, F, HITLER],
  8: [L, L, L, L, L, F, F, HITLER],
  9: [L, L, L, L, L, F, F, F, HITLER],
  10: [L, L, L, L, L, L, F, F, F, HITLER],
};

/**
 * Seats in turn order: seat `i` is player `players[i]`, named `P<number>`, or a CPU seat
 * (`null`), named `Bot <i + 1>`; roles `roles`, by default `ROLES` for the seat count; all alive.
 */
export function seatsOf(players: (number | null)[], roles: Role[] = ROLES[players.length]): Seat[] {
  return players.map((player, i) => ({
    player,
    name: player === null ? `Bot ${i + 1}` : `P${player}`,
    cpu: player === null,
    role: roles[i],
    alive: true,
  }));
}

const OUTCOME: Record<Side, Outcome> = { LIBERAL: "LIBERAL_POLICIES", FASCIST: "FASCIST_POLICIES" };

/**
 * A game of `seats` that ended at `endedAt`, 30 minutes long: won by `winner` on policies (5
 * Liberal and 1 Fascist, or 2 Liberal and 6 Fascist), or with `winner` null unfinished (2 and 1),
 * with a lone `end` event. `hasCpu` follows the seats; `overrides` replace fields whole.
 */
export function game(
  id: string,
  endedAt: number,
  seats: Seat[],
  winner: Side | null,
  overrides: Partial<GameRecord> = {}
): GameRecord {
  const startedAt = overrides.startedAt ?? endedAt - 30 * 60_000;
  const outcome: Outcome = winner === null ? "UNFINISHED" : OUTCOME[winner];
  const rounds = 8;
  return makeRecord({
    id,
    startedAt,
    endedAt,
    outcome,
    winner,
    complete: true,
    hasCpu: seats.some((seat) => seat.cpu),
    liberalPolicies: winner === "LIBERAL" ? 5 : 2,
    fascistPolicies: winner === "FASCIST" ? 6 : 1,
    rounds,
    seats,
    events: [{ type: "end", t: endedAt - startedAt, r: rounds, outcome }],
    ...overrides,
  });
}

/**
 * A finished game `side` won: `winners` seated on that side (as `LIBERAL` or `FASCIST`), then
 * `losers` on the other.
 */
export function match(id: string, endedAt: number, winners: number[], losers: number[], side: Side = "LIBERAL"): GameRecord {
  const winning: Role = side === "LIBERAL" ? L : F;
  const losing: Role = side === "LIBERAL" ? F : L;
  const seats = seatsOf([...winners, ...losers], [...winners.map(() => winning), ...losers.map(() => losing)]);
  return game(id, endedAt, seats, side);
}

/** A seeded random number generator (mulberry32): the same numbers for the same seed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60_000;
/** Each finished game's way of ending, by the side that won. */
const ENDINGS: Record<Side, Outcome[]> = {
  LIBERAL: ["LIBERAL_POLICIES", "HITLER_EXECUTED"],
  FASCIST: ["FASCIST_POLICIES", "HITLER_ELECTED"],
};

/**
 * `games` records of `players` players (`Seat01Player`, `Seat02Player`, …), the same for the same
 * `seed`, oldest first, ids `g0001`, `g0002`, …: six games a night every third evening from 2
 * Nov 2025, 5 to 10 seats each (no more people than there are players) with roles shuffled from
 * `ROLES`, about one game in seven with one or two CPU seats and one in twenty-five unfinished.
 */
export function generateData(games: number, seed: number, players = 10): StatsData {
  const next = seeded(seed);
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const shuffle = <T>(items: T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const roster: Player[] = Array.from({ length: players }, (_, i) => ({
    number: i + 1,
    name: `Seat${String(i + 1).padStart(2, "0")}Player`,
  }));
  const first = Date.UTC(2025, 10, 2, 19, 0);
  const records: GameRecord[] = [];
  for (let i = 0; i < games; i++) {
    const startedAt = first + Math.floor(i / 6) * 3 * DAY + (i % 6) * 40 * MINUTE;
    const endedAt = startedAt + int(15, 35) * MINUTE;
    const size = int(5, 10);
    const bots = Math.max(next() < 1 / 7 ? int(1, 2) : 0, size - players);
    const people = shuffle(roster.map((p) => p.number)).slice(0, size - bots);
    const cpuSeats = new Set(shuffle(ROLES[size].map((_, s) => s)).slice(0, bots));
    const seatPlayers: (number | null)[] = [];
    let person = 0;
    for (let s = 0; s < size; s++) seatPlayers.push(cpuSeats.has(s) ? null : people[person++]);
    const seats = seatsOf(seatPlayers, shuffle(ROLES[size])).map((seat) =>
      seat.player === null ? seat : { ...seat, name: roster[seat.player - 1].name }
    );
    const winner: Side | null = next() < 1 / 25 ? null : next() < 0.5 ? "LIBERAL" : "FASCIST";
    const id = `g${String(i + 1).padStart(4, "0")}`;
    const record = game(id, endedAt, seats, winner, { startedAt });
    if (winner !== null) {
      const outcome = ENDINGS[winner][int(0, 1)];
      record.outcome = outcome;
      record.events = [{ type: "end", t: endedAt - startedAt, r: record.rounds, outcome }];
    }
    records.push(record);
  }
  return { players: roster, games: records };
}
