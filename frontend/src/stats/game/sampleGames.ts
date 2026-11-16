import type { Card, GameEvent, GameRecord, Outcome, Player, Role, Side } from "../record";
import { makeRecord, makeSeats } from "../testRecords";

/**
 * Hand-built timelines for tests (never imported by the page): one builder per event type, and a
 * five-seat game to put them in. Later phases' tests use them too.
 */

/** A hand of cards written as a string, `"LFF"`. */
function cards(hand: string): Card[] {
  return hand.split("") as Card[];
}

/** The event of one type. */
type Event<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;

/**
 * One builder per event type: `ev.<type>(r, t, …the type's fields in the spec's order)`, cards
 * written as a string (`ev.draw(1, 9_000, 0, "LFF")`). A chaos `enact` passes `undefined` for its
 * seat, which it then leaves out.
 */
export const ev = {
  nominate: (r: number, t: number, president: number, chancellor: number): Event<"nominate"> => ({
    type: "nominate", t, r, president, chancellor,
  }),
  vote: (r: number, t: number, seat: number, ja: boolean): Event<"vote"> => ({ type: "vote", t, r, seat, ja }),
  election: (r: number, t: number, passed: boolean, ja: number, nein: number): Event<"election"> => ({
    type: "election", t, r, passed, ja, nein,
  }),
  tracker: (r: number, t: number, value: number): Event<"tracker"> => ({ type: "tracker", t, r, value }),
  draw: (r: number, t: number, seat: number, hand: string): Event<"draw"> => ({ type: "draw", t, r, seat, cards: cards(hand) }),
  discard: (r: number, t: number, seat: number, index: number, card: Card): Event<"discard"> => ({
    type: "discard", t, r, seat, index, card,
  }),
  veto: (r: number, t: number, seat: number): Event<"veto"> => ({ type: "veto", t, r, seat }),
  vetoAnswer: (r: number, t: number, seat: number, accepted: boolean): Event<"vetoAnswer"> => ({
    type: "vetoAnswer", t, r, seat, accepted,
  }),
  enact: (
    r: number,
    t: number,
    policy: Card,
    by: "chancellor" | "chaos",
    seat: number | undefined,
    liberal: number,
    fascist: number
  ): Event<"enact"> =>
    seat === undefined
      ? { type: "enact", t, r, policy, by, liberal, fascist }
      : { type: "enact", t, r, policy, by, seat, liberal, fascist },
  reshuffle: (r: number, t: number, drawPile: number): Event<"reshuffle"> => ({ type: "reshuffle", t, r, drawPile }),
  peek: (r: number, t: number, seat: number, hand: string): Event<"peek"> => ({ type: "peek", t, r, seat, cards: cards(hand) }),
  investigate: (r: number, t: number, seat: number, target: number, result: Side): Event<"investigate"> => ({
    type: "investigate", t, r, seat, target, result,
  }),
  execute: (r: number, t: number, seat: number, target: number, role: Role): Event<"execute"> => ({
    type: "execute", t, r, seat, target, role,
  }),
  specialElection: (r: number, t: number, seat: number, target: number): Event<"specialElection"> => ({
    type: "specialElection", t, r, seat, target,
  }),
  endTerm: (r: number, t: number, seat: number, by: "president" | "countdown"): Event<"endTerm"> => ({
    type: "endTerm", t, r, seat, by,
  }),
  timerPause: (r: number, t: number, seat: number): Event<"timerPause"> => ({ type: "timerPause", t, r, seat }),
  timerResume: (r: number, t: number, seat: number): Event<"timerResume"> => ({ type: "timerResume", t, r, seat }),
  disconnect: (r: number, t: number, seat: number): Event<"disconnect"> => ({ type: "disconnect", t, r, seat }),
  reconnect: (r: number, t: number, seat: number): Event<"reconnect"> => ({ type: "reconnect", t, r, seat }),
  restored: (r: number, t: number): Event<"restored"> => ({ type: "restored", t, r }),
  end: (r: number, t: number, outcome: Outcome): Event<"end"> => ({ type: "end", t, r, outcome }),
};

/**
 * `makeRecord` with five seats, P1 and P2 (Liberals), P3 (Fascist), P4 (Hitler) and the CPU
 * `Bot 1` (Liberal), players 1 to 4, holding `events`, its `rounds` the largest `r` among them.
 * `overrides` replace fields whole, as `makeRecord`'s do.
 */
export function fiveSeatGame(events: GameEvent[], overrides: Partial<GameRecord> = {}): GameRecord {
  return makeRecord({
    seats: makeSeats(["LIBERAL", "LIBERAL", "FASCIST", "HITLER", "LIBERAL"], [1, 2, 3, 4, null]),
    hasCpu: true,
    events,
    rounds: events.reduce((most, e) => Math.max(most, e.r), 0),
    ...overrides,
  });
}

/** The showcase game's players, Maya to Blair, numbered 1 to 7 in seat order. */
export const SHOWCASE_PLAYERS: Player[] = ["Maya", "Rowan", "Theo", "Priya", "Sam", "Ash", "Blair"].map((name, i) => ({
  number: i + 1,
  name,
}));

/**
 * A seven-seat game won by the Liberals' fifth policy, in twelve rounds, that holds every kind of
 * round the game page draws: a round with every decision timed, blame on a president (round 2)
 * and on a chancellor (3), an investigation (3), a special election (4), a countdown end after a
 * pause and a reshuffle (5), a dropped connection (7), an execution (8), three failed elections
 * ending in chaos with a reshuffle (9 to 11), and a refused veto and the enact after it (12). Theo
 * and Ash are Fascists and Sam is Hitler; Blair executes Ash. Its cards follow one deck from the
 * shuffle, and its board adds up. For the PR screenshots and the page's tests.
 */
export function showcaseGame(): GameRecord {
  const [MAYA, ROWAN, THEO, PRIYA, SAM, ASH, BLAIR] = [0, 1, 2, 3, 4, 5, 6];
  const events: GameEvent[] = [];
  let t = 0;
  let board: [number, number] = [0, 0];
  let alive = [MAYA, ROWAN, THEO, PRIYA, SAM, ASH, BLAIR];
  /** Adds the event `make` gives for the time `wait` after the last one. */
  const add = (wait: number, make: (at: number) => GameEvent) => {
    t += wait;
    events.push(make(t));
  };
  /**
   * A nomination after `wait`, `between` it and the votes, then a vote from each living seat (in
   * `order`, else seat order), the `nein` seats saying Nein, and the result.
   */
  const elect = (
    r: number,
    wait: number,
    president: number,
    chancellor: number,
    nein: number[],
    order = alive,
    between: () => void = () => undefined
  ) => {
    add(wait, (at) => ev.nominate(r, at, president, chancellor));
    between();
    const gaps = [2_100, 1_400, 2_600, 1_900, 3_200, 1_100, 4_300];
    order.forEach((seat, i) => add(gaps[i % gaps.length], (at) => ev.vote(r, at, seat, !nein.includes(seat))));
    const ja = order.length - nein.length;
    add(0, (at) => ev.election(r, at, ja > nein.length, ja, nein.length));
  };
  /** The president's hand and discard, then the chancellor's policy. */
  const legislate = (r: number, president: number, chancellor: number, hand: string, index: number, policy: Card) => {
    add(200, (at) => ev.draw(r, at, president, hand));
    add(5_400, (at) => ev.discard(r, at, president, index, hand[index] as Card));
    board = policy === "L" ? [board[0] + 1, board[1]] : [board[0], board[1] + 1];
    const [liberal, fascist] = board;
    add(3_200, (at) => ev.enact(r, at, policy, "chancellor", chancellor, liberal, fascist));
  };
  const endTerm = (r: number, wait: number, president: number, by: "president" | "countdown" = "president") =>
    add(wait, (at) => ev.endTerm(r, at, president, by));
  const failed = (r: number, value: number) => add(0, (at) => ev.tracker(r, at, value));

  // 1: every decision timed.
  elect(1, 41_000, MAYA, ROWAN, [THEO, SAM], [ROWAN, MAYA, BLAIR, PRIYA, THEO, ASH, SAM]);
  legislate(1, MAYA, ROWAN, "LFF", 1, "L");
  endTerm(1, 46_100, MAYA);
  // 2: Rowan discards the one Liberal (blame on the president).
  elect(2, 63_000, ROWAN, THEO, [MAYA, BLAIR, PRIYA], [THEO, ROWAN, ASH, MAYA, SAM, BLAIR, PRIYA]);
  legislate(2, ROWAN, THEO, "FFL", 2, "F");
  endTerm(2, 74_800, ROWAN);
  // 3: Sam enacts the Fascist of one of each (blame on the chancellor); Theo investigates Maya.
  elect(3, 87_000, THEO, SAM, [PRIYA, BLAIR]);
  legislate(3, THEO, SAM, "LFF", 1, "F");
  add(18_400, (at) => ev.investigate(3, at, THEO, MAYA, "LIBERAL"));
  endTerm(3, 35_200, THEO);
  // 4: three Fascists drawn; Priya calls a special election for Blair.
  elect(4, 52_000, PRIYA, ASH, [SAM]);
  legislate(4, PRIYA, ASH, "FFF", 0, "F");
  add(16_300, (at) => ev.specialElection(4, at, PRIYA, BLAIR));
  endTerm(4, 28_400, PRIYA);
  // 5: Blair's special term; the deck runs low; Blair pauses, and the countdown ends the term.
  elect(5, 71_000, BLAIR, ROWAN, [THEO, ASH]);
  legislate(5, BLAIR, ROWAN, "LFF", 2, "L");
  add(0, (at) => ev.reshuffle(5, at, 12));
  add(2_500, (at) => ev.timerPause(5, at, BLAIR));
  add(31_000, (at) => ev.timerResume(5, at, BLAIR));
  endTerm(5, 7_500, BLAIR, "countdown");
  // 6: back to the seat after Priya.
  elect(6, 48_000, SAM, MAYA, [ROWAN, PRIYA, BLAIR]);
  legislate(6, SAM, MAYA, "LLF", 2, "L");
  endTerm(6, 52_900, SAM);
  // 7: Rowan drops out during the vote and comes back.
  elect(7, 39_000, ASH, PRIYA, [THEO, SAM], alive, () => {
    add(2_000, (at) => ev.disconnect(7, at, ROWAN));
    add(14_000, (at) => ev.reconnect(7, at, ROWAN));
  });
  legislate(7, ASH, PRIYA, "LFF", 1, "L");
  endTerm(7, 41_400, ASH);
  // 8: Blair executes Ash.
  elect(8, 94_000, BLAIR, THEO, [MAYA, ROWAN, PRIYA]);
  legislate(8, BLAIR, THEO, "FFF", 0, "F");
  add(24_800, (at) => ev.execute(8, at, BLAIR, ASH, "FASCIST"));
  alive = alive.filter((seat) => seat !== ASH);
  endTerm(8, 63_600, BLAIR);
  // 9 to 11: three failed elections, and chaos.
  elect(9, 33_000, MAYA, ROWAN, [THEO, SAM, PRIYA, BLAIR]);
  failed(9, 1);
  endTerm(9, 23_300, MAYA);
  elect(10, 58_000, ROWAN, PRIYA, [THEO, SAM, MAYA]);
  failed(10, 2);
  endTerm(10, 31_900, ROWAN);
  elect(11, 76_000, THEO, SAM, [MAYA, ROWAN, PRIYA, BLAIR]);
  failed(11, 3);
  board = [board[0], board[1] + 1];
  const [chaosL, chaosF] = board;
  add(0, (at) => ev.enact(11, at, "F", "chaos", undefined, chaosL, chaosF));
  add(0, (at) => ev.reshuffle(11, at, 8));
  endTerm(11, 48_100, THEO);
  // 12: Theo asks to veto two Liberals, Priya refuses, and Theo enacts the fifth Liberal.
  elect(12, 69_000, PRIYA, THEO, [ROWAN, BLAIR]);
  add(200, (at) => ev.draw(12, at, PRIYA, "LLF"));
  add(4_700, (at) => ev.discard(12, at, PRIYA, 2, "F"));
  add(6_300, (at) => ev.veto(12, at, THEO));
  add(5_200, (at) => ev.vetoAnswer(12, at, PRIYA, false));
  board = [board[0] + 1, board[1]];
  const [finalL, finalF] = board;
  add(3_800, (at) => ev.enact(12, at, "L", "chancellor", THEO, finalL, finalF));
  add(1_000, (at) => ev.end(12, at, "LIBERAL_POLICIES"));

  const seats = makeSeats(["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER", "FASCIST", "LIBERAL"], [1, 2, 3, 4, 5, 6, 7]).map(
    (seat, i) => ({ ...seat, name: SHOWCASE_PLAYERS[i].name, alive: i !== ASH })
  );
  const base = makeRecord();
  return makeRecord({
    id: "5b2e8f14-7c3a-4d9e-b1f6-0a2c4e6d8f10",
    endedAt: base.startedAt + t,
    outcome: "LIBERAL_POLICIES",
    winner: "LIBERAL",
    liberalPolicies: board[0],
    fascistPolicies: board[1],
    rounds: 12,
    seats,
    events,
  });
}

