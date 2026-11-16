import { computeCards, type CardStats, type PlayerCards } from "./cards";
import { computePowers, type PlayerPowers, type PowerStats } from "./powers";
import { computeRecords, type PlayerRecords, type RecordStats } from "./records";
import { computeRivals, type PlayerRivals, type RivalStats } from "./rivals";
import { computeRoles, type PlayerRoles, type RoleStats } from "./roles";
import { computeTiming, type PlayerTiming, type TimingStats } from "./timing";
import type { StatsContext } from "./useStats";
import { computeVotes, type PlayerVotes, type VoteStats } from "./votes";

/**
 * Every per-player stat module's result over one context's counted games, each module run once:
 * what the trophies and a player's numbers (`player.ts`) read through their `byPlayer` maps.
 * Pure: `now` and the time zone are passed in.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
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

/** Each module once, on `stats.counted`; RECORDS' periods in `timeZone` (the viewer's by default). */
export function allStats(stats: StatsContext, now: number, timeZone?: string): AllStats {
  const { counted } = stats;
  return {
    roles: computeRoles(counted),
    cards: computeCards(counted),
    votes: computeVotes(counted),
    powers: computePowers(counted),
    rivals: computeRivals(counted, stats.names),
    records: computeRecords(counted, stats.elo, now, timeZone),
    timing: computeTiming(counted),
  };
}

/** One player's entry in each module's `byPlayer`, undefined where a module has none for them. */
export interface PlayerSlice {
  roles?: PlayerRoles;
  cards?: PlayerCards;
  votes?: PlayerVotes;
  powers?: PlayerPowers;
  rivals?: PlayerRivals;
  records?: PlayerRecords;
  timing?: PlayerTiming;
}

/** `player`'s entries in `all`. */
export function playerSlice(all: AllStats, player: number): PlayerSlice {
  return {
    roles: all.roles.byPlayer.get(player),
    cards: all.cards.byPlayer.get(player),
    votes: all.votes.byPlayer.get(player),
    powers: all.powers.byPlayer.get(player),
    rivals: all.rivals.byPlayer.get(player),
    records: all.records.byPlayer.get(player),
    timing: all.timing.byPlayer.get(player),
  };
}
