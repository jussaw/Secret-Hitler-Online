import { computeCards, type CardStats } from "./cards";
import { computePowers, type PowerStats } from "./powers";
import { computeRecords, type RecordStats } from "./records";
import { computeRivals, type RivalStats } from "./rivals";
import { computeRoles, type RoleStats } from "./roles";
import { computeTiming, type TimingStats } from "./timing";
import type { StatsContext } from "./useStats";
import { computeVotes, type VoteStats } from "./votes";

/**
 * Every per-player stat module's result over one context's counted games, each module run once:
 * what the trophies and a player's numbers (`player.ts`) read through their `byPlayer` maps.
 * Pure: `now` is passed in.
 */
export interface AllStats {
  roles: RoleStats;
  cards: CardStats;
  votes: VoteStats;
  powers: PowerStats;
  rivals: RivalStats;
  records: RecordStats;
  timing: TimingStats;
}

/** Each module once, on `stats.counted`. */
export function allStats(stats: StatsContext, now: number): AllStats {
  const { counted } = stats;
  return {
    roles: computeRoles(counted),
    cards: computeCards(counted),
    votes: computeVotes(counted),
    powers: computePowers(counted),
    rivals: computeRivals(counted, stats.names),
    records: computeRecords(counted, stats.elo, now),
    timing: computeTiming(counted),
  };
}
