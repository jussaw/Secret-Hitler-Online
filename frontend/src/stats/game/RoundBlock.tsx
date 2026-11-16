import { useId, type ReactNode } from "react";
import PlayerName from "../PlayerName";
import type { Card, Seat } from "../record";
import { formatDecisionTime, type Round } from "../rounds";
import { CARD_WORDS, joined, RoleWord } from "./text";
import "./RoundBlock.css";

/** A seat's name, plain (a round shows no roles); a seat the record does not have is `Seat <n>`. */
function Name({ seat, seats }: { seat: number; seats: Seat[] }): JSX.Element {
  const found = seats[seat];
  return found ? <PlayerName player={found.player} name={found.name} /> : <PlayerName player={null} name={`Seat ${seat + 1}`} />;
}

/** A policy tile, Liberal blue or Fascist red, read by its name. */
function Tile({ card }: { card: Card }): JSX.Element {
  return (
    <span
      className={`policy-tile ${card === "L" ? "policy-liberal" : "policy-fascist"}`}
      role="img"
      aria-label={CARD_WORDS[card]}
    />
  );
}

function Tiles({ cards }: { cards: Card[] }): JSX.Element {
  return (
    <span className="policy-tiles">
      {cards.map((card, i) => (
        <Tile key={i} card={card} />
      ))}
    </span>
  );
}

/** A decision's time after the words it follows; nothing when it cannot be said. */
function Time({ ms }: { ms: number | null }): JSX.Element | null {
  if (ms === null) return null;
  return (
    <>
      {" "}
      <span className="decision-time">{formatDecisionTime(ms)}</span>
    </>
  );
}

/** A line's clauses, joined by ` · `; null when there are none. */
function clauses(parts: ReactNode[]): ReactNode | null {
  return joined(parts, " · ");
}

/** Seats' names, joined by `, `, in the order given. */
function NameList({ list, seats }: { list: number[]; seats: Seat[] }): JSX.Element {
  return <>{joined(list.map((seat) => <Name seat={seat} seats={seats} />), ", ")}</>;
}

/**
 * One round of a recorded game as a card, edged in the colour of the policy it enacted (grey for
 * none), named by its heading `Round <r>`. Its lines, each only when its data is there: the
 * nomination and result; the votes; the election tracker or a chaos policy; the president's cards;
 * the chancellor's cards, veto and choice; blame; the power; and the term's end, pauses, dropped
 * connections and reshuffle. Each decision's time follows it. A tracker moved by an accepted veto
 * follows the veto.
 */
export function RoundBlock({ round, seats }: { round: Round; seats: Seat[] }): JSX.Element {
  const titleId = useId();
  const { president, chancellor, ms } = round;
  const P = <Name seat={president} seats={seats} />;
  const C = chancellor === null ? null : <Name seat={chancellor} seats={seats} />;
  const edge = round.enacted === null ? "round-none" : round.enacted.policy === "L" ? "round-liberal" : "round-fascist";

  // The nomination and its result. A round that holds nothing past its nomination, and names no
  // chancellor, is one whose lobby closed first; one with a result but no nominee started at a
  // restore during the vote, so its nomination goes unnamed.
  const playedOn =
    round.votes.length > 0 ||
    round.election !== null ||
    round.trackerAfter !== null ||
    round.hand !== null ||
    round.discard !== null ||
    round.veto !== null ||
    round.enacted !== null ||
    round.power !== null ||
    round.endTerm !== null;
  const election = round.election;
  const nomination = clauses([
    C !== null ? (
      <>
        {P} nominates {C}
        <Time ms={ms.nominate} />
      </>
    ) : election !== null ? (
      <>{P}&apos;s nomination</>
    ) : playedOn ? null : (
      <>{P} had yet to nominate</>
    ),
    election && `${election.passed ? "passes" : "fails"} ${election.ja}–${election.nein}`,
  ]);

  // The votes, each side in seat order.
  const bySeat = [...round.votes].sort((a, b) => a.seat - b.seat);
  const side = (label: string, ja: boolean) => {
    const voters = bySeat.filter((v) => v.ja === ja);
    if (voters.length === 0) return null;
    return (
      <>
        {label} <NameList list={voters.map((v) => v.seat)} seats={seats} />
      </>
    );
  };
  const votes = clauses([side("Ja:", true), side("Nein:", false)]);

  // The tracker, or the top policy it enacted.
  const tracker =
    round.enacted?.by === "chaos" ? (
      <>
        Chaos: the top policy was enacted <Tile card={round.enacted.policy} />
      </>
    ) : round.trackerAfter !== null ? (
      `election tracker ${round.trackerAfter}`
    ) : null;
  const trackerAfterVeto = round.veto?.accepted === true;

  // The president's three and discard.
  const presidentCards =
    round.hand !== null || round.discard !== null ? (
      <>
        {P}
        {round.hand !== null && (
          <>
            {" drew "}
            <Tiles cards={round.hand} />
          </>
        )}
        {round.discard !== null && (
          <>
            {round.hand !== null ? ", discarded " : " discarded "}
            <Tile card={round.discard.card} />
            <Time ms={ms.discard} />
          </>
        )}
      </>
    ) : null;

  // The chancellor's two, the veto and the choice.
  const enactedByChancellor = round.enacted?.by === "chancellor" ? round.enacted : null;
  let chancellorLine: ReactNode | null = null;
  if (C !== null) {
    const got =
      round.chancellorHand !== null ? (
        <>
          {C} got <Tiles cards={round.chancellorHand} />
        </>
      ) : null;
    if (round.veto !== null) {
      const answer =
        round.veto.accepted === null ? (
          <>{P} had yet to answer</>
        ) : (
          <>
            {P} {round.veto.accepted ? "accepted" : "refused"} the veto
            <Time ms={ms.vetoAnswer} />
          </>
        );
      const after =
        round.veto.accepted === false && enactedByChancellor ? (
          <>
            {C} enacted <Tile card={enactedByChancellor.policy} />
            <Time ms={ms.chancellorAfterVeto} />
          </>
        ) : null;
      chancellorLine = clauses([
        <>
          {got ?? C}
          {got ? ", asked to veto" : " asked to veto"}
          <Time ms={ms.chancellor} />
        </>,
        answer,
        after,
      ]);
    } else if (enactedByChancellor) {
      chancellorLine = (
        <>
          {got ?? C}
          {got ? ", enacted " : " enacted "}
          <Tile card={enactedByChancellor.policy} />
          <Time ms={ms.chancellor} />
        </>
      );
    } else {
      chancellorLine = got;
    }
  }

  const blame =
    round.blame === null ? null : (
      <>
        Blame: <Name seat={round.blame} seats={seats} /> chose a Fascist over a Liberal
      </>
    );

  // The power and its result.
  let power: ReactNode | null = null;
  const p = round.power;
  if (p !== null) {
    const by = <Name seat={p.seat} seats={seats} />;
    let what: ReactNode;
    switch (p.kind) {
      case "peek":
        what = (
          <>
            {by} peeked at <Tiles cards={p.cards} />
          </>
        );
        break;
      case "investigate":
        what = (
          <>
            {by} investigated <Name seat={p.target} seats={seats} /> and saw{" "}
            <RoleWord role={p.result} />
          </>
        );
        break;
      case "execute":
        what = (
          <>
            {by} executed <Name seat={p.target} seats={seats} />
            {p.role === "HITLER" ? ", " : ", a "}
            <RoleWord role={p.role} />
          </>
        );
        break;
      case "specialElection":
        what = (
          <>
            {by} chose <Name seat={p.target} seats={seats} /> as the next president
          </>
        );
        break;
    }
    power = (
      <>
        Power: {what}
        <Time ms={ms.power} />
      </>
    );
  }

  // The term's end, pauses, dropped connections (each seat once, in order of its first drop) and
  // the reshuffle.
  const dropped = round.disconnects.filter((seat, i) => round.disconnects.indexOf(seat) === i);
  const end = clauses([
    round.endTerm &&
      (round.endTerm.by === "president" ? (
        <>
          END TERM by {P}
          <Time ms={ms.endTerm} />
        </>
      ) : (
        "END TERM by the countdown"
      )),
    round.pauses > 0 && (round.pauses === 1 ? "Countdown paused once" : `Countdown paused ${round.pauses} times`),
    dropped.length > 0 && (
      <>
        Lost connection: <NameList list={dropped} seats={seats} />
      </>
    ),
    round.reshuffled && "Discards shuffled into the draw pile",
  ]);

  const lines: [string, ReactNode | null][] = [
    ["round-nomination", nomination],
    ["round-votes", votes],
    ["round-tracker", trackerAfterVeto ? null : tracker],
    ["round-president", presidentCards],
    ["round-chancellor", chancellorLine],
    ["round-tracker", trackerAfterVeto ? tracker : null],
    ["round-blame", blame],
    ["round-power", power],
    ["round-end", end],
  ];
  return (
    <section className={`stats-card round-block ${edge}`} aria-labelledby={titleId}>
      <h2 id={titleId} className="round-title">
        Round {round.r}
      </h2>
      {lines.map(([className, line], i) =>
        line === null ? null : (
          <p key={i} className={className}>
            {line}
          </p>
        )
      )}
    </section>
  );
}

export default RoundBlock;
