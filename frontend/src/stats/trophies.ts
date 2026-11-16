import { allStats, type AllStats } from "./allStats";
import { compareNames, humanSeats, nameOf, rate, type Rate } from "./counting";
import { ELO_START } from "./elo";
import { fastestVoter } from "./timing";
import type { StatsContext } from "./useStats";

/**
 * The trophies (the spec's "Trophies"): fifteen titles worked out from the counted games on every
 * load, never stored. Each player's facts are gathered from the earlier stat modules, and the
 * rules below award the titles from those facts. Unless a rule says otherwise, a player needs
 * `TROPHY_MIN_GAMES` counted games for any trophy. Pure.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

export type TrophyId =
  | "regular"
  | "everPresent"
  | "onFire"
  | "onTheRise"
  | "elite"
  | "dominantRivalry"
  | "familiarFoe"
  | "hitlerHunter"
  | "chancellorHitler"
  | "deepCover"
  | "honestBroker"
  | "cursedHands"
  | "sharpEye"
  | "survivor"
  | "speedDemon";

/** A trophy: its label and its rule, word for word the spec's table. */
export interface Trophy {
  id: TrophyId;
  label: string;
  rule: string;
}

/** Every trophy, in the spec's order. */
export const TROPHIES: readonly Trophy[] = Object.freeze([
  { id: "regular", label: "Regular", rule: "At least 20 counted games" },
  {
    id: "everPresent",
    label: "Ever-Present",
    rule: "In at least half of all counted games (with the usual 8 of their own)",
  },
  { id: "onFire", label: "On Fire", rule: "A win streak of 3 or more, ever" },
  { id: "onTheRise", label: "On the Rise", rule: "Elo at least 1550, not provisional" },
  { id: "elite", label: "Elite", rule: "Elo at least 1600, not provisional" },
  {
    id: "dominantRivalry",
    label: "Dominant Rivalry",
    rule: "At least 5 more wins than losses against one opponent, over 8 or more games on opposite sides",
  },
  { id: "familiarFoe", label: "Familiar Foe", rule: "At least 10 games on opposite sides with one player" },
  { id: "hitlerHunter", label: "Hitler Hunter", rule: "Executed Hitler at least once (no minimum)" },
  { id: "chancellorHitler", label: "Chancellor Hitler", rule: "Won as Hitler by being elected chancellor (no minimum)" },
  {
    id: "deepCover",
    label: "Deep Cover",
    rule: "As a Fascist (not Hitler) chancellor given one of each, enacted the Liberal at least half the time, over 4 or more chances",
  },
  { id: "honestBroker", label: "Honest Broker", rule: "Liberal accuracy of 100% over 10 or more mixed hands" },
  { id: "cursedHands", label: "Cursed Hands", rule: "Drew FFF at least 3 times as a Liberal president" },
  {
    id: "sharpEye",
    label: "Sharp Eye",
    rule: "Liberal vote accuracy of at least 75% over 30 or more votes as a Liberal",
  },
  { id: "survivor", label: "Survivor", rule: "Alive at the end of at least 90% of 10 or more games" },
  {
    id: "speedDemon",
    label: "Speed Demon",
    rule: "The fastest average vote of everyone with 30 or more timed votes (one holder; ties go to more votes, then the name)",
  },
] as Trophy[]);

/** The counted games a player needs for any trophy whose rule does not lift it. */
export const TROPHY_MIN_GAMES = 8;

/** What the rules read about one player, over the counted games. */
export interface TrophyFacts {
  /** Counted games played. */
  games: number;
  /** Their Elo, unrounded, and whether it is still provisional. */
  rating: number;
  provisional: boolean;
  /** Their longest run of wins. */
  longestWinStreak: number;
  /** One per player they met on opposite sides: their games so, and their wins and losses. */
  opponents: { games: number; wins: number; losses: number }[];
  /** Executions of Hitler they made as president. */
  hitlerExecutions: number;
  /** Games won as Hitler elected chancellor. */
  wonAsElectedHitler: number;
  /** As a FASCIST (not HITLER) chancellor handed one of each: the Liberal enacted. */
  fascistGivenOneOfEach: Rate;
  /** As a Liberal president holding both kinds: a Fascist discarded. */
  liberalAccuracy: Rate;
  /** FFF hands drawn as a Liberal president. */
  fffAsLiberalPresident: number;
  /** As a Liberal: right votes of their votes. */
  liberalVoteAccuracy: Rate;
  /** Games alive at the end of their games. */
  survival: Rate;
}

/** Each trophy's rule but Speed Demon's, which Phase 21A's `fastestVoter` has already applied. */
const RULES: Record<Exclude<TrophyId, "speedDemon">, (f: TrophyFacts, totalGames: number) => boolean> = {
  regular: (f) => f.games >= 20,
  everPresent: (f, total) => 2 * f.games >= total,
  onFire: (f) => f.longestWinStreak >= 3,
  onTheRise: (f) => !f.provisional && Math.round(f.rating) >= 1550,
  elite: (f) => !f.provisional && Math.round(f.rating) >= 1600,
  dominantRivalry: (f) => f.opponents.some((o) => o.games >= 8 && o.wins - o.losses >= 5),
  familiarFoe: (f) => f.opponents.some((o) => o.games >= 10),
  hitlerHunter: (f) => f.hitlerExecutions >= 1,
  chancellorHitler: (f) => f.wonAsElectedHitler >= 1,
  deepCover: ({ fascistGivenOneOfEach: r }) => r.chances >= 4 && r.hits * 2 >= r.chances,
  honestBroker: ({ liberalAccuracy: r }) => r.chances >= 10 && r.hits === r.chances,
  cursedHands: (f) => f.fffAsLiberalPresident >= 3,
  sharpEye: ({ liberalVoteAccuracy: r }) => r.chances >= 30 && r.hits * 4 >= r.chances * 3,
  survivor: ({ survival: r }) => r.chances >= 10 && r.hits * 10 >= r.chances * 9,
};

/** The trophies whose rules lift the minimum of counted games. */
const NO_MINIMUM = new Set<TrophyId>(["hitlerHunter", "chancellorHitler", "speedDemon"]);

/**
 * Every player's trophies, in `TROPHIES`' order: each key of `facts` gets a list, `[]` when they
 * hold none. `totalGames` is every counted game (Ever-Present's half); `speedDemon` the one
 * holder of the fastest-voter rule, or null, which takes the trophy only with facts of its own.
 */
export function awardTrophies(
  facts: Map<number, TrophyFacts>,
  totalGames: number,
  speedDemon: number | null
): Map<number, Trophy[]> {
  const out = new Map<number, Trophy[]>();
  facts.forEach((f, player) => {
    out.set(
      player,
      TROPHIES.filter((trophy) => {
        if (trophy.id === "speedDemon") return player === speedDemon;
        if (!NO_MINIMUM.has(trophy.id) && f.games < TROPHY_MIN_GAMES) return false;
        return RULES[trophy.id](f, totalGames);
      })
    );
  });
  return out;
}

/** Every trophy in `TROPHIES`' order with its holders, by name (then number); none is `[]`. */
export function trophyHolders(
  trophies: Map<number, Trophy[]>,
  names: Map<number, string>
): { trophy: Trophy; players: number[] }[] {
  const byName = (a: number, b: number) => compareNames(nameOf(names, a), nameOf(names, b)) || a - b;
  return TROPHIES.map((trophy) => {
    const players: number[] = [];
    trophies.forEach((held, player) => {
      if (held.some((t) => t.id === trophy.id)) players.push(player);
    });
    return { trophy, players: players.sort(byName) };
  });
}

/** No chances yet. */
const NONE: Rate = rate(0, 0);

/**
 * Every player with a counted game's facts, from `all` (each module's `byPlayer`) and the counted
 * games themselves, where no module counts the fact (a win as Hitler elected chancellor).
 */
export function trophyFacts(stats: StatsContext, all: AllStats): Map<number, TrophyFacts> {
  const electedHitlerWins = new Map<number, number>();
  const players: number[] = [];
  const seen = new Set<number>();
  for (const record of stats.counted) {
    for (const { seat, player } of humanSeats(record)) {
      if (!seen.has(player)) {
        seen.add(player);
        players.push(player);
      }
      if (record.outcome === "HITLER_ELECTED" && record.seats[seat].role === "HITLER") {
        electedHitlerWins.set(player, (electedHitlerWins.get(player) ?? 0) + 1);
      }
    }
  }

  const out = new Map<number, TrophyFacts>();
  for (const player of players) {
    const roles = all.roles.byPlayer.get(player);
    const cards = all.cards.byPlayer.get(player);
    const votes = all.votes.byPlayer.get(player);
    const powers = all.powers.byPlayer.get(player);
    const rivals = all.rivals.byPlayer.get(player);
    const records = all.records.byPlayer.get(player);
    const rating = stats.elo.ratings.get(player);
    out.set(player, {
      games: roles?.games ?? 0,
      rating: rating?.rating ?? ELO_START,
      provisional: rating?.provisional ?? true,
      longestWinStreak: records?.longestWin?.length ?? 0,
      opponents: rivals ? Array.from(rivals.opponents.values()) : [],
      hitlerExecutions: powers?.hitlerExecuted ?? 0,
      wonAsElectedHitler: electedHitlerWins.get(player) ?? 0,
      fascistGivenOneOfEach: cards?.oneOfEach.FASCIST ?? NONE,
      liberalAccuracy: cards?.liberalAccuracy ?? NONE,
      fffAsLiberalPresident: cards?.forced.president ?? 0,
      liberalVoteAccuracy: votes?.liberalAccuracy ?? NONE,
      survival: powers?.survival ?? NONE,
    });
  }
  return out;
}

/** The Speed Demon: ACTIVITY's fastest voter (`fastestVoter`), the one holder of that rule, or null. */
export function speedDemonOf(all: AllStats, names: Map<number, string>): number | null {
  return fastestVoter(all.timing, names);
}

/** Every player with a counted game's trophies under `stats`' filter, seen at `now`. */
export function computeTrophies(stats: StatsContext, now: number): Map<number, Trophy[]> {
  const all = allStats(stats, now);
  return awardTrophies(trophyFacts(stats, all), stats.counted.length, speedDemonOf(all, stats.names));
}
