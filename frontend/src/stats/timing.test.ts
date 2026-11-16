import { describe, expect, it } from "vitest";
import { countedGames, DEFAULT_FILTER, MIN_CHANCES, rate } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { ev } from "./game/sampleGames";
import { parseStatsData, type GameEvent, type GameRecord } from "./record";
import { formatDecisionTime, rounds } from "./rounds";
import { makeRecord, makeSeats } from "./testRecords";
import {
  computeTiming,
  DECISIONS,
  FASTEST_VOTER_MIN_GAMES,
  fastestVoter,
  formatAverageTime,
  MIN_TIMED_VOTES,
} from "./timing";

/** How long each decision of a term takes, in ms; `votes[i]` is seat `i`'s, from the nomination. */
interface Delays {
  nominate: number;
  votes: number[];
  discard: number;
  chancellor: number;
  endTerm: number;
}

const VOTES = [1000, 2000, 3000, 4000, 5000];
const TERM_1 = { nominate: 4000, discard: 3000, chancellor: 2000, endTerm: 6000 };

/**
 * One term of round `r` from `at`: the nomination `d.nominate` after it, each seat's Ja vote
 * `d.votes[seat]` after that, the passed election and the president's draw at the last vote, the
 * discard `d.discard` later, the chancellor's Liberal `d.chancellor` later and END TERM by `by`
 * `d.endTerm` after that, which is the term's `end`.
 */
function term(r: number, at: number, president: number, chancellor: number, d: Delays, by: "president" | "countdown" = "president") {
  const nominated = at + d.nominate;
  const votes = d.votes
    .map((delay, seat) => ({ seat, t: nominated + delay }))
    .sort((a, b) => a.t - b.t || a.seat - b.seat);
  const lastVote = votes[votes.length - 1].t;
  const discarded = lastVote + d.discard;
  const enacted = discarded + d.chancellor;
  const end = enacted + d.endTerm;
  const events: GameEvent[] = [
    ev.nominate(r, nominated, president, chancellor),
    ...votes.map((v) => ev.vote(r, v.t, v.seat, true)),
    ev.election(r, lastVote, true, votes.length, 0),
    ev.draw(r, lastVote, president, "LLF"),
    ev.discard(r, discarded, president, 2, "F"),
    ev.enact(r, enacted, "L", "chancellor", chancellor, 1, 0),
    ev.endTerm(r, end, president, by),
  ];
  return { events, end };
}

/** Events in time order (a stable sort, so events at one time keep their order). */
const inOrder = (events: GameEvent[]) => events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);

/** A finished five-seat record held by `players` (a CPU where null) with `events`, then its `end`. */
function timed(id: string, players: (number | null)[], events: GameEvent[]): GameRecord {
  const last = events.reduce((most, e) => Math.max(most, e.t), 0);
  const r = events.reduce((most, e) => Math.max(most, e.r), 1);
  return makeRecord({
    id,
    seats: makeSeats(["LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "HITLER"], players),
    hasCpu: players.includes(null),
    rounds: r,
    events: [...events, ev.end(r, last + 1000, "LIBERAL_POLICIES")],
  });
}

/**
 * Two terms: seat 0 presides over seat 1 and ends the term; then seat 1 over seat 2, pausing the
 * countdown (seat 3's connection drops meanwhile), resuming it, and the countdown ends the term.
 * `restoredAt` adds a restart at that time.
 */
function T1(id: string, { players = [1, 2, 3, 4, 5], restoredAt }: { players?: (number | null)[]; restoredAt?: number } = {}) {
  const first = term(1, 0, 0, 1, { ...TERM_1, votes: VOTES });
  const second = term(2, 20000, 1, 2, { nominate: 8000, votes: VOTES, discard: 5000, chancellor: 4000, endTerm: 15000 }, "countdown");
  const events = [
    ...first.events,
    ...second.events,
    ev.timerPause(2, 45000, 1),
    ev.disconnect(2, 46000, 3),
    ev.timerResume(2, 50000, 1),
  ];
  if (restoredAt !== undefined) events.push(ev.restored(1, restoredAt));
  return timed(id, players, inOrder(events));
}

/** `terms` terms in a row from the start, term `k` with seat `k % 5` presiding over the next seat. */
function votingGame(id: string, terms: number, { votes = VOTES, players = [1, 2, 3, 4, 5] }: { votes?: number[]; players?: (number | null)[] } = {}) {
  const events: GameEvent[] = [];
  let at = 0;
  for (let k = 0; k < terms; k++) {
    const t = term(k + 1, at, k % 5, (k + 1) % 5, { ...TERM_1, votes });
    events.push(...t.events);
    at = t.end;
  }
  return timed(id, players, events);
}

/** Term 1 alone, its policy the third Fascist, then seat 0's peek at 21000 and END TERM at 24000. */
function peekGame(id: string) {
  const events = term(1, 0, 0, 1, { ...TERM_1, votes: VOTES })
    .events.filter((e) => e.type !== "endTerm")
    .map((e) => (e.type === "enact" ? ev.enact(1, e.t, "F", "chancellor", 1, 0, 3) : e));
  return timed(id, [1, 2, 3, 4, 5], [...events, ev.peek(1, 21000, 0, "LFF"), ev.endTerm(1, 24000, 0, "president")]);
}

/**
 * Term 1 alone, but after the discard at 12000 seat 1 asks to veto at 13000, seat 0 refuses at
 * 15000, seat 1 enacts at 18000 and seat 0 ends the term at 24000.
 */
function vetoGame(id: string) {
  const events = term(1, 0, 0, 1, { ...TERM_1, votes: VOTES }).events.filter((e) => e.type !== "enact" && e.type !== "endTerm");
  return timed(id, [1, 2, 3, 4, 5], [
    ...events,
    ev.veto(1, 13000, 1),
    ev.vetoAnswer(1, 15000, 0, false),
    ev.enact(1, 18000, "L", "chancellor", 1, 1, 0),
    ev.endTerm(1, 24000, 0, "president"),
  ]);
}

const NAMES = new Map([
  [1, "Bo"],
  [2, "Ann"],
  [3, "Cy"],
  [4, "Di"],
  [5, "Ed"],
  [6, "Flo"],
]);

/** `f("c1")` to `f("c<n>")`. */
const copies = (n: number, f: (id: string) => GameRecord) => Array.from({ length: n }, (_, i) => f(`c${i + 1}`));

const mean = (count: number, ms: number | null) => ({ count, ms });

describe("the constants", () => {
  it("areTheSpecsAndTheTrophys", () => {
    expect([MIN_TIMED_VOTES, FASTEST_VOTER_MIN_GAMES]).toEqual([30, 8]);
    expect(DECISIONS).toEqual(["nominate", "vote", "discard", "chancellor", "power", "endTerm"]);
  });
});

describe("computeTiming", () => {
  it("averagesEachDecisionByWhoMadeIt", () => {
    const t = computeTiming([T1("t1")]);
    expect(t.byPlayer.get(1)).toEqual({
      games: 1,
      termsEnded: 1,
      countdownEnded: 0,
      pauses: 0,
      drops: 0,
      asPresident: mean(3, 13000 / 3),
      decisions: {
        nominate: mean(1, 4000),
        vote: mean(2, 1000),
        discard: mean(1, 3000),
        chancellor: mean(0, null),
        power: mean(0, null),
        endTerm: mean(1, 6000),
      },
    });
    expect(t.byPlayer.get(2)).toMatchObject({
      termsEnded: 1,
      countdownEnded: 1,
      pauses: 1,
      asPresident: mean(2, 6500),
      decisions: {
        nominate: mean(1, 8000),
        chancellor: mean(1, 2000),
        discard: mean(1, 5000),
        endTerm: mean(0, null),
        vote: mean(2, 2000),
      },
    });
    expect(t.byPlayer.get(3)!.decisions.chancellor).toEqual(mean(1, 4000));
    expect(t.byPlayer.get(4)).toMatchObject({ drops: 1, decisions: { vote: mean(2, 4000) } });
    expect(t.countdown).toEqual(rate(1, 2));
    expect([t.pauses, t.drops, t.slowestPresident, fastestVoter(t, NAMES)]).toEqual([1, 1, [], null]);
  });

  it("theFastestVoterNeedsThirtyVotesAndEightGames", () => {
    expect(fastestVoter(computeTiming(copies(8, (id) => votingGame(id, 4))), NAMES)).toBe(1); // 32 votes, 8 games
    expect(fastestVoter(computeTiming(copies(8, (id) => votingGame(id, 3))), NAMES)).toBeNull(); // 24 votes
    expect(fastestVoter(computeTiming(copies(7, (id) => votingGame(id, 5))), NAMES)).toBeNull(); // 35 votes, 7 games
  });

  it("aFastestVoterTieGoesToMoreVotesThenTheName", () => {
    const tied = copies(8, (id) => votingGame(id, 4, { votes: [1000, 1000, 3000, 4000, 5000] }));
    expect(fastestVoter(computeTiming(tied), NAMES)).toBe(2); // Ann before Bo, 32 votes each at 1000
    const more = votingGame("x", 1, { votes: [1000, 3000, 3000, 4000, 5000], players: [1, 6, 3, 4, 5] });
    expect(fastestVoter(computeTiming([...tied, more]), NAMES)).toBe(1); // 33 votes against 32
  });

  it("theSlowestPresidentNeedsFiveChoices", () => {
    const t = computeTiming(copies(3, (id) => T1(id)));
    expect(t.byPlayer.get(1)!.asPresident.count).toBe(9);
    expect(t.byPlayer.get(2)!.asPresident).toEqual(mean(6, 6500));
    expect(t.slowestPresident).toEqual([2]);
    expect(MIN_CHANCES).toBe(5);
  });

  it("tiedSlowestPresidentsAreAllShown", () => {
    // Seats 0 and 1 preside over two terms each, the same times: 6 timed choices at 13000/3 each,
    // while seats 2 to 4 have 3 each.
    const t = computeTiming([votingGame("t", 7)]);
    expect(t.slowestPresident).toEqual([1, 2]);
  });

  it("bothChancellorChoicesAroundARefusedVetoCount", () => {
    const t = computeTiming([vetoGame("v")]);
    expect(t.byPlayer.get(2)!.decisions.chancellor).toEqual(mean(2, 2000));
    expect(t.byPlayer.get(1)!.decisions.endTerm).toEqual(mean(1, 6000));
  });

  it("powerTimeRunsFromTheEnactThatGaveIt", () => {
    const t = computeTiming([peekGame("p")]);
    expect(t.byPlayer.get(1)!.decisions.power).toEqual(mean(1, 7000));
    expect(t.byPlayer.get(1)!.decisions.endTerm).toEqual(mean(1, 3000));
    expect(t.byPlayer.get(1)!.asPresident).toEqual(mean(4, (4000 + 3000 + 7000 + 3000) / 4));
  });

  it("aSpanAcrossARestoreIsLeftOut", () => {
    const t = computeTiming([T1("r", { restoredAt: 7500 })]);
    expect([1, 2, 3, 4, 5].map((p) => t.byPlayer.get(p)!.decisions.vote.count)).toEqual([2, 2, 2, 1, 1]);
  });

  it("cpuDecisionsAndCpuPresidentsAreLeftOut", () => {
    const t = computeTiming([T1("c", { players: [null, 2, 3, 4, 5] })]);
    expect(t.byPlayer.has(1)).toBe(false);
    expect(Array.from(t.byPlayer.keys())).toEqual([2, 3, 4, 5]);
    expect(t.countdown).toEqual(rate(1, 1));
  });

  it("formatsAverages", () => {
    expect(formatAverageTime(4240)).toBe("4.2 s");
    expect(formatAverageTime(950)).toBe("1.0 s");
    expect(formatAverageTime(59_940)).toBe("59.9 s");
    expect(formatAverageTime(59_960)).toBe(formatDecisionTime(59_960));
    expect(formatAverageTime(65000)).toBe(formatDecisionTime(65000));
  });

  it("noGames", () => {
    expect(computeTiming([])).toEqual({ byPlayer: new Map(), slowestPresident: [], countdown: rate(0, 0), pauses: 0, drops: 0 });
  });

  it("onTheContractFixture", () => {
    const counted = countedGames(parseStatsData(JSON.parse(JSON.stringify(fixture))).games, DEFAULT_FILTER);
    expect(counted.length).toBeGreaterThan(0);
    const t = computeTiming(counted);
    let votes = 0;
    for (const timing of t.byPlayer.values()) votes += timing.decisions.vote.count;
    const timedVotes = counted.flatMap(rounds).flatMap((round) => round.votes.filter((vote) => vote.ms !== null));
    expect(votes).toBe(timedVotes.length);
    for (const timing of t.byPlayer.values()) {
      for (const kind of DECISIONS) {
        const { ms } = timing.decisions[kind];
        expect(ms === null || (Number.isFinite(ms) && ms >= 0)).toBe(true);
      }
    }
  });
});
