import { humanSeats, MIN_CHANCES, rate, type Rate } from "./counting";
import { sideOf, type GameRecord, type Role, type Side } from "./record";
import { rounds } from "./rounds";

/**
 * VOTES & POWERS' powers (the spec's "VOTES & POWERS"): each player's investigations, peeks and
 * special elections as president over the counted games, read from `rounds(record)` (a power is
 * `round.power`, used by its `seat`) and the seats, never the raw events. Keyed by player number:
 * a CPU seat gets no entry, though what it did to a person counts for that person.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

export interface PlayerPowers {
  games: number;
  /** Investigations they made as president. */
  investigations: number;
  /** Their results. */
  saw: Record<Side, number>;
  /** Target player → times; CPU targets left out. */
  investigatedPlayers: Map<number, number>;
  /** As LIBERAL: results FASCIST / investigations. */
  liberalFinds: Rate;
  /** Fascist side: targets on the Fascist side / investigations. */
  teammateChecks: Rate;
  /** Times investigated, by their role in that game. */
  timesInvestigated: Record<Role, number>;
  peeks: number;
  specialElections: number;
  /** Special elections whose target is on their side / special elections. */
  specialTeammate: Rate;
}

export interface PowerStats {
  byPlayer: Map<number, PlayerPowers>;
}

/** Hits of chances, on their way to a `Rate`. */
interface Count {
  hits: number;
  chances: number;
}

interface Tally {
  games: number;
  saw: Record<Side, number>;
  investigatedPlayers: Map<number, number>;
  liberalFinds: Count;
  teammateChecks: Count;
  timesInvestigated: Record<Role, number>;
  peeks: number;
  specialTeammate: Count;
}

const count = (): Count => ({ hits: 0, chances: 0 });

function newTally(): Tally {
  return {
    games: 0,
    saw: { LIBERAL: 0, FASCIST: 0 },
    investigatedPlayers: new Map(),
    liberalFinds: count(),
    teammateChecks: count(),
    timesInvestigated: { LIBERAL: 0, FASCIST: 0, HITLER: 0 },
    peeks: 0,
    specialTeammate: count(),
  };
}

/** One more chance, a hit when `hit`. */
function add(c: Count, hit: boolean): void {
  c.chances++;
  if (hit) c.hits++;
}

const toRate = (c: Count): Rate => rate(c.hits, c.chances, MIN_CHANCES);

/** Each player's presidential powers over `counted`, keyed by player number. */
export function computePowers(counted: GameRecord[]): PowerStats {
  const tallies = new Map<number, Tally>();
  for (const g of counted) {
    // The seat-to-player map for this game: people only.
    const playerAt = new Map<number, Tally>();
    const numberAt = new Map<number, number>();
    for (const { seat, player } of humanSeats(g)) {
      let tally = tallies.get(player);
      if (!tally) {
        tally = newTally();
        tallies.set(player, tally);
      }
      tally.games++;
      playerAt.set(seat, tally);
      numberAt.set(seat, player);
    }
    const role = (seat: number): Role | null => g.seats[seat]?.role ?? null;
    const side = (seat: number): Side | null => {
      const r = role(seat);
      return r === null ? null : sideOf(r);
    };

    for (const round of rounds(g)) {
      const power = round.power;
      if (power === null) continue;
      const user = playerAt.get(power.seat);
      const userSide = side(power.seat);
      switch (power.kind) {
        case "investigate": {
          const target = playerAt.get(power.target);
          const targetRole = role(power.target);
          if (target && targetRole !== null) target.timesInvestigated[targetRole]++;
          if (!user || userSide === null) break;
          user.saw[power.result]++;
          const targetNumber = numberAt.get(power.target);
          if (targetNumber !== undefined) {
            user.investigatedPlayers.set(targetNumber, (user.investigatedPlayers.get(targetNumber) ?? 0) + 1);
          }
          if (userSide === "LIBERAL") add(user.liberalFinds, power.result === "FASCIST");
          else add(user.teammateChecks, side(power.target) === "FASCIST");
          break;
        }
        case "peek":
          if (user) user.peeks++;
          break;
        case "specialElection":
          if (user && userSide !== null) add(user.specialTeammate, side(power.target) === userSide);
          break;
        default:
          break;
      }
    }
  }

  const byPlayer = new Map<number, PlayerPowers>();
  for (const [player, t] of tallies) {
    byPlayer.set(player, {
      games: t.games,
      investigations: t.saw.LIBERAL + t.saw.FASCIST,
      saw: t.saw,
      investigatedPlayers: t.investigatedPlayers,
      liberalFinds: toRate(t.liberalFinds),
      teammateChecks: toRate(t.teammateChecks),
      timesInvestigated: t.timesInvestigated,
      peeks: t.peeks,
      specialElections: t.specialTeammate.chances,
      specialTeammate: toRate(t.specialTeammate),
    });
  }
  return { byPlayer };
}
