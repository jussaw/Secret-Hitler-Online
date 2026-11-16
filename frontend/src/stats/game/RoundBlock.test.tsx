import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Round } from "../rounds";
import RoundBlock from "./RoundBlock";
import { fiveSeatGame } from "./sampleGames";

// fiveSeatGame's seats: P1, P2, P3 (Fascist), P4 (Hitler) and the CPU Bot 1.
const SEATS = fiveSeatGame([]).seats;
const [P1, P2, P3, P4] = [0, 1, 2, 3];

const NO_TIMES: Round["ms"] = {
  nominate: null, discard: null, chancellor: null, chancellorAfterVeto: null, vetoAnswer: null, power: null,
  endTerm: null,
};

/** A round of P1's with P2 nominated and nothing else, changed by `overrides`. */
function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    r: 3, president: P1, chancellor: P2, votes: [], election: null, trackerAfter: null, hand: null, discard: null,
    chancellorHand: null, veto: null, enacted: null, power: null, endTerm: null, pauses: 0, reshuffled: false,
    disconnects: [], blame: null, ms: NO_TIMES,
    ...overrides,
  };
}

/** An element's text, each policy tile read as `[Liberal]` or `[Fascist]`. */
function read(node: Element): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child instanceof Element) {
      out += child.getAttribute("role") === "img" ? `[${child.getAttribute("aria-label")}]` : read(child);
    } else {
      out += child.textContent ?? "";
    }
  });
  return out;
}

/** The block's lines, as `read` reads them. */
function lines(round: Round): string[] {
  const { container } = render(<RoundBlock round={round} seats={SEATS} />);
  return Array.from(container.querySelectorAll("section p"), read);
}

/** The block's section. */
function block(round: Round): HTMLElement {
  const { container } = render(<RoundBlock round={round} seats={SEATS} />);
  return container.querySelector("section")!;
}

describe("RoundBlock", () => {
  it("is edged in the colour of the policy it enacted", () => {
    const edge = (enacted: Round["enacted"]) => {
      const { container, unmount } = render(<RoundBlock round={makeRound({ enacted })} seats={SEATS} />);
      const classes = Array.from(container.querySelector("section")!.classList);
      unmount();
      return classes.filter((c) => c.startsWith("round-") && c !== "round-block");
    };
    expect(edge({ policy: "L", by: "chancellor" })).toEqual(["round-liberal"]);
    expect(edge({ policy: "F", by: "chancellor" })).toEqual(["round-fascist"]);
    expect(edge({ policy: "F", by: "chaos" })).toEqual(["round-fascist"]);
    expect(edge(null)).toEqual(["round-none"]);
  });

  it("is a card named by its heading", () => {
    const section = block(makeRound());
    expect(section).toHaveClass("stats-card", "round-block");
    expect(screen.getByRole("region", { name: "Round 3" })).toBe(section);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/^Round 3$/);
  });

  it("the nomination, timed", () => {
    expect(lines(makeRound({ ms: { ...NO_TIMES, nominate: 8_000 } }))).toEqual(["P1 nominates P2 8 s"]);
    expect(screen.getByText("8 s")).toHaveClass("decision-time");
  });

  it("a president who had yet to nominate", () => {
    expect(lines(makeRound({ chancellor: null }))).toEqual(["P1 had yet to nominate"]);
  });

  it("the votes in seat order, and the result", () => {
    const votes = [P3, P1, P4, P2].map((seat) => ({ seat, ja: seat !== P4, ms: null }));
    expect(lines(makeRound({ votes, election: { passed: true, ja: 3, nein: 1 } }))).toEqual([
      "P1 nominates P2 · passes 3–1",
      "Ja: P1, P2, P3 · Nein: P4",
    ]);
  });

  it("a failed election and the tracker", () => {
    const votes = [P1, P2, P3, P4].map((seat) => ({ seat, ja: seat === P2, ms: null }));
    expect(lines(makeRound({ votes, election: { passed: false, ja: 1, nein: 3 }, trackerAfter: 1 }))).toEqual([
      "P1 nominates P2 · fails 1–3",
      "Ja: P2 · Nein: P1, P3, P4",
      "election tracker 1",
    ]);
  });

  it("an empty side of the votes is left out", () => {
    const votes = [P1, P2].map((seat) => ({ seat, ja: true, ms: null }));
    expect(lines(makeRound({ votes, election: { passed: true, ja: 2, nein: 0 } }))[1]).toBe("Ja: P1, P2");
  });

  it("the cards and the choice", () => {
    expect(
      lines(
        makeRound({
          hand: ["L", "F", "F"], discard: { index: 1, card: "F" }, chancellorHand: ["L", "F"],
          enacted: { policy: "L", by: "chancellor" }, ms: { ...NO_TIMES, discard: 5_000, chancellor: 3_000 },
        })
      )
    ).toEqual([
      "P1 nominates P2",
      "P1 drew [Liberal][Fascist][Fascist], discarded [Fascist] 5 s",
      "P2 got [Liberal][Fascist], enacted [Liberal] 3 s",
    ]);
    expect(screen.getAllByRole("img").map((tile) => tile.className)).toEqual([
      "policy-tile policy-liberal", "policy-tile policy-fascist", "policy-tile policy-fascist",
      "policy-tile policy-fascist",
      "policy-tile policy-liberal", "policy-tile policy-fascist",
      "policy-tile policy-liberal",
    ]);
  });

  it("a policy whose hand was not recorded", () => {
    expect(lines(makeRound({ enacted: { policy: "F", by: "chancellor" } }))).toEqual([
      "P1 nominates P2",
      "P2 enacted [Fascist]",
    ]);
  });

  describe("a veto", () => {
    const asked = (veto: Round["veto"], overrides: Partial<Round> = {}) =>
      lines(
        makeRound({
          hand: ["L", "F", "F"], discard: { index: 0, card: "L" }, chancellorHand: ["F", "F"], veto,
          ms: { ...NO_TIMES, chancellor: 2_000, vetoAnswer: 3_000, chancellorAfterVeto: 3_000 },
          ...overrides,
        })
      )[2];

    it("accepted", () => {
      expect(asked({ accepted: true })).toBe("P2 got [Fascist][Fascist], asked to veto 2 s · P1 accepted the veto 3 s");
    });
    it("refused, then the chancellor's enact", () => {
      expect(asked({ accepted: false }, { enacted: { policy: "F", by: "chancellor" } })).toBe(
        "P2 got [Fascist][Fascist], asked to veto 2 s · P1 refused the veto 3 s · P2 enacted [Fascist] 3 s"
      );
    });
    it("unanswered", () => {
      expect(asked({ accepted: null })).toBe("P2 got [Fascist][Fascist], asked to veto 2 s · P1 had yet to answer");
    });
    it("accepted, the tracker after it", () => {
      const all = lines(
        makeRound({
          hand: ["L", "F", "F"], discard: { index: 0, card: "L" }, chancellorHand: ["F", "F"],
          veto: { accepted: true }, trackerAfter: 2,
        })
      );
      expect(all.slice(2)).toEqual(["P2 got [Fascist][Fascist], asked to veto · P1 accepted the veto", "election tracker 2"]);
    });
  });

  it("blame", () => {
    expect(lines(makeRound({ blame: P2 }))).toContain("Blame: P2 chose a Fascist over a Liberal");
  });

  it("chaos", () => {
    expect(lines(makeRound({ trackerAfter: 3, enacted: { policy: "F", by: "chaos" } }))).toEqual([
      "P1 nominates P2",
      "Chaos: the top policy was enacted [Fascist]",
    ]);
  });

  it("the powers", () => {
    const power = (p: Round["power"], ms: number | null = null) => {
      const all = lines(makeRound({ power: p, ms: { ...NO_TIMES, power: ms } }));
      return all[all.length - 1];
    };
    expect(power({ kind: "peek", seat: P1, cards: ["F", "L", "F"] }, 12_000)).toBe(
      "Power: P1 peeked at [Fascist][Liberal][Fascist] 12 s"
    );
    expect(power({ kind: "investigate", seat: P1, target: P3, result: "FASCIST" }, 21_000)).toBe(
      "Power: P1 investigated P3 and saw Fascist 21 s"
    );
    expect(screen.getAllByText("Fascist", { exact: true }).pop()).toHaveClass("stats-fascist");
    expect(power({ kind: "investigate", seat: P1, target: P2, result: "LIBERAL" })).toBe(
      "Power: P1 investigated P2 and saw Liberal"
    );
    expect(power({ kind: "execute", seat: P1, target: P2, role: "LIBERAL" })).toBe("Power: P1 executed P2, a Liberal");
    expect(power({ kind: "execute", seat: P1, target: P3, role: "FASCIST" })).toBe("Power: P1 executed P3, a Fascist");
    expect(power({ kind: "execute", seat: P1, target: P4, role: "HITLER" })).toBe("Power: P1 executed P4, Hitler");
    expect(screen.getAllByText("Hitler", { exact: true }).pop()).toHaveClass("stats-hitler");
    expect(power({ kind: "specialElection", seat: P1, target: P4 })).toBe("Power: P1 chose P4 as the next president");
  });

  it("the term's end, pauses, drops and reshuffle", () => {
    const last = (overrides: Partial<Round>) => {
      const all = lines(makeRound(overrides));
      return all[all.length - 1];
    };
    expect(last({ endTerm: { by: "president" }, ms: { ...NO_TIMES, endTerm: 4_000 } })).toBe("END TERM by P1 4 s");
    expect(last({ endTerm: { by: "countdown" }, ms: { ...NO_TIMES, endTerm: 10_000 } })).toBe("END TERM by the countdown");
    expect(last({ endTerm: { by: "countdown" }, pauses: 1 })).toBe("END TERM by the countdown · Countdown paused once");
    expect(last({ pauses: 2 })).toBe("Countdown paused 2 times");
    expect(last({ disconnects: [P3, P1, P3] })).toBe("Lost connection: P3, P1");
    expect(last({ reshuffled: true })).toBe("Discards shuffled into the draw pile");
  });

  it("a round with no times shows none", () => {
    const section = block(
      makeRound({
        votes: [{ seat: P1, ja: true, ms: null }], election: { passed: true, ja: 1, nein: 0 },
        hand: ["L", "F", "F"], discard: { index: 1, card: "F" }, chancellorHand: ["L", "F"],
        enacted: { policy: "F", by: "chancellor" }, blame: P2, power: { kind: "execute", seat: P1, target: P3, role: "FASCIST" },
        endTerm: { by: "president" }, pauses: 1, disconnects: [P2], reshuffled: true,
      })
    );
    expect(section.querySelectorAll("p").length).toBe(7);
    expect(section.querySelector(".decision-time")).toBeNull();
  });

  it("a seat the record does not have", () => {
    expect(lines(makeRound({ president: 7, chancellor: null }))).toEqual(["Seat 8 had yet to nominate"]);
  });
});
