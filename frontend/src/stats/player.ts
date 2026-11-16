import { allStats } from "./allStats";
import type { HandCounts } from "./cards";
import {
  compareByEnd,
  compareNames,
  humanSeats,
  MIN_CHANCES,
  MIN_GAMES,
  nameOf,
  rankRows,
  rate,
  seatWon,
  type Rate,
} from "./counting";
import { ELO_START, PROVISIONAL_GAMES, type EloResult } from "./elo";
import { playerName, sideOf, type GameRecord, type Outcome, type Role } from "./record";
import { byRole } from "./roles";
import { DECISIONS, type Decision } from "./timing";
import { awardTrophies, speedDemonOf, trophyFacts, type Trophy } from "./trophies";
import { buildStats, type StatsContext } from "./useStats";

/**
 * One player's numbers for their page (Phase 22B draws them), and PLAYERS' rows. A player's page
 * ignores the player filter and keeps the CPU toggle, so `computePlayer` works on
 * `withoutPlayerFilter(stats)`; PLAYERS uses the whole filter. Every number comes from the stat
 * modules' `byPlayer` maps (through `allStats`), Elo, or the records themselves where no module
 * counts it (the counted games, dates, overall wins, CPU and recorded games, the latest games).
 * Pure: `now` is passed in.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** Another player, by number and name. */
export interface PersonLink {
  player: number;
  name: string;
}

/** One of a player's latest games, as their page lists it. */
export interface LatestGame {
  id: string;
  endedAt: number;
  /** Their role in it. */
  role: Role;
  result: "won" | "lost" | "unfinished";
  outcome: Outcome;
  /** Whether it had a CPU seat. */
  cpu: boolean;
}

export interface PlayerStats {
  player: number;
  name: string;
  /** Counted games, the first one's start and the last one's end (null with none). */
  games: number;
  firstPlayed: number | null;
  lastPlayed: number | null;
  /** Finished games with a CPU seat they sat in, which the toggle leaves out; 0 with it on. */
  cpuNotCounted: number;
  /** Every record with a seat of theirs, as GAMES lists them. */
  allGames: number;
  trophies: Trophy[];
  /** Null with no counted games. */
  elo: {
    rating: number;
    provisional: boolean;
    /** Their rank in OVERVIEW's power ranking; null while provisional. */
    rank: number | null;
    peak: number;
    /** From 1500 at x 0, a point per counted game; dashed while provisional. */
    history: { x: number; y: number; dashed: boolean }[];
  } | null;
  winRate: { overall: Rate; liberal: Rate; fascist: Rate; hitler: Rate; bySeats: { seats: number; rate: Rate }[] };
  roles: { liberal: number; fascist: number; hitler: number; expectedLiberal: number | null; luck: number | null };
  /** `current` below 0 is a losing streak. */
  streaks: { current: number; longestWin: number; longestLoss: number };
  cards: {
    /** FFF, FFL, FLL, LLL, drawn as president. */
    hands: [number, number, number, number];
    liberalAccuracy: Rate;
    deepCover: Rate;
    oneOfEach: Record<Role, Rate>;
    fascistChoices: number;
    forced: { president: number; chancellor: number };
  };
  votes: { ja: Rate; liberalAccuracy: Rate; fascistLoyalty: Rate };
  powers: { investigations: number; foundFascist: number; executions: number; hitlerExecutions: number; survival: Rate };
  people: {
    mostPlayedWith: (PersonLink & { games: number }) | null;
    bestTeammate: (PersonLink & { wins: number; games: number }) | null;
    nemesis: (PersonLink & { losses: number; games: number }) | null;
    favouriteOpponent: (PersonLink & { wins: number; games: number }) | null;
  };
  /** Their average time per decision in ms, null with no samples. */
  timing: Record<Decision, number | null>;
  /** Their 5 newest records of any kind, newest first (by `endedAt`, then `id`). */
  latest: LatestGame[];
}

/** One row of PLAYERS. */
export interface PlayerListRow {
  player: number;
  name: string;
  games: number;
  winRate: Rate;
  /** Unrounded; shown rounded. */
  rating: number;
  provisional: boolean;
  /** Their last counted game's end. */
  lastPlayed: number;
}

/** How many latest games a player's page lists. */
export const LATEST_GAMES = 5;

/** No chances yet, over games or over chances. */
const NO_GAMES_RATE = rate(0, 0, MIN_GAMES);
const NO_CHANCES_RATE = rate(0, 0, MIN_CHANCES);

/** `stats` with every player on (and its CPU toggle): the same object when it already has them all. */
export function withoutPlayerFilter(stats: StatsContext): StatsContext {
  if (stats.filter.players === null) return stats;
  return buildStats(stats.data, { players: null, cpu: stats.filter.cpu });
}

/** Whether a record has a CPU seat. */
const hasCpu = (record: GameRecord) => record.hasCpu || record.seats.some((seat) => seat.cpu);

/** Their seat in a record, or -1. */
const seatOf = (record: GameRecord, player: number) => record.seats.findIndex((seat) => !seat.cpu && seat.player === player);

/**
 * OVERVIEW's power ranking order, with ranks: settled players by rounded rating (`rankRows`, ties
 * to more games, then the name), then the provisional ones, unranked, by rounded rating, games and
 * name.
 */
function powerRanking(elo: EloResult, names: Map<number, string>): { player: number; rank: number | null }[] {
  const rated = Array.from(elo.ratings.values());
  const shown = (player: number) => Math.round(elo.ratings.get(player)!.rating);
  const settled = rankRows(
    rated.filter((r) => !r.provisional).map((r) => ({ player: r.player, value: shown(r.player), count: r.games })),
    (a, b) => b - a,
    names,
    0
  );
  const provisional = rated
    .filter((r) => r.provisional)
    .map((r) => r.player)
    .sort(
      (a, b) =>
        shown(b) - shown(a) ||
        elo.ratings.get(b)!.games - elo.ratings.get(a)!.games ||
        compareNames(nameOf(names, a), nameOf(names, b)) ||
        a - b
    );
  return [...settled.map((row) => ({ player: row.player, rank: row.rank })), ...provisional.map((player) => ({ player, rank: null }))];
}

/** A person by number, named. */
const person = (names: Map<number, string>, player: number): PersonLink => ({ player, name: nameOf(names, player) });

/** One player's numbers under `stats`' CPU toggle, whatever its player filter, seen at `now`. */
export function computePlayer(stats: StatsContext, player: number, now: number): PlayerStats {
  const ctx = withoutPlayerFilter(stats);
  const { names } = ctx;
  const all = allStats(ctx, now);

  // The counted games they sat in, oldest first, with their seat.
  const theirs: { record: GameRecord; seat: number }[] = [];
  for (const record of ctx.counted) {
    const found = humanSeats(record).find((s) => s.player === player);
    if (found) theirs.push({ record, seat: found.seat });
  }
  const games = theirs.length;
  const wins = theirs.filter(({ record, seat }) => seatWon(record, seat)).length;

  // Every record of theirs, counted or not.
  const records = ctx.data.games.filter((record) => seatOf(record, player) >= 0);
  const cpuNotCounted = ctx.filter.cpu ? 0 : records.filter((r) => r.outcome !== "UNFINISHED" && hasCpu(r)).length;
  const latest: LatestGame[] = [...records]
    .sort((a, b) => compareByEnd(b, a))
    .slice(0, LATEST_GAMES)
    .map((record) => {
      const seat = seatOf(record, player);
      const result = record.outcome === "UNFINISHED" || record.winner === null ? "unfinished" : seatWon(record, seat) ? "won" : "lost";
      return { id: record.id, endedAt: record.endedAt, role: record.seats[seat].role, result, outcome: record.outcome, cpu: hasCpu(record) };
    });

  const facts = trophyFacts(ctx, all);
  const trophies = awardTrophies(facts, ctx.counted.length, speedDemonOf(all, names)).get(player) ?? [];

  const rating = ctx.elo.ratings.get(player);
  let elo: PlayerStats["elo"] = null;
  if (games > 0 && rating) {
    const history = [{ x: 0, y: ELO_START, dashed: true }];
    let y = ELO_START;
    theirs.forEach(({ record, seat }, i) => {
      const change = ctx.elo.games.get(record.id)?.liberalChange ?? 0;
      y += sideOf(record.seats[seat].role) === "LIBERAL" ? change : -change;
      history.push({ x: i + 1, y, dashed: i + 1 < PROVISIONAL_GAMES });
    });
    const rank = powerRanking(ctx.elo, names).find((row) => row.player === player)?.rank ?? null;
    elo = { rating: rating.rating, provisional: rating.provisional, rank, peak: rating.peak, history };
  }

  const roles = all.roles.byPlayer.get(player);
  const cards = all.cards.byPlayer.get(player);
  const votes = all.votes.byPlayer.get(player);
  const powers = all.powers.byPlayer.get(player);
  const rivals = all.rivals.byPlayer.get(player);
  const recs = all.records.byPlayer.get(player);
  const timing = all.timing.byPlayer.get(player);

  const bySeats = roles
    ? Array.from(roles.bySize.entries())
        .sort(([a], [b]) => a - b)
        .map(([seats, r]) => ({ seats, rate: r }))
    : [];
  const hands: HandCounts = cards ? [...cards.hands] as HandCounts : [0, 0, 0, 0];

  return {
    player,
    name: playerName(ctx.data, player),
    games,
    firstPlayed: games > 0 ? Math.min(...theirs.map(({ record }) => record.startedAt)) : null,
    lastPlayed: games > 0 ? Math.max(...theirs.map(({ record }) => record.endedAt)) : null,
    cpuNotCounted,
    allGames: records.length,
    trophies,
    elo,
    winRate: {
      overall: rate(wins, games, MIN_GAMES),
      liberal: roles?.winAs.LIBERAL ?? NO_GAMES_RATE,
      fascist: roles?.winAs.FASCIST ?? NO_GAMES_RATE,
      hitler: roles?.winAs.HITLER ?? NO_GAMES_RATE,
      bySeats,
    },
    roles: {
      liberal: roles?.split.LIBERAL.hits ?? 0,
      fascist: roles?.split.FASCIST.hits ?? 0,
      hitler: roles?.split.HITLER.hits ?? 0,
      expectedLiberal: roles && roles.games > 0 ? roles.expectedLiberalGames / roles.games : null,
      luck: roles?.luck ?? null,
    },
    streaks: {
      current: recs?.current ?? 0,
      longestWin: recs?.longestWin?.length ?? 0,
      longestLoss: recs?.longestLoss?.length ?? 0,
    },
    cards: {
      hands,
      liberalAccuracy: cards?.liberalAccuracy ?? NO_CHANCES_RATE,
      deepCover: cards?.deepCover ?? NO_CHANCES_RATE,
      oneOfEach: cards?.oneOfEach ?? byRole(() => NO_CHANCES_RATE),
      fascistChoices: cards?.fascistChoices ?? 0,
      forced: cards ? { ...cards.forced } : { president: 0, chancellor: 0 },
    },
    votes: {
      ja: votes?.ja ?? NO_CHANCES_RATE,
      liberalAccuracy: votes?.liberalAccuracy ?? NO_CHANCES_RATE,
      fascistLoyalty: votes?.fascistLoyalty ?? NO_CHANCES_RATE,
    },
    powers: {
      investigations: powers?.investigations ?? 0,
      foundFascist: powers?.saw.FASCIST ?? 0,
      executions: powers?.executions ?? 0,
      hitlerExecutions: powers?.hitlerExecuted ?? 0,
      survival: powers?.survival ?? NO_GAMES_RATE,
    },
    people: {
      mostPlayedWith: rivals?.mostPlayedWith ? { ...person(names, rivals.mostPlayedWith.player), games: rivals.mostPlayedWith.games } : null,
      bestTeammate: rivals?.bestTeammate
        ? { ...person(names, rivals.bestTeammate.player), wins: rivals.bestTeammate.wins, games: rivals.bestTeammate.games }
        : null,
      nemesis: rivals?.nemesis
        ? { ...person(names, rivals.nemesis.player), losses: rivals.nemesis.losses, games: rivals.nemesis.games }
        : null,
      favouriteOpponent: rivals?.favouriteOpponent
        ? { ...person(names, rivals.favouriteOpponent.player), wins: rivals.favouriteOpponent.wins, games: rivals.favouriteOpponent.games }
        : null,
    },
    timing: Object.fromEntries(DECISIONS.map((kind) => [kind, timing?.decisions[kind].ms ?? null])) as Record<Decision, number | null>,
    latest,
  };
}

/**
 * PLAYERS: every player with a counted game under `stats`' whole filter, in the power ranking's
 * order (settled players by rounded rating, ties to more games, then the name; then the
 * provisional ones by rounded rating, games and name).
 */
export function computePlayersList(stats: StatsContext): PlayerListRow[] {
  const tallies = new Map<number, { games: number; wins: number; lastPlayed: number }>();
  for (const record of stats.counted) {
    for (const { seat, player } of humanSeats(record)) {
      const t = tallies.get(player) ?? { games: 0, wins: 0, lastPlayed: -Infinity };
      t.games++;
      if (seatWon(record, seat)) t.wins++;
      t.lastPlayed = Math.max(t.lastPlayed, record.endedAt);
      tallies.set(player, t);
    }
  }
  const order = powerRanking(stats.elo, stats.names).map((row) => row.player);
  const place = new Map(order.map((player, i) => [player, i]));
  return Array.from(tallies.entries())
    .sort(([a], [b]) => (place.get(a) ?? Infinity) - (place.get(b) ?? Infinity) || compareNames(nameOf(stats.names, a), nameOf(stats.names, b)) || a - b)
    .map(([player, t]) => {
      const rating = stats.elo.ratings.get(player);
      return {
        player,
        name: nameOf(stats.names, player),
        games: t.games,
        winRate: rate(t.wins, t.games, MIN_GAMES),
        rating: rating?.rating ?? ELO_START,
        provisional: rating?.provisional ?? true,
        lastPlayed: t.lastPlayed,
      };
    });
}
