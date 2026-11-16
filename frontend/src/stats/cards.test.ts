import { describe, expect, it } from "vitest";
import { computeCards } from "./cards";
import { countedGames, DEFAULT_FILTER, MIN_CHANCES, rate } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { ev } from "./game/sampleGames";
import { parseStatsData, type Card, type GameEvent, type GameRecord, type Role } from "./record";
import { computeRoles } from "./roles";
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

  /** A term of player 1 (seat 0) drawing FFL and discarding a Fascist, so `chancellor` holds F and L. */
  const toChancellor = (chancellor: number, more: Partial<TermSpec> = {}): TermSpec => ({
    president: 0,
    chancellor,
    hand: "FFL",
    discard: 0,
    ...more,
  });

  it("given one of each: accepted vetoes left out, refused ones counted", () => {
    const counted = [
      cardGame(1, [
        toChancellor(1, { enact: "L" }),
        toChancellor(1, { enact: "F" }),
        toChancellor(1, { veto: "accepted" }),
        toChancellor(1, { veto: "refused", enact: "L" }),
        toChancellor(1, { veto: "accepted", chaos: "F" }),
        toChancellor(1, { enact: "L" }),
        toChancellor(1, { enact: "L" }),
        toChancellor(1, { hand: "FFF", enact: "F" }),
        toChancellor(1, { hand: "FLL", enact: "L" }),
        toChancellor(3, { enact: "F" }),
        toChancellor(3, { enact: "F" }),
        toChancellor(3, { enact: "L" }),
        toChancellor(3, { enact: "F" }),
        toChancellor(3, { enact: "F" }),
        toChancellor(4, { enact: "L" }),
      ]),
    ];
    const { byPlayer } = computeCards(counted);
    expect(byPlayer.get(2)!.oneOfEach.LIBERAL).toEqual(rate(4, 5, MIN_CHANCES));
    expect(byPlayer.get(4)!.oneOfEach.FASCIST).toEqual(rate(1, 5, MIN_CHANCES));
    expect(byPlayer.get(4)!.oneOfEach.FASCIST.value).toBe(0.2);
    expect(byPlayer.get(5)!.oneOfEach.HITLER).toEqual({ hits: 1, chances: 1, value: null });
  });

  it("counts policies enacted as chancellor by kind and role; chaos is no one's", () => {
    const from2 = (enact: Card, more: Partial<TermSpec> = {}): TermSpec => ({
      president: 1,
      chancellor: 0,
      hand: "FFL",
      discard: 0,
      enact,
      ...more,
    });
    const counted = [
      cardGame(1, [
        from2("L"),
        from2("L"),
        from2("F"),
        { president: 1, chancellor: 3, hand: "FFL", enact: "F" },
        from2("L", { veto: "accepted", chaos: "L" }),
      ]),
      cardGame(2, [from2("F")], { roles: ["HITLER", "LIBERAL", "LIBERAL", "LIBERAL", "FASCIST"] }),
    ];
    const { byPlayer } = computeCards(counted);
    expect(byPlayer.get(1)!.enacted).toEqual({ LIBERAL: { L: 2, F: 1 }, FASCIST: { L: 0, F: 0 }, HITLER: { L: 0, F: 1 } });
    expect(byPlayer.get(4)!.enacted.FASCIST).toEqual({ L: 0, F: 1 });
  });

  it("counts vetoes asked for by the two cards behind each", () => {
    const from2 = (hand: string, more: Partial<TermSpec>): TermSpec => ({ president: 1, chancellor: 0, hand, discard: 0, ...more });
    const counted = [
      cardGame(1, [
        from2("FFF", { veto: "accepted" }),
        from2("FFL", { veto: "refused", enact: "L" }),
        from2("FFF", { veto: "refused", enact: "F" }),
      ]),
      cardGame(2, [{ president: 0, chancellor: 2, hand: "FFF", veto: "accepted" }], { players: [1, 2, null, 4, 5] }),
    ];
    const { byPlayer } = computeCards(counted);
    expect(byPlayer.get(1)!.vetoes).toEqual([2, 1, 0]);
    expect(Array.from(byPlayer.keys()).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect([2, 3, 4, 5].map((p) => byPlayer.get(p)!.vetoes)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("Fascist choices follow each round's blame", () => {
    const counted = [
      cardGame(1, [
        { president: 0, chancellor: 3, hand: "FFL", discard: 2, enact: "F" },
        { president: 1, chancellor: 3, hand: "FFL", discard: 0, enact: "F" },
        { president: 1, chancellor: 3, hand: "FFF", enact: "F" },
        { president: 0, chancellor: 4, hand: "FLL", discard: 1, enact: "F" },
        { president: 0, chancellor: 1, hand: "FLL", discard: 0, enact: "L" },
      ]),
    ];
    const { byPlayer } = computeCards(counted);
    expect([1, 2, 4, 5].map((p) => byPlayer.get(p)!.fascistChoices)).toEqual([1, 0, 1, 1]);
  });

  it("forced Fascists: FFF for Liberal presidents, FF handed to Liberal chancellors", () => {
    const counted = [
      cardGame(1, [
        { president: 0, chancellor: 1, hand: "FFF" },
        { president: 0, chancellor: 2, hand: "FFL", discard: 2 },
        { president: 3, chancellor: 1, hand: "FFF", veto: "accepted" },
        { president: 1, chancellor: 3, hand: "FFF" },
        { president: 0, chancellor: 1, hand: "FFL", discard: 0 },
      ]),
    ];
    const { byPlayer } = computeCards(counted);
    expect([1, 2, 3, 4].map((p) => byPlayer.get(p)!.forced)).toEqual([
      { president: 1, chancellor: 0 },
      { president: 1, chancellor: 2 },
      { president: 0, chancellor: 1 },
      { president: 0, chancellor: 0 },
    ]);
  });

  it("agrees with the contract fixture on policies and blame", () => {
    const counted = countedGames(parseStatsData(fixture).games, DEFAULT_FILTER);
    const { byPlayer } = computeCards(counted);
    const players = Array.from(byPlayer.values());
    const enacted = players.reduce(
      (sum, p) => sum + p.enacted.LIBERAL.L + p.enacted.LIBERAL.F + p.enacted.FASCIST.L + p.enacted.FASCIST.F + p.enacted.HITLER.L + p.enacted.HITLER.F,
      0
    );
    const all = counted.map(rounds);
    const chaos = all.reduce((sum, rs) => sum + rs.filter((r) => r.enacted?.by === "chaos").length, 0);
    expect(enacted + chaos).toBe(counted.reduce((sum, g) => sum + g.liberalPolicies + g.fascistPolicies, 0));
    const blamed = all.reduce((sum, rs) => sum + rs.filter((r) => r.blame !== null).length, 0);
    expect(blamed).toBeGreaterThan(0);
    expect(players.reduce((sum, p) => sum + p.fascistChoices, 0)).toBe(blamed);
  });

  it("computes 1,000 games in well under a second", () => {
    const games = parseStatsData(fixture).games;
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...games[i % games.length], id: `x${i}` }));
    const start = performance.now();
    computeRoles(many);
    computeCards(many);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
