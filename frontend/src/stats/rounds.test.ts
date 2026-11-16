import { describe, expect, it } from "vitest";
import fixture from "./fixtures/recorded-games.json";
import { ev, fiveSeatGame } from "./game/sampleGames";
import { parseStatsData, type Card, type GameEvent, type GameRecord } from "./record";
import { formatDecisionTime, rounds } from "./rounds";
import { makeRecord } from "./testRecords";

// fiveSeatGame's seats: P1, P2, P3 (Fascist), P4 (Hitler) and the CPU Bot 1.
const [A, B, C, D, BOT] = [0, 1, 2, 3, 4];

const PASSED_TERM = fiveSeatGame([
  ev.nominate(1, 4_000, A, B),
  ev.vote(1, 5_000, B, true), ev.vote(1, 6_000, A, true), ev.vote(1, 6_000, BOT, false),
  ev.vote(1, 7_000, C, true), ev.vote(1, 9_000, D, false),
  ev.election(1, 9_000, true, 3, 2),
  ev.draw(1, 9_000, A, "LFF"), ev.discard(1, 12_000, A, 1, "F"),
  ev.enact(1, 15_000, "L", "chancellor", B, 1, 0),
  ev.endTerm(1, 18_000, A, "president"),
]);

/** A passed election from `t`: the nomination, five votes, three Ja. */
function passed(r: number, t: number, president: number, chancellor: number): GameEvent[] {
  return [
    ev.nominate(r, t, president, chancellor),
    ...[A, B, C, D, BOT].map((seat, i) => ev.vote(r, t + 1_000 + i * 100, seat, i < 3)),
    ev.election(r, t + 2_000, true, 3, 2),
  ];
}

/** A failed election from `t`, the tracker moving to `tracker`. */
function failed(r: number, t: number, president: number, chancellor: number, tracker: number): GameEvent[] {
  return [
    ev.nominate(r, t, president, chancellor),
    ...[A, B, C, D, BOT].map((seat, i) => ev.vote(r, t + 1_000 + i * 100, seat, i < 2)),
    ev.election(r, t + 2_000, false, 2, 3),
    ev.tracker(r, t + 2_000, tracker),
  ];
}

/**
 * A whole passed term from `t`: `hand` drawn, the card at `index` discarded, `policy` enacted by
 * the chancellor (the board after it `board`), then `extra` and the president's END TERM.
 */
function term(
  r: number,
  t: number,
  president: number,
  chancellor: number,
  hand: string,
  index: number,
  policy: Card,
  board: [number, number],
  extra: GameEvent[] = []
): GameEvent[] {
  return [
    ...passed(r, t, president, chancellor),
    ev.draw(r, t + 2_000, president, hand),
    ev.discard(r, t + 5_000, president, index, hand[index] as Card),
    ev.enact(r, t + 8_000, policy, "chancellor", chancellor, board[0], board[1]),
    ...extra,
    ev.endTerm(r, t + 20_000, president, "president"),
  ];
}

describe("rounds", () => {
  it("reads a passed election's term", () => {
    expect(rounds(PASSED_TERM)).toHaveLength(1);
    expect(rounds(PASSED_TERM)[0]).toMatchObject({
      r: 1, president: A, chancellor: B,
      votes: [{ seat: B, ja: true }, { seat: A, ja: true }, { seat: BOT, ja: false },
        { seat: C, ja: true }, { seat: D, ja: false }],
      election: { passed: true, ja: 3, nein: 2 }, trackerAfter: null,
      hand: ["L", "F", "F"], discard: { index: 1, card: "F" }, chancellorHand: ["L", "F"],
      veto: null, enacted: { policy: "L", by: "chancellor" }, power: null,
      endTerm: { by: "president" }, pauses: 0, reshuffled: false, disconnects: [],
    });
  });

  it("a failed election moves the tracker and the countdown ends the term", () => {
    const [round] = rounds(
      fiveSeatGame([
        ...failed(1, 4_000, A, B, 1),
        ev.timerPause(1, 8_000, A), ev.timerResume(1, 10_000, A), ev.timerPause(1, 11_000, A),
        ev.endTerm(1, 21_000, A, "countdown"),
      ])
    );
    expect(round).toMatchObject({
      election: { passed: false, ja: 2, nein: 3 }, trackerAfter: 1, hand: null, enacted: null,
      endTerm: { by: "countdown" }, pauses: 2,
    });
  });

  it("chaos belongs to the failed election's round", () => {
    const rs = rounds(
      fiveSeatGame([
        ...failed(1, 4_000, A, B, 1), ev.endTerm(1, 10_000, A, "president"),
        ...failed(2, 14_000, B, C, 2), ev.endTerm(2, 20_000, B, "president"),
        ...failed(3, 24_000, C, D, 3),
        ev.enact(3, 26_000, "F", "chaos", undefined, 0, 1),
        ev.reshuffle(3, 26_000, 14),
        ev.endTerm(3, 30_000, C, "president"),
        ...passed(4, 34_000, D, A),
      ])
    );
    expect(rs.map((x) => x.r)).toEqual([1, 2, 3, 4]);
    expect(rs[2]).toMatchObject({
      trackerAfter: 3, enacted: { policy: "F", by: "chaos" }, reshuffled: true, chancellor: D,
    });
    expect(rs[3].enacted).toBeNull();
  });

  it("a refused veto, then the chancellor's enact", () => {
    const [round] = rounds(
      fiveSeatGame([
        ...passed(1, 4_000, A, B),
        ev.draw(1, 6_000, A, "LFF"), ev.discard(1, 8_000, A, 0, "L"),
        ev.veto(1, 10_000, B), ev.vetoAnswer(1, 13_000, A, false),
        ev.enact(1, 16_000, "F", "chancellor", B, 0, 6),
      ])
    );
    expect(round).toMatchObject({
      chancellorHand: ["F", "F"], veto: { accepted: false }, enacted: { policy: "F", by: "chancellor" },
    });
  });

  it("an accepted veto moves the tracker", () => {
    const vetoed = (after: GameEvent[]) =>
      rounds(
        fiveSeatGame([
          ...passed(1, 4_000, A, B),
          ev.draw(1, 6_000, A, "LFF"), ev.discard(1, 8_000, A, 0, "L"),
          ev.veto(1, 10_000, B), ev.vetoAnswer(1, 13_000, A, true),
          ...after,
        ])
      )[0];
    expect(vetoed([ev.tracker(1, 13_000, 2), ev.endTerm(1, 16_000, A, "president")])).toMatchObject({
      veto: { accepted: true }, trackerAfter: 2, enacted: null,
    });
    expect(
      vetoed([
        ev.tracker(1, 13_000, 3),
        ev.enact(1, 13_000, "F", "chaos", undefined, 1, 5),
        ev.endTerm(1, 16_000, A, "president"),
      ])
    ).toMatchObject({ veto: { accepted: true }, trackerAfter: 3, enacted: { policy: "F", by: "chaos" } });
  });

  it("reads each power", () => {
    const rs = rounds(
      fiveSeatGame([
        ...term(1, 0, A, B, "FFF", 0, "F", [0, 1], [ev.peek(1, 12_000, A, "FLF")]),
        ...term(2, 30_000, B, C, "FFL", 2, "F", [0, 2], [ev.investigate(2, 42_000, B, C, "FASCIST")]),
        ...term(3, 60_000, C, D, "FFL", 2, "F", [0, 3], [ev.execute(3, 72_000, C, B, "LIBERAL")]),
        ...term(4, 90_000, D, A, "FFL", 2, "F", [0, 4], [ev.specialElection(4, 102_000, D, A)]),
      ])
    );
    expect(rs.map((x) => x.power)).toEqual([
      { kind: "peek", seat: A, cards: ["F", "L", "F"] },
      { kind: "investigate", seat: B, target: C, result: "FASCIST" },
      { kind: "execute", seat: C, target: B, role: "LIBERAL" },
      { kind: "specialElection", seat: D, target: A },
    ]);
  });

  it("keeps every drop and the reshuffle", () => {
    const rs = rounds(
      fiveSeatGame([
        ...passed(1, 4_000, A, B),
        ev.disconnect(1, 7_000, C), ev.disconnect(1, 8_000, A), ev.reconnect(1, 9_000, A),
        ev.disconnect(1, 10_000, C),
        ev.draw(1, 11_000, A, "LFF"), ev.discard(1, 12_000, A, 1, "F"),
        ev.enact(1, 15_000, "L", "chancellor", B, 1, 0),
        ev.reshuffle(1, 15_000, 15),
        ev.endTerm(1, 18_000, A, "president"),
      ])
    );
    expect(rs[0]).toMatchObject({ disconnects: [C, A, C], reshuffled: true });
    expect(rounds(PASSED_TERM)[0].reshuffled).toBe(false);
  });

  it("two equal cards", () => {
    for (const index of [0, 1]) {
      const [round] = rounds(
        fiveSeatGame([
          ...passed(1, 4_000, A, B),
          ev.draw(1, 6_000, A, "FFL"), ev.discard(1, 8_000, A, index, "F"),
          ev.enact(1, 12_000, "L", "chancellor", B, 1, 0),
        ])
      );
      expect(round.chancellorHand, `discard index ${index}`).toEqual(["F", "L"]);
    }
  });

  it("Hitler elected ends the round at its election", () => {
    const [round] = rounds(
      fiveSeatGame([...passed(1, 4_000, A, D), ev.end(1, 7_000, "HITLER_ELECTED")], {
        outcome: "HITLER_ELECTED", winner: "FASCIST",
      })
    );
    expect(round).toMatchObject({
      president: A, chancellor: D, election: { passed: true }, hand: null, enacted: null, endTerm: null,
    });
  });

  it("an unfinished round stops where the lobby closed", () => {
    const unfinished = (events: GameEvent[]) =>
      rounds(fiveSeatGame(events, { outcome: "UNFINISHED", winner: null }))[0];
    expect(
      unfinished([...passed(1, 4_000, A, B), ev.draw(1, 6_000, A, "LFF"), ev.end(1, 600_000, "UNFINISHED")])
    ).toMatchObject({
      hand: ["L", "F", "F"], discard: null, chancellorHand: null, enacted: null, endTerm: null,
    });
    expect(
      unfinished([
        ...passed(1, 4_000, A, B),
        ev.draw(1, 6_000, A, "LFF"), ev.discard(1, 8_000, A, 0, "L"), ev.veto(1, 10_000, B),
        ev.end(1, 600_000, "UNFINISHED"),
      ])
    ).toMatchObject({ veto: { accepted: null }, enacted: null });
  });

  describe("a lobby closed during a nomination", () => {
    const closed = (events: GameEvent[]) => rounds(fiveSeatGame(events, { outcome: "UNFINISHED", winner: null }));

    it("the next seat in turn would have nominated", () => {
      const rs = closed([...term(1, 0, A, B, "LFF", 1, "L", [1, 0]), ev.end(2, 600_000, "UNFINISHED")]);
      expect(rs).toHaveLength(2);
      expect(rs[1]).toMatchObject({
        r: 2, president: B, chancellor: null, votes: [], election: null, trackerAfter: null, hand: null,
        discard: null, chancellorHand: null, veto: null, enacted: null, power: null, endTerm: null,
        pauses: 0, reshuffled: false, disconnects: [],
      });
    });

    it("an executed seat is skipped", () => {
      const rs = closed([
        ...term(1, 0, A, C, "FFL", 2, "F", [0, 4], [ev.execute(1, 12_000, A, B, "LIBERAL")]),
        ev.end(2, 600_000, "UNFINISHED"),
      ]);
      expect(rs[1].president).toBe(C);
    });

    it("a special election names the next president, then the turn goes back", () => {
      const special = term(1, 0, A, C, "FFL", 2, "F", [0, 3], [ev.specialElection(1, 12_000, A, D)]);
      expect(closed([...special, ev.end(2, 600_000, "UNFINISHED")])[1].president).toBe(D);
      const rs = closed([...special, ...term(2, 30_000, D, A, "LFF", 1, "L", [1, 3]), ev.end(3, 600_000, "UNFINISHED")]);
      expect(rs.map((x) => x.president)).toEqual([A, D, B]);
    });

    it("a record holding only its end gives the first seat", () => {
      const rs = closed([ev.end(1, 600_000, "UNFINISHED")]);
      expect(rs).toHaveLength(1);
      expect(rs[0]).toMatchObject({ r: 1, president: 0, chancellor: null });
    });
  });

  it("a record that starts mid-term", () => {
    const rs = rounds(
      fiveSeatGame(
        [
          ev.restored(4, 0),
          ev.enact(4, 3_000, "F", "chancellor", D, 1, 3),
          ev.endTerm(4, 6_000, C, "president"),
          ev.nominate(5, 9_000, D, A),
        ],
        { complete: false, outcome: "UNFINISHED", winner: null }
      )
    );
    expect(rs.map((x) => x.r)).toEqual([4, 5]);
    expect(rs[0]).toMatchObject({
      president: C, chancellor: D, hand: null, discard: null, chancellorHand: null,
      enacted: { policy: "F", by: "chancellor" },
    });
    expect(rs[1]).toMatchObject({ president: D, chancellor: A });

    expect(
      rounds(
        fiveSeatGame([ev.restored(3, 0), ev.end(3, 600_000, "UNFINISHED")], {
          complete: false, outcome: "UNFINISHED", winner: null,
        })
      )
    ).toEqual([]);
  });

  it("a record that starts mid-term counts the dead it does not see die", () => {
    // Seat B died before the restore (it ends dead, and no recorded execution killed it), so the
    // turn after A's term skips it.
    const seats = fiveSeatGame([]).seats.map((s, i) => (i === B ? { ...s, alive: false } : s));
    const rs = rounds(
      fiveSeatGame([ev.restored(6, 0), ev.endTerm(6, 3_000, A, "countdown"), ev.end(7, 600_000, "UNFINISHED")], {
        complete: false, outcome: "UNFINISHED", winner: null, seats,
      })
    );
    expect(rs.map((x) => [x.r, x.president])).toEqual([
      [6, A],
      [7, C],
    ]);
  });

  it("Phase 15A's builders' records", () => {
    expect(rounds(makeRecord())).toEqual([]);
    const rs = rounds(makeRecord({ outcome: "UNFINISHED", winner: null }));
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ r: 9, president: 0, chancellor: null, votes: [], election: null });
  });

  it("never throws on an odd record", () => {
    const odd = fiveSeatGame([
      ev.nominate(1, 1_000, A, B),
      ev.vote(1, 2_000, 9, true),
      ev.election(1, 3_000, true, 1, 0),
      ev.draw(1, 4_000, A, "LFF"),
      ev.discard(1, 5_000, A, 5, "F"),
      { type: "somethingNew", t: 6_000, r: 1 } as unknown as GameEvent,
    ]);
    let rs: ReturnType<typeof rounds> = [];
    expect(() => (rs = rounds(odd))).not.toThrow();
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ votes: [{ seat: 9, ja: true }], discard: { index: 5, card: "F" }, chancellorHand: null });
  });
});

describe("blame and decision times", () => {
  it("times a passed election's decisions", () => {
    const [r1] = rounds(PASSED_TERM);
    expect(r1.ms).toEqual({ nominate: 4_000, discard: 3_000, chancellor: 3_000,
      chancellorAfterVeto: null, vetoAnswer: null, power: null, endTerm: 3_000 });
    expect(r1.votes.map((v) => v.ms)).toEqual([1_000, 2_000, null, 3_000, 5_000]);
  });

  it("formats one decision's time", () => {
    expect([400, 8_000, 8_499, 59_600, 65_000, 3_725_000].map(formatDecisionTime))
      .toEqual(["1 s", "8 s", "8 s", "1 min 00 s", "1 min 05 s", "62 min 05 s"]);
  });

  it("a CPU decides untimed", () => {
    const [round] = rounds(
      fiveSeatGame([
        ...passed(1, 4_000, BOT, B),
        ev.draw(1, 6_000, BOT, "FFF"), ev.discard(1, 7_000, BOT, 0, "F"),
        ev.enact(1, 10_000, "F", "chancellor", B, 0, 3),
        ev.peek(1, 11_000, BOT, "LLF"),
        ev.endTerm(1, 12_000, BOT, "president"),
      ])
    );
    expect(round.ms).toMatchObject({ nominate: null, discard: null, chancellor: 3_000, power: null, endTerm: null });
  });

  it("a restart voids only the spans across it", () => {
    const [round] = rounds(
      fiveSeatGame([
        ...passed(1, 4_000, A, B),
        ev.draw(1, 9_000, A, "LFF"),
        ev.restored(1, 50_000),
        ev.discard(1, 52_000, A, 1, "F"),
        ev.enact(1, 55_000, "L", "chancellor", B, 1, 0),
      ])
    );
    expect(round.ms).toMatchObject({ nominate: 4_000, discard: null, chancellor: 3_000 });
  });

  describe("a nomination is timed from the previous term's end, or a restart", () => {
    const firstTerm = [...term(1, 0, A, B, "LFF", 1, "L", [1, 0])]; // its END TERM at 20 000
    it("from the previous END TERM", () => {
      expect(rounds(fiveSeatGame([...firstTerm, ev.nominate(2, 22_000, B, C)]))[1].ms.nominate).toBe(2_000);
    });
    it("from a restart after it", () => {
      const rs = rounds(fiveSeatGame([...firstTerm, ev.restored(2, 21_000), ev.nominate(2, 22_000, B, C)]));
      expect(rs[1].ms.nominate).toBe(1_000);
    });
    it("from the game's start", () => {
      expect(rounds(fiveSeatGame([ev.nominate(1, 4_000, A, B)]))[0].ms.nominate).toBe(4_000);
      expect(rounds(fiveSeatGame([ev.restored(1, 1_000), ev.nominate(1, 4_000, A, B)]))[0].ms.nominate).toBe(3_000);
    });
    it("from the restore that a late record opens with", () => {
      const rs = rounds(
        fiveSeatGame([ev.restored(3, 30_000), ev.nominate(3, 34_000, C, D)], {
          complete: false, outcome: "UNFINISHED", winner: null,
        })
      );
      expect(rs[0].ms.nominate).toBe(4_000);
    });
    it("not at all in a late record that has neither", () => {
      const rs = rounds(fiveSeatGame([ev.nominate(3, 34_000, C, D)], { complete: false, outcome: "UNFINISHED", winner: null }));
      expect(rs[0].ms.nominate).toBeNull();
    });
  });

  it("veto times", () => {
    const vetoed = (accepted: boolean) =>
      rounds(
        fiveSeatGame([
          ...passed(1, 4_000, A, B),
          ev.draw(1, 6_000, A, "LFF"), ev.discard(1, 8_000, A, 0, "L"),
          ev.veto(1, 10_000, B), ev.vetoAnswer(1, 13_000, A, accepted),
          ...(accepted ? [ev.tracker(1, 13_000, 1)] : [ev.enact(1, 16_000, "F", "chancellor", B, 0, 6)]),
        ])
      )[0];
    expect(vetoed(false).ms).toMatchObject({ chancellor: 2_000, vetoAnswer: 3_000, chancellorAfterVeto: 3_000 });
    expect(vetoed(true).ms).toMatchObject({ chancellor: 2_000, vetoAnswer: 3_000, chancellorAfterVeto: null });
  });

  it("a power is timed from its policy", () => {
    const [round] = rounds(
      fiveSeatGame([
        ...passed(1, 4_000, A, B),
        ev.draw(1, 9_000, A, "FFL"), ev.discard(1, 12_000, A, 2, "L"),
        ev.enact(1, 15_000, "F", "chancellor", B, 0, 2),
        ev.investigate(1, 36_000, A, C, "FASCIST"),
      ])
    );
    expect(round.ms.power).toBe(21_000);
  });

  it("END TERM is timed from the term's last action", () => {
    const [round] = rounds(
      fiveSeatGame([
        ...passed(1, 4_000, A, B),
        ev.draw(1, 9_000, A, "FFL"), ev.discard(1, 12_000, A, 2, "L"),
        ev.enact(1, 15_000, "F", "chancellor", B, 0, 2),
        ev.investigate(1, 36_000, A, C, "FASCIST"),
        ev.timerPause(1, 38_000, A), ev.disconnect(1, 39_000, C), ev.timerResume(1, 41_000, A),
        ev.endTerm(1, 45_000, A, "countdown"),
      ])
    );
    expect(round.ms.endTerm).toBe(9_000);
    const [afterFailure] = rounds(
      fiveSeatGame([
        ev.nominate(1, 4_000, A, B),
        ev.election(1, 9_000, false, 0, 5), ev.tracker(1, 9_000, 1),
        ev.endTerm(1, 12_000, A, "president"),
      ])
    );
    expect(afterFailure.ms.endTerm).toBe(3_000);
  });

  it("blame", () => {
    const blame = (hand: string, index: number, policy: Card) =>
      rounds(fiveSeatGame(term(1, 0, A, B, hand, index, policy, policy === "L" ? [1, 0] : [0, 1])))[0].blame;
    expect(blame("FFL", 2, "F"), "the Liberal of FFL discarded").toBe(A);
    expect(blame("FFL", 0, "F"), "a Fascist of FFL discarded").toBe(B);
    expect(blame("FLL", 1, "F"), "a Liberal of FLL discarded").toBe(B);
    expect(blame("FFF", 0, "F"), "FFF").toBeNull();
    expect(blame("LFF", 1, "L"), "a Liberal enacted").toBeNull();

    const chaos = rounds(
      fiveSeatGame([...failed(1, 0, A, B, 3), ev.enact(1, 3_000, "F", "chaos", undefined, 0, 1)])
    )[0];
    expect(chaos.blame, "a chaos policy").toBeNull();

    const afterVeto = rounds(
      fiveSeatGame([
        ...passed(1, 4_000, A, B),
        ev.draw(1, 6_000, A, "LFF"), ev.discard(1, 8_000, A, 1, "F"),
        ev.veto(1, 10_000, B), ev.vetoAnswer(1, 13_000, A, false),
        ev.enact(1, 16_000, "F", "chancellor", B, 0, 6),
      ])
    )[0];
    expect(afterVeto.blame, "a refused veto, then F from L, F").toBe(B);

    const noDraw = rounds(
      fiveSeatGame([ev.restored(2, 0), ev.enact(2, 3_000, "F", "chancellor", B, 0, 2), ev.endTerm(2, 6_000, A, "president")], {
        complete: false, outcome: "UNFINISHED", winner: null,
      })
    )[0];
    expect(noDraw.blame, "no draw recorded").toBeNull();
  });
});

describe.each(parseStatsData(JSON.parse(JSON.stringify(fixture))).games.map((game) => [game.id, game] as const))(
  "the recorded game %s",
  (_id: string, game: GameRecord) => {
    const rs = rounds(game);
    const last = rs[rs.length - 1];
    const cpu = (seat: number | null) => seat !== null && game.seats[seat].cpu;

    it("has one round per number, 1 to rounds", () =>
      expect(rs.map((x) => x.r)).toEqual(Array.from({ length: game.rounds }, (_, i) => i + 1)));

    it("adds up to the final board", () => {
      expect(rs.filter((x) => x.enacted?.policy === "L")).toHaveLength(game.liberalPolicies);
      expect(rs.filter((x) => x.enacted?.policy === "F")).toHaveLength(game.fascistPolicies);
    });

    it("ends every term but the last", () => {
      expect(rs.slice(0, -1).every((x) => x.endTerm !== null)).toBe(true);
      if (game.outcome !== "UNFINISHED") expect(last.endTerm).toBeNull();
    });

    it("executes exactly the dead", () =>
      expect(rs.flatMap((x) => (x.power?.kind === "execute" ? [x.power.target] : [])).sort())
        .toEqual(game.seats.flatMap((s, i) => (s.alive ? [] : [i])).sort()));

    it("ends as its outcome says", () => {
      switch (game.outcome) {
        case "LIBERAL_POLICIES":
          expect(game.liberalPolicies).toBe(5);
          expect(last.enacted?.policy).toBe("L");
          break;
        case "FASCIST_POLICIES":
          expect(game.fascistPolicies).toBe(6);
          expect(last.enacted?.policy).toBe("F");
          break;
        case "HITLER_ELECTED":
          expect(last.election?.passed).toBe(true);
          expect(last.chancellor).not.toBeNull();
          expect(game.seats[last.chancellor!].role).toBe("HITLER");
          expect(last.enacted).toBeNull();
          expect(game.fascistPolicies).toBeGreaterThanOrEqual(3);
          break;
        case "HITLER_EXECUTED":
          expect(last.power).toMatchObject({ kind: "execute", role: "HITLER" });
          if (last.power?.kind === "execute") expect(game.seats[last.power.target].role).toBe("HITLER");
          break;
        case "UNFINISHED":
          expect(game.winner).toBeNull();
          break;
      }
    });

    it("counts its votes", () => {
      for (const round of rs) {
        if (round.election === null) continue;
        const { ja, nein, passed } = round.election;
        expect(round.votes, `round ${round.r}'s votes`).toHaveLength(ja + nein);
        expect(round.votes.filter((v) => v.ja), `round ${round.r}'s Ja votes`).toHaveLength(ja);
        expect(passed, `round ${round.r}'s result`).toBe(ja > nein);
      }
    });

    it("draws after every passed election that did not elect Hitler", () => {
      for (const round of rs) {
        if (!round.election?.passed) continue;
        if (round === last && game.outcome === "HITLER_ELECTED") continue;
        expect(round.hand, `round ${round.r}'s hand`).toHaveLength(3);
        expect(round.discard, `round ${round.r}'s discard`).not.toBeNull();
      }
    });

    it("a failed election moves the tracker", () => {
      for (const round of rs) {
        if (round.election?.passed !== false) continue;
        expect([1, 2, 3], `round ${round.r}'s tracker`).toContain(round.trackerAfter);
        if (round.trackerAfter === 3) expect(round.enacted?.by, `round ${round.r}'s chaos`).toBe("chaos");
      }
    });

    it("a chancellor enacts a card they were handed", () => {
      for (const round of rs) {
        if (round.enacted?.by !== "chancellor") continue;
        expect(round.chancellorHand, `round ${round.r}'s two cards`).not.toBeNull();
        expect(round.chancellorHand, `round ${round.r}'s two cards`).toContain(round.enacted.policy);
      }
    });

    it("blames only a Fascist enacted by a chancellor", () => {
      for (const round of rs) {
        if (round.blame === null) continue;
        expect(round.enacted, `round ${round.r}'s policy`).toEqual({ policy: "F", by: "chancellor" });
        expect([round.president, round.chancellor], `round ${round.r}'s blame`).toContain(round.blame);
      }
    });

    it("has no time below zero, and none for a CPU decider", () => {
      for (const round of rs) {
        const times = [...Object.values(round.ms), ...round.votes.map((v) => v.ms)];
        for (const ms of times) if (ms !== null) expect(ms, `a time in round ${round.r}`).toBeGreaterThanOrEqual(0);
        if (cpu(round.president)) {
          const { nominate, discard, vetoAnswer, power, endTerm } = round.ms;
          expect([nominate, discard, vetoAnswer, power, endTerm], `round ${round.r}'s CPU president`).toEqual([
            null, null, null, null, null,
          ]);
        }
        if (cpu(round.chancellor)) {
          expect([round.ms.chancellor, round.ms.chancellorAfterVeto], `round ${round.r}'s CPU chancellor`).toEqual([
            null, null,
          ]);
        }
        for (const vote of round.votes) if (cpu(vote.seat)) expect(vote.ms, `round ${round.r}'s CPU vote`).toBeNull();
      }
      if (!game.hasCpu) {
        expect(rs.some((x) => x.ms.nominate !== null), "some timed nomination").toBe(true);
        expect(rs.some((x) => x.votes.some((v) => v.ms !== null)), "some timed vote").toBe(true);
      }
    });

    it("follows the rotation", () => {
      for (let k = 2; k <= rs.length; k++) {
        const before = game.events.filter((e) => e.r < k);
        const t = before[before.length - 1].t;
        const cut: GameRecord = {
          ...game,
          outcome: "UNFINISHED",
          winner: null,
          events: [...before, ev.end(k, t, "UNFINISHED")],
        };
        const cutRounds = rounds(cut);
        expect(cutRounds[cutRounds.length - 1], `round ${k}`).toMatchObject({ r: k, president: rs[k - 1].president });
      }
    });
  }
);

