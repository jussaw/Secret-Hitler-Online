import { useMemo } from "react";
import { useStatsData } from "./api";
import { countedGames, filterSearch, parseFilter, type StatsFilter } from "./counting";
import { replayElo, type EloResult } from "./elo";
import type { GameRecord, StatsData } from "./record";
import { useLocation } from "./routes";

/** What every tab reads: the records, the address's filter, the games it counts, Elo and names. */
export interface StatsContext {
  data: StatsData;
  filter: StatsFilter;
  counted: GameRecord[];
  elo: EloResult;
  names: Map<number, string>;
}

/** The counted games under `filter`, Elo replayed over them, and every player's name. */
export function buildStats(data: StatsData, filter: StatsFilter): StatsContext {
  const counted = countedGames(data.games, filter);
  return {
    data,
    filter,
    counted,
    elo: replayElo(counted),
    names: new Map(data.players.map((player) => [player.number, player.name])),
  };
}

/** How many filters' contexts are kept per set of records. */
export const STATS_CACHE_SIZE = 8;

/** Each set of records' contexts, keyed by the filter's search and kept in the order last used. */
const cache = new WeakMap<StatsData, Map<string, StatsContext>>();

/** The context for `data` at `search`, built once per filter and kept for the next caller. */
function cachedStats(data: StatsData, search: string): StatsContext {
  let contexts = cache.get(data);
  if (!contexts) {
    contexts = new Map();
    cache.set(data, contexts);
  }
  const filter = parseFilter(search);
  const key = filterSearch(filter);
  let found = contexts.get(key);
  if (found) {
    contexts.delete(key); // the most recently used goes last
  } else {
    found = buildStats(data, filter);
  }
  contexts.set(key, found);
  if (contexts.size > STATS_CACHE_SIZE) {
    const oldest = contexts.keys().next().value;
    if (oldest !== undefined) contexts.delete(oldest);
  }
  return found;
}

/**
 * The stats for the address's filter, or null until the records arrive. Every caller with the
 * same records and the same filter (however its address spells it) gets the same object.
 */
export function useStats(): StatsContext | null {
  const { data } = useStatsData();
  const { search } = useLocation();
  return useMemo(() => (data ? cachedStats(data, search) : null), [data, search]);
}
