import { useMemo, type ReactNode } from "react";
import { compareNames, MIN_GAMES, nameOf, rate } from "../counting";
import { plural } from "../format";
import { formatPercent } from "../numbers";
import PlayerName from "../PlayerName";
import { against, computeRivals, pairOf, type Pair, type RivalStats, type Rivalry } from "../rivals";
import { ScrollRegion } from "../ScrollRegion";
import { StatCard } from "../StatCard";
import type { StatsContext } from "../useStats";
import { PlayerMatrix, type MatrixCell } from "./PlayerMatrix";
import "./RivalsTab.css";

const NO_PAIRS = "No two players have shared a game yet.";

/** A name inside a headline: never a link. */
function Plain({ player, names }: { player: number; names: Map<number, string> }): JSX.Element {
  return <PlayerName player={player} name={nameOf(names, player)} link={false} />;
}

/** A duo's two names in alphabetical order, its rate and its record together. */
function Duo({ pair, wins, games, names }: { pair: Pair; wins: number; games: number; names: Map<number, string> }): JSX.Element {
  const [first, second] =
    compareNames(nameOf(names, pair.a), nameOf(names, pair.b)) <= 0 ? [pair.a, pair.b] : [pair.b, pair.a];
  const share = rate(wins, games, MIN_GAMES).value;
  return (
    <>
      <p className="rivals-headline">
        <Plain player={first} names={names} /> &amp; <Plain player={second} names={names} />
      </p>
      <p className="rivals-figure">{`${share === null ? "—" : formatPercent(share)} · won ${wins} of ${games}`}</p>
    </>
  );
}

/** A rivalry: the one with more wins first (by name when even), their record, and its games. */
function RivalryLine({ rivalry, names }: { rivalry: Rivalry; names: Map<number, string> }): JSX.Element {
  const { pair } = rivalry;
  const aWins = pair.aWins;
  const bWins = pair.opposed - pair.aWins;
  const aFirst = aWins !== bWins ? aWins > bWins : compareNames(nameOf(names, pair.a), nameOf(names, pair.b)) <= 0;
  const [first, second] = aFirst ? [pair.a, pair.b] : [pair.b, pair.a];
  const [won, lost] = aFirst ? [aWins, bWins] : [bWins, aWins];
  return (
    <>
      <p className="rivals-headline">
        <Plain player={first} names={names} /> {`${won}–${lost}`} <Plain player={second} names={names} />
      </p>
      <p className="rivals-figure">{plural(pair.opposed, "game")}</p>
    </>
  );
}

/** The People table: each player's most played with, nemesis and favourite opponent. */
function PeopleTable({ rivals, names }: { rivals: RivalStats; names: Map<number, string> }): JSX.Element {
  const name = (player: number) => <PlayerName player={player} name={nameOf(names, player)} />;
  const cell = (content: ReactNode | null) => <td>{content ?? "—"}</td>;
  return (
    <ScrollRegion label="People table">
      <table className="player-matrix rivals-people">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Most played with</th>
            <th scope="col">Nemesis</th>
            <th scope="col">Favourite opponent</th>
          </tr>
        </thead>
        <tbody>
          {rivals.players.map((player) => {
            const people = rivals.byPlayer.get(player)!;
            const { mostPlayedWith: most, nemesis, favouriteOpponent: favourite } = people;
            return (
              <tr key={player}>
                <th scope="row">{name(player)}</th>
                {cell(most && <>{name(most.player)}{` · ${plural(most.games, "game")}`}</>)}
                {cell(nemesis && <>{name(nemesis.player)}{` · lost ${nemesis.losses}`}</>)}
                {cell(favourite && <>{name(favourite.player)}{` · won ${favourite.wins}`}</>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

/**
 * RIVALS: who wins with and against whom (`rivals.ts`). Four headline cards (the best duos and the
 * rivalries), then the teammates' and opponents' matrices, each player's people, and who
 * nominated whom.
 */
export function RivalsTab({ stats }: { stats: StatsContext }): JSX.Element {
  const { counted, names } = stats;
  const rivals = useMemo(() => computeRivals(counted, names), [counted, names]);
  const none = counted.length === 0;
  const name = (player: number) => nameOf(names, player);
  const noPairs = rivals.pairs.size === 0;
  const pairs = Array.from(rivals.pairs.values());
  /** The wide cards' note: none without games, then without pairs, then `otherwise` when it applies. */
  const wideEmpty = (otherwise: string | false): boolean | string => (none ? true : noPairs ? NO_PAIRS : otherwise);

  const teammate = (row: number, column: number): MatrixCell | null => {
    const pair = pairOf(rivals, row, column);
    if (!pair || pair.together === 0) return null;
    const share = rate(pair.togetherWins, pair.together, MIN_GAMES).value;
    return {
      text: share === null ? "—" : formatPercent(share),
      sub: String(pair.together),
      title: `${name(row)} and ${name(column)}: won ${pair.togetherWins} of ${pair.together} together`,
    };
  };
  const opponent = (row: number, column: number): MatrixCell | null => {
    const pair = pairOf(rivals, row, column);
    if (!pair || pair.opposed === 0) return null;
    const { wins, losses } = against(rivals, row, column);
    return {
      text: `${wins}–${losses}`,
      title: `${name(row)} against ${name(column)}: won ${wins}, lost ${losses}`,
      tone: wins > losses ? "ahead" : wins < losses ? "behind" : undefined,
    };
  };
  const nomination = (row: number, column: number): MatrixCell | null => {
    const count = rivals.nominations.get(row)?.get(column) ?? 0;
    if (count === 0) return null;
    return { text: String(count), title: `${name(row)} nominated ${name(column)} ${count === 1 ? "once" : `${count} times`}` };
  };

  return (
    <div className="rivals-tab">
      <StatCard
        title="Best duo"
        definition="The best win rate on the same side, over 5 or more games together."
        empty={none || (!rivals.bestDuo && "No pair has 5 games on the same side yet.")}
      >
        {rivals.bestDuo && (
          <Duo pair={rivals.bestDuo} wins={rivals.bestDuo.togetherWins} games={rivals.bestDuo.together} names={names} />
        )}
      </StatCard>
      <StatCard
        title="Best Fascist duo"
        definition="The same, counting only games together on the Fascist side."
        empty={none || (!rivals.bestFascistDuo && "No pair has 5 games together on the Fascist side yet.")}
      >
        {rivals.bestFascistDuo && (
          <Duo
            pair={rivals.bestFascistDuo}
            wins={rivals.bestFascistDuo.fascistTogetherWins}
            games={rivals.bestFascistDuo.fascistTogether}
            names={names}
          />
        )}
      </StatCard>
      <StatCard
        title="Closest rivalry"
        definition="Of pairs with 5 or more games on opposite sides, the most even."
        empty={none || (!rivals.closest && "No pair has 5 games on opposite sides yet.")}
      >
        {rivals.closest && <RivalryLine rivalry={rivals.closest} names={names} />}
      </StatCard>
      <StatCard
        title="Most lopsided rivalry"
        definition="Of pairs with 5 or more games on opposite sides, the most one-sided."
        empty={none || (!rivals.mostLopsided && "No pair has 5 games on opposite sides yet.")}
      >
        {rivals.mostLopsided && <RivalryLine rivalry={rivals.mostLopsided} names={names} />}
      </StatCard>
      <StatCard
        title="Teammates"
        definition="Win rate together on the same side (from 5 games), over games together."
        className="rivals-wide"
        empty={wideEmpty(!pairs.some((p) => p.together > 0) && "No two players have been on the same side yet.")}
      >
        <PlayerMatrix title="Teammates" players={rivals.players} names={names} cell={teammate} />
      </StatCard>
      <StatCard
        title="Opponents"
        definition="Each row's wins and losses against each column, on opposite sides."
        className="rivals-wide"
        empty={wideEmpty(!pairs.some((p) => p.opposed > 0) && "No two players have been on opposite sides yet.")}
      >
        <PlayerMatrix title="Opponents" players={rivals.players} names={names} cell={opponent} />
      </StatCard>
      <StatCard
        title="People"
        definition="Most played with: the most games together, on either side. Nemesis: the most losses to one opponent. Favourite opponent: the most wins against one."
        className="rivals-wide"
        empty={wideEmpty(false)}
      >
        <PeopleTable rivals={rivals} names={names} />
      </StatCard>
      <StatCard
        title="Who trusts whom"
        definition="How often each president (row) nominated each chancellor (column)."
        className="rivals-wide"
        empty={wideEmpty(rivals.nominations.size === 0 && "No player has nominated another yet.")}
      >
        <PlayerMatrix title="Who trusts whom" players={rivals.players} names={names} cell={nomination} />
      </StatCard>
    </div>
  );
}
