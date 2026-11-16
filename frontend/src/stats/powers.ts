import { MIN_GAMES, type Rate } from "./counting";
import type { GameRecord, Role, Side } from "./record";
import { rounds } from "./rounds";
import { addChance, countRate, newCount, seatTallies, sideAt, type Count } from "./tallies";

/**
 * VOTES & POWERS' powers and survival (the spec's "VOTES & POWERS"): each player's
 * investigations, peeks, special elections, executions and veto answers as president, and whether
 * they were alive at the end, over the counted games, read from `rounds(record)` (a power is
 * `round.power`, used by its `seat`; a veto answer is `round.veto`, given by the president) and
 * the seats, never the raw events. Keyed by player number: a CPU seat gets no entry, though what
 * it did to a person counts for that person.
 *
 * A record that starts late (`complete: false`, after a restore with no timeline) may miss an
 * execution: a seat that ends dead with no recorded execution was executed before it started. It
 * counts as executed, by no one known, and as the game's first to go when it is the only such seat.
 *
 * This module imports nothing that reads the browser, so the browser tests can use it.
 */

/** A president's answers to their chancellors' vetoes. */
export interface VetoAnswers {
  accepted: number;
  refused: number;
}

export interface PlayerPowers {
  games: number;
  /** Investigations they made as president. */
  investigations: number;
  /** Their results. */
  saw: Record<Side, number>;
  /** Target player → times; CPU targets left out. */
  investigatedPlayers: Map<number, number>;
  /** Investigations of CPU seats, the rest of `investigations`. */
  investigatedCpu: number;
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
  executions: number;
  /** By the executioner's side: targets on the Fascist side / executions. */
  fascistTargets: Record<Side, Rate>;
  /** Executions whose target was HITLER. */
  hitlerExecuted: number;
  timesExecuted: number;
  /** Games whose first execution targeted them. */
  executedFirst: number;
  /** As president, answers to a chancellor's veto, by their role. */
  vetoes: Record<Role, VetoAnswers>;
  /** Games alive at the end / games (`MIN_GAMES`). */
  survival: Rate;
  survivalByRole: Record<Role, Rate>;
}

export interface PowerStats {
  byPlayer: Map<number, PlayerPowers>;
}

interface Tally {
  games: number;
  saw: Record<Side, number>;
  investigatedPlayers: Map<number, number>;
  investigatedCpu: number;
  liberalFinds: Count;
  teammateChecks: Count;
  timesInvestigated: Record<Role, number>;
  peeks: number;
  specialTeammate: Count;
  fascistTargets: Record<Side, Count>;
  hitlerExecuted: number;
  timesExecuted: number;
  executedFirst: number;
  vetoes: Record<Role, VetoAnswers>;
  survivalByRole: Record<Role, Count>;
}

const answers = (): VetoAnswers => ({ accepted: 0, refused: 0 });

function newTally(): Tally {
  return {
    games: 0,
    saw: { LIBERAL: 0, FASCIST: 0 },
    investigatedPlayers: new Map(),
    investigatedCpu: 0,
    liberalFinds: newCount(),
    teammateChecks: newCount(),
    timesInvestigated: { LIBERAL: 0, FASCIST: 0, HITLER: 0 },
    peeks: 0,
    specialTeammate: newCount(),
    fascistTargets: { LIBERAL: newCount(), FASCIST: newCount() },
    hitlerExecuted: 0,
    timesExecuted: 0,
    executedFirst: 0,
    vetoes: { LIBERAL: answers(), FASCIST: answers(), HITLER: answers() },
    survivalByRole: { LIBERAL: newCount(), FASCIST: newCount(), HITLER: newCount() },
  };
}

const gamesRate = (c: Count): Rate => countRate(c, MIN_GAMES);

/** Every role's games alive at the end, together. */
function alive(byRole: Record<Role, Count>): Count {
  return {
    hits: byRole.LIBERAL.hits + byRole.FASCIST.hits + byRole.HITLER.hits,
    chances: byRole.LIBERAL.chances + byRole.FASCIST.chances + byRole.HITLER.chances,
  };
}

/** Each player's presidential powers and survival over `counted`, keyed by player number. */
export function computePowers(counted: GameRecord[]): PowerStats {
  const tallies = new Map<number, Tally>();
  for (const g of counted) {
    // Each person's seat in this game, with their tally; a CPU seat has none.
    const seats = seatTallies(g, tallies, newTally);
    for (const [seat, { tally }] of seats) {
      const { role, alive } = g.seats[seat];
      addChance(tally.survivalByRole[role], alive);
    }
    const tallyAt = (seat: number) => seats.get(seat)?.tally;
    const role = (seat: number): Role | null => g.seats[seat]?.role ?? null;
    const side = (seat: number) => sideAt(g, seat);

    // Deaths before a late record's start: executions it does not hold.
    const rs = rounds(g);
    const executed = new Set<number>();
    for (const round of rs) if (round.power?.kind === "execute") executed.add(round.power.target);
    const unrecorded: number[] = [];
    if (!g.complete) {
      g.seats.forEach((seat, i) => {
        if (!seat.alive && !executed.has(i)) unrecorded.push(i);
      });
    }
    for (const seat of unrecorded) {
      const target = tallyAt(seat);
      if (target) {
        target.timesExecuted++;
        if (unrecorded.length === 1) target.executedFirst++;
      }
    }

    let executedYet = unrecorded.length > 0;
    for (const round of rs) {
      const president = tallyAt(round.president);
      const presidentRole = role(round.president);
      const answer = round.veto?.accepted;
      if (president && presidentRole !== null && answer !== undefined && answer !== null) {
        president.vetoes[presidentRole][answer ? "accepted" : "refused"]++;
      }

      const power = round.power;
      if (power === null) continue;
      const user = tallyAt(power.seat);
      const userSide = side(power.seat);
      switch (power.kind) {
        case "investigate": {
          const target = tallyAt(power.target);
          const targetRole = role(power.target);
          if (target && targetRole !== null) target.timesInvestigated[targetRole]++;
          if (!user || userSide === null) break;
          user.saw[power.result]++;
          const targetPlayer = seats.get(power.target)?.player;
          if (targetPlayer === undefined) user.investigatedCpu++;
          else user.investigatedPlayers.set(targetPlayer, (user.investigatedPlayers.get(targetPlayer) ?? 0) + 1);
          if (userSide === "LIBERAL") addChance(user.liberalFinds, power.result === "FASCIST");
          else addChance(user.teammateChecks, side(power.target) === "FASCIST");
          break;
        }
        case "peek":
          if (user) user.peeks++;
          break;
        case "specialElection":
          if (user && userSide !== null) addChance(user.specialTeammate, side(power.target) === userSide);
          break;
        case "execute": {
          const target = tallyAt(power.target);
          if (target) {
            target.timesExecuted++;
            if (!executedYet) target.executedFirst++;
          }
          executedYet = true;
          if (!user || userSide === null) break;
          addChance(user.fascistTargets[userSide], side(power.target) === "FASCIST");
          if (role(power.target) === "HITLER") user.hitlerExecuted++;
          break;
        }
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
      investigatedCpu: t.investigatedCpu,
      liberalFinds: countRate(t.liberalFinds),
      teammateChecks: countRate(t.teammateChecks),
      timesInvestigated: t.timesInvestigated,
      peeks: t.peeks,
      specialElections: t.specialTeammate.chances,
      specialTeammate: countRate(t.specialTeammate),
      executions: t.fascistTargets.LIBERAL.chances + t.fascistTargets.FASCIST.chances,
      fascistTargets: { LIBERAL: countRate(t.fascistTargets.LIBERAL), FASCIST: countRate(t.fascistTargets.FASCIST) },
      hitlerExecuted: t.hitlerExecuted,
      timesExecuted: t.timesExecuted,
      executedFirst: t.executedFirst,
      vetoes: t.vetoes,
      survival: gamesRate(alive(t.survivalByRole)),
      survivalByRole: {
        LIBERAL: gamesRate(t.survivalByRole.LIBERAL),
        FASCIST: gamesRate(t.survivalByRole.FASCIST),
        HITLER: gamesRate(t.survivalByRole.HITLER),
      },
    });
  }
  return { byPlayer };
}
