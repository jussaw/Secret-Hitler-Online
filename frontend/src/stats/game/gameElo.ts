import { countedGames, DEFAULT_FILTER } from "../counting";
import { replayElo, type EloResult, type GameElo } from "../elo";
import type { StatsData } from "../record";

/**
 * A game page's Elo change (Phase 22A): what the game moved its players by when it counts under
 * the default filter (every player, no CPU games), whatever filter the stats tabs have. Pure.
 */

/** Each set of records' default Elo, replayed once. */
const cache = new WeakMap<StatsData, EloResult>();

/** Elo replayed over the games the default filter counts, once per set of records. */
export function defaultElo(data: StatsData): EloResult {
  let elo = cache.get(data);
  if (!elo) {
    elo = replayElo(countedGames(data.games, DEFAULT_FILTER));
    cache.set(data, elo);
  }
  return elo;
}

/** The game's Elo change under the default filter, or null when it does not count there (CPU, unfinished, unknown). */
export function gameEloChange(data: StatsData, gameId: string): GameElo | null {
  return defaultElo(data).games.get(gameId) ?? null;
}
