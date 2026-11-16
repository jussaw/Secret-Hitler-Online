import { compareByEnd, humanSeats } from "./counting";
import { sideOf, type GameRecord } from "./record";

/**
 * Elo for a team game (the spec's "Elo"): each side's strength is the mean of its seats' ratings,
 * the Fascists get a handicap learned from the group's earlier games of the same size, and everyone
 * on a side moves by the same amount. Replayed over the counted games, so the filter changes it.
 * Ratings are kept unrounded; the page rounds them to show them.
 */

/** Everyone's first rating, and the rating a CPU seat counts as. */
export const ELO_START = 1500;
/** The most a side can move in one game. */
export const ELO_K = 32;
/** The rating gap at which the stronger side is ten times as likely to win. */
export const ELO_SCALE = 400;
/** Imaginary games each way that pull the handicap's Liberal win rate towards a half. */
export const ELO_PRIOR = 5;
/** A player is provisional until they have this many counted games. */
export const PROVISIONAL_GAMES = 5;

export interface PlayerRating {
  player: number;
  rating: number;
  games: number;
  provisional: boolean;
  /** The change in the player's last counted game. */
  lastChange: number;
  /** The highest rating after any of the player's games (the start does not count). */
  peak: number;
}

/** Every player rated so far, and their rating after a game. */
export interface RatingPoint {
  gameId: string;
  endedAt: number;
  ratings: Map<number, number>;
}

export interface GameElo {
  gameId: string;
  /** The Liberal side's expected score before the game. */
  expectedLiberal: number;
  /** Points added to the Fascist side. */
  handicap: number;
  /** What every Liberal gained (negative: lost); every Fascist moved the other way. */
  liberalChange: number;
}

export interface EloResult {
  ratings: Map<number, PlayerRating>;
  history: RatingPoint[];
  games: Map<string, GameElo>;
}

/**
 * The points added to the Fascist side, from earlier games of the same size: `p` is their Liberal
 * win rate pulled towards a half by `ELO_PRIOR` imaginary games each way, and the handicap
 * `ELO_SCALE · log10((1 − p) / p)`, negative when Liberals win more often.
 */
export function handicap(liberalWins: number, games: number): number {
  const p = (liberalWins + ELO_PRIOR) / (games + 2 * ELO_PRIOR);
  return ELO_SCALE * Math.log10((1 - p) / p);
}

/** The Liberal side's expected score, from the two sides' mean ratings and the handicap. */
export function expectedLiberal(liberal: number, fascist: number, handicap: number): number {
  return 1 / (1 + 10 ** ((fascist + handicap - liberal) / ELO_SCALE));
}

/** What every Liberal gains when the Liberals win (`liberalWon`) or lose: `ELO_K · (S − E)`. */
export function eloChange(expected: number, liberalWon: boolean): number {
  return ELO_K * ((liberalWon ? 1 : 0) - expected);
}

const mean = (values: number[]) => (values.length === 0 ? ELO_START : values.reduce((s, v) => s + v, 0) / values.length);

/**
 * Elo replayed over the counted games, in order (`endedAt`, then `id`), each game using the
 * ratings from before it. A CPU seat counts as `ELO_START` and is never rated.
 */
export function replayElo(counted: GameRecord[]): EloResult {
  const ratings = new Map<number, PlayerRating>();
  const history: RatingPoint[] = [];
  const games = new Map<string, GameElo>();
  /** Earlier games and Liberal wins, by seat count. */
  const tally = new Map<number, { wins: number; games: number }>();

  for (const record of [...counted].sort(compareByEnd)) {
    const size = record.seats.length;
    const earlier = tally.get(size) ?? { wins: 0, games: 0 };
    const fascistHandicap = handicap(earlier.wins, earlier.games);

    const liberal: number[] = [];
    const fascist: number[] = [];
    record.seats.forEach((seat) => {
      const rated = !seat.cpu && seat.player !== null ? ratings.get(seat.player) : undefined;
      (sideOf(seat.role) === "LIBERAL" ? liberal : fascist).push(rated ? rated.rating : ELO_START);
    });
    const liberalWon = record.winner === "LIBERAL";
    const expected = expectedLiberal(mean(liberal), mean(fascist), fascistHandicap);
    const liberalChange = eloChange(expected, liberalWon);

    for (const { seat, player } of humanSeats(record)) {
      const change = sideOf(record.seats[seat].role) === "LIBERAL" ? liberalChange : -liberalChange;
      const before = ratings.get(player);
      const rating = (before ? before.rating : ELO_START) + change;
      ratings.set(player, {
        player,
        rating,
        games: (before ? before.games : 0) + 1,
        provisional: false, // set once the replay is done
        lastChange: change,
        peak: before ? Math.max(before.peak, rating) : rating,
      });
    }

    tally.set(size, { wins: earlier.wins + (liberalWon ? 1 : 0), games: earlier.games + 1 });
    games.set(record.id, { gameId: record.id, expectedLiberal: expected, handicap: fascistHandicap, liberalChange });
    const after = new Map<number, number>();
    ratings.forEach((r, player) => after.set(player, r.rating));
    history.push({ gameId: record.id, endedAt: record.endedAt, ratings: after });
  }

  ratings.forEach((r) => {
    r.provisional = r.games < PROVISIONAL_GAMES;
  });
  return { ratings, history, games };
}
