import { compareNames, humanSeats, MIN_GAMES, nameOf } from "./counting";
import { sideOf, type GameRecord } from "./record";
import { rounds } from "./rounds";

/**
 * RIVALS (the spec's "RIVALS"): who wins with and against whom. Every pair of people who shared a
 * counted game, their games on the same side and on opposite sides, the best duos and the closest
 * and most lopsided rivalries. People are human seats, by player number: a CPU seat is never
 * paired, though its game still counts for the humans in it. Also each player's people (who they
 * play with most, their best teammate, nemesis and favourite opponent, and their record against
 * everyone they met on opposite sides) and who nominated whom, from `rounds`. Pure: it reads only
 * its arguments, and gives the same result for the games in any order.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** Two players' counted games together (`a < b`, by player number). */
export interface Pair {
  a: number;
  b: number;
  /** Counted games both played, on any side. */
  shared: number;
  /** Games on the same side, and those their side won. */
  together: number;
  togetherWins: number;
  /** Games both on the Fascist side (Fascist or Hitler), and those the Fascists won. */
  fascistTogether: number;
  fascistTogetherWins: number;
  /** Games on opposite sides, and those `a` won (`b` won the rest). */
  opposed: number;
  aWins: number;
}

/** A pair with 5 or more games on opposite sides, and how far `a`'s share of the wins is from a half. */
export interface Rivalry {
  pair: Pair;
  closeness: number;
}

/** One player's people: Phase 22's player page reads these. */
export interface PlayerRivals {
  /** Everyone the player met on opposite sides, by name: their games so, and the player's wins and losses. */
  opponents: Map<number, { games: number; wins: number; losses: number }>;
  /** The most counted games together, on either side (`games`: shared); ties by name. */
  mostPlayedWith: { player: number; games: number } | null;
  /** The best win rate on the same side over 5 or more games so (`games`: together). */
  bestTeammate: { player: number; wins: number; games: number } | null;
  /** The most losses to one opponent, at least 1 (`games`: shared); ties by more shared, then name. */
  nemesis: { player: number; losses: number; games: number } | null;
  /** The most wins against one opponent, at least 1 (`games`: shared); the same ties. */
  favouriteOpponent: { player: number; wins: number; games: number } | null;
}

export interface RivalStats {
  /** Everyone in a counted game, by name. */
  players: number[];
  /** Every pair that shared a counted game, by `pairKey`, in the order of their names. */
  pairs: Map<string, Pair>;
  /** The best win rate together (`togetherWins / together`), over 5 or more games together. */
  bestDuo: Pair | null;
  /** The same, counting only games together on the Fascist side. */
  bestFascistDuo: Pair | null;
  /** Of pairs with 5 or more games on opposite sides, the most even and the most one-sided. */
  closest: Rivalry | null;
  mostLopsided: Rivalry | null;
  /**
   * How often each president nominated each chancellor, both human, passed or not: president to
   * chancellor to count, by name, with no zeros.
   */
  nominations: Map<number, Map<number, number>>;
  /** Every one of `players`' people. */
  byPlayer: Map<number, PlayerRivals>;
}

/** The key of the pair of `x` and `y`: `"<smaller>-<larger>"`. */
export function pairKey(x: number, y: number): string {
  return x < y ? `${x}-${y}` : `${y}-${x}`;
}

/** The pair of `x` and `y`, in either order, if they shared a counted game. */
export function pairOf(stats: RivalStats, x: number, y: number): Pair | undefined {
  return stats.pairs.get(pairKey(x, y));
}

/** `player`'s wins and losses against `opponent`, in their games on opposite sides. */
export function against(stats: RivalStats, player: number, opponent: number): { wins: number; losses: number } {
  const pair = player === opponent ? undefined : pairOf(stats, player, opponent);
  if (!pair) return { wins: 0, losses: 0 };
  const aWins = pair.aWins;
  const bWins = pair.opposed - pair.aWins;
  return player === pair.a ? { wins: aWins, losses: bWins } : { wins: bWins, losses: aWins };
}

/** The first of `items` by `compare` (negative: the first argument comes first), or null. */
function first<T>(items: T[], compare: (x: T, y: T) => number): T | null {
  let found: T | null = null;
  for (const item of items) if (found === null || compare(item, found) < 0) found = item;
  return found;
}

/**
 * Two shares `xHits / xOf` and `yHits / yOf` compared exactly, from whole numbers: negative when
 * the first is larger.
 */
function higherShare(xHits: number, xOf: number, yHits: number, yOf: number): number {
  return yHits * xOf - xHits * yOf;
}

/** The rivalries' closeness, `|2·aWins − opposed| / (2·opposed)`, as a fraction of whole numbers. */
function closenessOf(pair: Pair): { over: number; under: number } {
  return { over: Math.abs(2 * pair.aWins - pair.opposed), under: 2 * pair.opposed };
}

/** The pairs and picks of the counted games, with names from `names` (current names). */
export function computeRivals(counted: GameRecord[], names: Map<number, string>): RivalStats {
  const name = (player: number) => nameOf(names, player);
  const byName = (x: number, y: number) => compareNames(name(x), name(y)) || x - y;

  const found = new Map<string, Pair>();
  const people = new Set<number>();
  for (const record of counted) {
    const humans = humanSeats(record);
    for (const { player } of humans) people.add(player);
    for (let i = 0; i < humans.length; i++) {
      for (let j = i + 1; j < humans.length; j++) {
        const [x, y] = humans[i].player < humans[j].player ? [humans[i], humans[j]] : [humans[j], humans[i]];
        if (x.player === y.player) continue;
        const key = pairKey(x.player, y.player);
        let pair = found.get(key);
        if (!pair) {
          pair = {
            a: x.player,
            b: y.player,
            shared: 0,
            together: 0,
            togetherWins: 0,
            fascistTogether: 0,
            fascistTogetherWins: 0,
            opposed: 0,
            aWins: 0,
          };
          found.set(key, pair);
        }
        const side = sideOf(record.seats[x.seat].role);
        pair.shared++;
        if (side === sideOf(record.seats[y.seat].role)) {
          const won = side === record.winner;
          pair.together++;
          if (won) pair.togetherWins++;
          if (side === "FASCIST") {
            pair.fascistTogether++;
            if (won) pair.fascistTogetherWins++;
          }
        } else {
          pair.opposed++;
          if (side === record.winner) pair.aWins++;
        }
      }
    }
  }

  const players = Array.from(people).sort(byName);
  /** A pair's two names, in alphabetical order. */
  const namesOf = (pair: Pair) => (byName(pair.a, pair.b) <= 0 ? [pair.a, pair.b] : [pair.b, pair.a]);
  const byPairName = (p: Pair, q: Pair) => {
    const [p1, p2] = namesOf(p);
    const [q1, q2] = namesOf(q);
    return byName(p1, q1) || byName(p2, q2);
  };
  const list = Array.from(found.values()).sort(byPairName);
  const pairs = new Map(list.map((pair) => [pairKey(pair.a, pair.b), pair]));

  const bestDuo = first(
    list.filter((p) => p.together >= MIN_GAMES),
    (p, q) =>
      higherShare(p.togetherWins, p.together, q.togetherWins, q.together) || q.together - p.together || byPairName(p, q)
  );
  const bestFascistDuo = first(
    list.filter((p) => p.fascistTogether >= MIN_GAMES),
    (p, q) =>
      higherShare(p.fascistTogetherWins, p.fascistTogether, q.fascistTogetherWins, q.fascistTogether) ||
      q.fascistTogether - p.fascistTogether ||
      byPairName(p, q)
  );

  const rivals = list.filter((p) => p.opposed >= MIN_GAMES);
  /** Negative when `p` is closer (smaller) than `q`. */
  const closer = (p: Pair, q: Pair) => {
    const x = closenessOf(p);
    const y = closenessOf(q);
    return x.over * y.under - y.over * x.under;
  };
  const rivalry = (pair: Pair | null): Rivalry | null => {
    if (!pair) return null;
    const { over, under } = closenessOf(pair);
    return { pair, closeness: over / under };
  };
  const closest = rivalry(first(rivals, (p, q) => closer(p, q) || q.opposed - p.opposed || byPairName(p, q)));
  const mostLopsided = rivalry(first(rivals, (p, q) => closer(q, p) || q.opposed - p.opposed || byPairName(p, q)));

  const byPlayer = new Map<number, PlayerRivals>();
  for (const player of players) {
    /** The player's pairs, each with the other player and the player's wins and losses against them. */
    const met = list
      .filter((p) => p.a === player || p.b === player)
      .map((pair) => {
        const other = pair.a === player ? pair.b : pair.a;
        const wins = pair.a === player ? pair.aWins : pair.opposed - pair.aWins;
        return { pair, other, wins, losses: pair.opposed - wins };
      })
      .sort((x, y) => byName(x.other, y.other));
    type Met = (typeof met)[number];
    const most = (count: (m: Met) => number) =>
      first(
        met.filter((m) => count(m) > 0),
        (x, y) => count(y) - count(x) || y.pair.shared - x.pair.shared || byName(x.other, y.other)
      );

    const opponents = new Map<number, { games: number; wins: number; losses: number }>();
    for (const m of met) {
      if (m.pair.opposed > 0) opponents.set(m.other, { games: m.pair.opposed, wins: m.wins, losses: m.losses });
    }
    const mostPlayed = first(met, (x, y) => y.pair.shared - x.pair.shared || byName(x.other, y.other));
    const teammate = first(
      met.filter((m) => m.pair.together >= MIN_GAMES),
      (x, y) =>
        higherShare(x.pair.togetherWins, x.pair.together, y.pair.togetherWins, y.pair.together) ||
        y.pair.together - x.pair.together ||
        byName(x.other, y.other)
    );
    const nemesis = most((m) => m.losses);
    const favourite = most((m) => m.wins);
    byPlayer.set(player, {
      opponents,
      mostPlayedWith: mostPlayed && { player: mostPlayed.other, games: mostPlayed.pair.shared },
      bestTeammate: teammate && { player: teammate.other, wins: teammate.pair.togetherWins, games: teammate.pair.together },
      nemesis: nemesis && { player: nemesis.other, losses: nemesis.losses, games: nemesis.pair.shared },
      favouriteOpponent: favourite && { player: favourite.other, wins: favourite.wins, games: favourite.pair.shared },
    });
  }

  const nominations = nominationsOf(counted, byName);
  return { players, pairs, bestDuo, bestFascistDuo, closest, mostLopsided, nominations, byPlayer };
}

/**
 * Every round's nomination in the counted games whose president and chancellor are both human,
 * passed or not: president to chancellor to count, both by `byName`.
 */
function nominationsOf(counted: GameRecord[], byName: (x: number, y: number) => number): Map<number, Map<number, number>> {
  const counts = new Map<number, Map<number, number>>();
  for (const record of counted) {
    const playerAt = (seat: number | null) => {
      const s = seat === null ? undefined : record.seats[seat];
      return s && !s.cpu && s.player !== null ? s.player : null;
    };
    for (const round of rounds(record)) {
      const president = playerAt(round.president);
      const chancellor = playerAt(round.chancellor);
      if (president === null || chancellor === null || president === chancellor) continue;
      let row = counts.get(president);
      if (!row) {
        row = new Map();
        counts.set(president, row);
      }
      row.set(chancellor, (row.get(chancellor) ?? 0) + 1);
    }
  }
  const sorted = new Map<number, Map<number, number>>();
  for (const president of Array.from(counts.keys()).sort(byName)) {
    const row = counts.get(president)!;
    sorted.set(president, new Map(Array.from(row.keys()).sort(byName).map((c) => [c, row.get(c)!])));
  }
  return sorted;
}
