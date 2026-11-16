import type { Card, GameEvent, GameRecord, Outcome, Role, Side } from "../record";
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
