import { describe, expect, it } from "vitest";
import { computeCards } from "./cards";
import { countedGames, MIN_CHANCES, rate } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { ev } from "./game/sampleGames";
import { parseStatsData, type Card, type GameEvent, type GameRecord, type Role } from "./record";
import { rounds } from "./rounds";
import { game, seatsOf } from "./testGames";

const T0 = Date.UTC(2026, 10, 1, 20, 0);
const ROLES: Role[] = ["LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "HITLER"];

/** One term: who governs, the president's three (as a string, "FFL"), and what follows. */
interface TermSpec {
  president: number;
  chancellor: number;
  hand: string;
  /** The president's discard, by index (0 unless given). */
  discard?: number;
  /** The chancellor's policy, else the first card handed on. */
  enact?: Card;
  veto?: "accepted" | "refused";
  /** After an accepted veto, the policy chaos enacts (none unless given). */
  chaos?: Card;
}

/**
 * A term's events in round `r`: the nomination and a passed election, the draw and discard, a
 * veto and its answer when asked, then an accepted veto's tracker move (to 3 and a chaos enact
 * with `chaos`, else to 1), or else the chancellor's enact; last END TERM by the president. Each
 * enact shows `board` after it, which it moves on.
 */
function term(r: number, t: number, spec: TermSpec, board: { liberal: number; fascist: number }): GameEvent[] {
  const { president, chancellor, hand } = spec;
  const index = spec.discard ?? 0;
  const handed = hand.split("").filter((_, i) => i !== index) as Card[];
  const enact = (policy: Card, by: "chancellor" | "chaos"): GameEvent => {
    if (policy === "L") board.liberal++;
    else board.fascist++;
    return ev.enact(r, t + 6, policy, by, by === "chancellor" ? chancellor : undefined, board.liberal, board.fascist);
  };
  const events: GameEvent[] = [
    ev.nominate(r, t, president, chancellor),
    ev.election(r, t + 1, true, 5, 0),
    ev.draw(r, t + 2, president, hand),
    ev.discard(r, t + 3, president, index, hand[index] as Card),
  ];
  if (spec.veto !== undefined) {
    events.push(ev.veto(r, t + 4, chancellor), ev.vetoAnswer(r, t + 5, president, spec.veto === "accepted"));
  }
  if (spec.veto === "accepted") {
    events.push(ev.tracker(r, t + 5, spec.chaos !== undefined ? 3 : 1));
    if (spec.chaos !== undefined) events.push(enact(spec.chaos, "chaos"));
  } else {
    events.push(enact(spec.enact ?? handed[0], "chancellor"));
  }
  events.push(ev.endTerm(r, t + 7, president, "president"));
  return events;
}

/**
 * Game `c<i>`, a Liberal win (whatever its board), of seats 0–4 holding players 1–5 as `ROLES`
 * unless `opts` says otherwise: its events are `before`, then the terms, numbered on from the last
 * round in `before` (else from 1), then an `end`; the final board is the terms' running board.
 */
function cardGame(
  i: number,
  terms: TermSpec[],
  opts: { roles?: Role[]; players?: (number | null)[]; complete?: boolean; before?: GameEvent[] } = {}
): GameRecord {
  const before = opts.before ?? [];
  const board = { liberal: 0, fascist: 0 };
  for (const e of before) {
    if (e.type === "enact") {
      board.liberal = e.liberal;
      board.fascist = e.fascist;
    }
  }
  const first = before.length > 0 ? before[before.length - 1].r + 1 : 1;
  const events: GameEvent[] = [...before];
  terms.forEach((spec, k) => events.push(...term(first + k, 1_000 * (k + 1), spec, board)));
  const last = first + terms.length - 1;
  events.push(ev.end(last, 1_000 * (terms.length + 1), "LIBERAL_POLICIES"));
  return game(`c${i}`, T0 + i * 3_600_000, seatsOf(opts.players ?? [1, 2, 3, 4, 5], opts.roles ?? ROLES), "LIBERAL", {
    events,
    complete: opts.complete ?? true,
    rounds: last,
    liberalPolicies: board.liberal,
    fascistPolicies: board.fascist,
  });
}

/** A term by `president` (a seat) with the next seat as chancellor. */
const by = (president: number, hand: string, discard?: number): TermSpec => ({
  president,
  chancellor: (president + 1) % 5,
  hand,
  discard,
});

describe("computeCards", () => {
  it("counts hands drawn by Liberals in any order, beside every hand in the counted games", () => {
    const counted = [
      cardGame(1, [by(0, "FFF"), by(0, "FLF"), by(0, "LLF"), by(3, "LLL"), by(3, "FFL")]),
      cardGame(2, [by(2, "FFF")], { players: [1, 2, null, 4, 5] }),
    ];
    const { byPlayer, hands } = computeCards(counted);
    expect(byPlayer.get(1)!.hands).toEqual([1, 1, 1, 0]);
    expect(byPlayer.get(4)!.hands).toEqual([0, 1, 0, 1]);
    expect(byPlayer.get(3)!.hands).toEqual([0, 0, 0, 0]);
    expect(hands).toEqual([2, 2, 1, 1]);
    expect(Array.from(byPlayer.keys()).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("Liberal accuracy: Liberal presidents' mixed hands, the share discarding a Fascist", () => {
    const counted = [
      cardGame(1, [
        by(0, "FFL", 0),
        by(0, "FLL", 0),
        by(0, "FLL", 1),
        by(0, "FFL", 1),
        by(0, "FFL", 0),
        by(0, "FFF"),
        by(0, "LLL"),
        by(3, "FFL", 0),
      ]),
    ];
    const { byPlayer } = computeCards(counted);
    expect(byPlayer.get(1)!.liberalAccuracy).toEqual(rate(4, 5, MIN_CHANCES));
    expect(byPlayer.get(1)!.liberalAccuracy.value).toBe(0.8);
    expect(byPlayer.get(4)!.liberalAccuracy).toEqual(rate(0, 0, MIN_CHANCES));
  });

  it("deep cover: Fascist and Hitler presidents' mixed hands", () => {
    const counted = [
      cardGame(1, [
        by(3, "FFL", 0),
        by(3, "FLL", 1),
        by(3, "FFL", 2),
        by(3, "FLL", 0),
        by(3, "FFL", 2),
        by(4, "FLL", 0),
        by(4, "FFL", 2),
      ]),
    ];
    const { byPlayer } = computeCards(counted);
    expect(byPlayer.get(4)!.deepCover).toEqual(rate(2, 5, MIN_CHANCES));
    expect(byPlayer.get(4)!.deepCover.value).toBe(0.4);
    expect(byPlayer.get(5)!.deepCover).toEqual({ hits: 1, chances: 2, value: null });
    expect(byPlayer.get(1)!.deepCover).toEqual(rate(0, 0, MIN_CHANCES));
  });

  it("skips a round with no hand", () => {
    const before = [ev.restored(3, 0), ev.discard(3, 100, 0, 0, "F"), ev.enact(3, 200, "L", "chancellor", 1, 1, 0)];
    const record = cardGame(1, [by(0, "FLL")], { complete: false, before });
    const { byPlayer, hands } = computeCards([record]);
    expect(byPlayer.get(1)!.hands).toEqual([0, 0, 1, 0]);
    expect(hands).toEqual([0, 0, 1, 0]);
  });

  it("agrees with the contract fixture", () => {
    const counted = countedGames(parseStatsData(fixture).games, { players: null, cpu: true });
    const { byPlayer, hands } = computeCards(counted);
    const drawn = counted.reduce((sum, record) => sum + rounds(record).filter((round) => round.hand !== null).length, 0);
    expect(drawn).toBeGreaterThan(0);
    expect(hands.reduce((a, b) => a + b, 0)).toBe(drawn);
    for (let i = 0; i < 4; i++) {
      const players = Array.from(byPlayer.values()).reduce((sum, p) => sum + p.hands[i], 0);
      expect(players, `hands[${i}]`).toBeLessThanOrEqual(hands[i]);
    }
  });
});
