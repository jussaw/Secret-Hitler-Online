import { useMemo, useState, type ReactNode } from "react";
import { LineChart, type LineSeries } from "../charts/LineChart";
import { filterSearch, MIN_GAMES, type Rate } from "../counting";
import { PROVISIONAL_GAMES } from "../elo";
import { OUTCOME_LABELS } from "../endings";
import { FilterBar } from "../FilterBar";
import { botsLabel, plural } from "../format";
import { RoleWord } from "../game/text";
import { gamesFilterSearch, NO_GAMES_FILTER } from "../games/gamesFilter";
import "../games/GamesPage.css";
import { formatPercent, formatRating } from "../numbers";
import { computePlayer, type LatestGame, type PersonLink, type PlayerStats } from "../player";
import PlayerName from "../PlayerName";
import { ROLES, type Role } from "../record";
import { navigate, routePath, useLocation, type PageProps } from "../routes";
import { StatCard } from "../StatCard";
import StatsLink from "../StatsLink";
import { NO_VALUE, rateText } from "../tabs/cellText";
import { DECISIONS, formatAverageTime, type Decision } from "../timing";
import { useStats } from "../useStats";
import { formatLastPlayed, formatPoints, formatRate, formatShortDate } from "./playerText";
import { TrophyBadge } from "./TrophyBadge";
import "./PlayerPage.css";

/** Every card's line for a player with no counted games (Latest games' too, with no game at all). */
export const NO_COUNTED_GAMES = "No counted games yet.";

/** A card's empty line: `NO_COUNTED_GAMES` for a player with no counted games, else none. */
const noCountedGames = (player: PlayerStats) => (player.games === 0 ? NO_COUNTED_GAMES : undefined);

/** Each decision's words in the Timing card, in `DECISIONS`' order. */
const DECISION_WORDS: Record<Decision, string> = {
  nominate: "Nominating",
  vote: "Voting",
  discard: "Discarding as president",
  chancellor: "Choosing as chancellor",
  power: "Using a power",
  endTerm: "Ending the term",
};

/** A count of losses: "1 loss", "3 losses". */
const losses = (n: number) => `${n} ${n === 1 ? "loss" : "losses"}`;

/** "as" and a role's word in its colour: "as Liberal". */
const asRole = (role: Role) => (
  <>
    as <RoleWord role={role} />
  </>
);

/** One line of a card: its label, its value, and a count or note beside it. */
interface Fact {
  key: string;
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
}

/** A card's lines as a table: the label at the left, the value and its note at the right (a value with no note takes both columns). */
function Facts({ facts, className }: { facts: Fact[]; className?: string }): JSX.Element {
  return (
    <table className={className ? `player-facts ${className}` : "player-facts"}>
      <tbody>
        {facts.map((fact) => (
          <tr key={fact.key}>
            <th scope="row" className="player-fact-label">
              {fact.label}
            </th>
            {fact.note === undefined ? (
              <td className="player-fact-value" colSpan={2}>
                {fact.value}
              </td>
            ) : (
              <>
                <td className="player-fact-value">{fact.value}</td>
                <td className="player-fact-note">{fact.note}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A rate as a fact: a whole percent or, below its minimum, `NO_VALUE`, and its chances in `noun`s beside it. */
const rateFact = (key: string, label: ReactNode, rate: Rate, noun: string): Fact => ({
  key,
  label,
  value: rateText(rate.value),
  note: plural(rate.chances, noun),
});

/** A card's one large value and the note after it: "1563 #2 · peak 1601". */
function BigValue({ value, note }: { value: string; note: string }): JSX.Element {
  return (
    <p className="player-big">
      {value} <span className="player-big-note">{note}</span>
    </p>
  );
}

/** The header's line: counted games since the first, the CPU games not counted, the last game. */
function summary(player: PlayerStats, cpu: boolean, now: number, timeZone?: string): string {
  const parts: string[] = [];
  if (player.games > 0 && player.firstPlayed !== null) {
    parts.push(`${plural(player.games, "game")} since ${formatShortDate(player.firstPlayed, now, timeZone)}`);
  } else {
    parts.push("No counted games");
  }
  if (!cpu && player.cpuNotCounted > 0) parts.push(`+${player.cpuNotCounted} with Bots, not counted`);
  if (player.games > 0 && player.lastPlayed !== null) parts.push(`last played ${formatLastPlayed(player.lastPlayed, now, timeZone)}`);
  return parts.join(" · ");
}

/** The name, the line and the trophies. */
function PlayerHeader(props: { player: PlayerStats; cpu: boolean; now: number; timeZone?: string }): JSX.Element {
  const { player, cpu, now, timeZone } = props;
  return (
    <div className="stats-card player-header">
      <div className="player-title">
        <h1>{player.name}</h1>
        <p className="player-summary">{summary(player, cpu, now, timeZone)}</p>
      </div>
      {player.trophies.length > 0 && (
        <ul className="player-trophies" aria-label="Trophies">
          {player.trophies.map((trophy) => (
            <li key={trophy.id}>
              <TrophyBadge trophy={trophy} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Elo: the rating, the rank or "provisional", the peak, and the history. */
function EloCard({ player }: { player: PlayerStats }): JSX.Element {
  const { elo } = player;
  const series: LineSeries[] = elo ? [{ key: "rating", label: "Rating history", points: elo.history }] : [];
  const detail = (s: LineSeries, index: number) => [
    index === 0 ? "Start" : `After game ${index}`,
    formatRating(s.points[index].y),
  ];
  return (
    <StatCard
      title="Elo"
      definition={`Their rating, place in the power ranking and highest rating; provisional for their first ${PROVISIONAL_GAMES} games.`}
      empty={noCountedGames(player) ?? (elo === null ? NO_COUNTED_GAMES : undefined)}
      className="player-elo"
    >
      {elo && (
        <>
          <BigValue
            value={formatRating(elo.rating)}
            note={`${elo.rank === null ? "provisional" : `#${elo.rank}`} · peak ${formatRating(elo.peak)}`}
          />
          <LineChart series={series} label="Rating history" detail={detail} height={140} />
        </>
      )}
    </StatCard>
  );
}

/** Win rate: overall, by role, then by seats. */
function WinRateCard({ player }: { player: PlayerStats }): JSX.Element {
  const { overall, liberal, fascist, hitler, bySeats } = player.winRate;
  const byRole: Record<Role, Rate> = { LIBERAL: liberal, FASCIST: fascist, HITLER: hitler };
  return (
    <StatCard
      title="Win rate"
      definition={`Counted games won, in all, by their role and by the number of seats (from ${MIN_GAMES} games).`}
      empty={noCountedGames(player)}
    >
      <BigValue value={rateText(overall.value)} note={`${overall.hits} of ${plural(overall.chances, "game")} won`} />
      <Facts
        facts={[
          ...ROLES.map((role) => rateFact(role, asRole(role), byRole[role], "game")),
          ...bySeats.map(({ seats, rate }) => rateFact(`seats-${seats}`, `${seats} seats`, rate, "game")),
        ]}
      />
    </StatCard>
  );
}

/** Roles: the split as a bar, role luck, and the streaks. */
function RolesCard({ player }: { player: PlayerStats }): JSX.Element {
  const { roles, streaks } = player;
  const counts: Record<Role, number> = { LIBERAL: roles.liberal, FASCIST: roles.fascist, HITLER: roles.hitler };
  const current =
    streaks.current > 0 ? `won ${streaks.current}` : streaks.current < 0 ? `lost ${-streaks.current}` : NO_VALUE;
  return (
    <StatCard
      title="Roles"
      definition="Their roles, beside the Liberal share their tables' seats would give (role luck is the difference), and their streaks."
      empty={noCountedGames(player)}
    >
      <div className="player-split" aria-hidden="true">
        {ROLES.filter((role) => counts[role] > 0).map((role) => (
          <span key={role} className={`player-split-part is-${role.toLowerCase()}`} style={{ flexGrow: counts[role] }} />
        ))}
      </div>
      <p className="player-split-legend">
        {ROLES.map((role, i) => (
          <span key={role}>
            {i > 0 && " · "}
            <RoleWord role={role} /> {counts[role]}
          </span>
        ))}
      </p>
      <Facts
        facts={[
          { key: "expected", label: "Expected as Liberal", value: rateText(roles.expectedLiberal) },
          { key: "luck", label: "Role luck", value: roles.luck === null ? NO_VALUE : formatPoints(roles.luck) },
          { key: "current", label: "Current streak", value: current },
          { key: "longestWin", label: "Longest win streak", value: plural(streaks.longestWin, "win") },
          { key: "longestLoss", label: "Longest losing streak", value: losses(streaks.longestLoss) },
        ]}
      />
    </StatCard>
  );
}

/** Cards as president: the hands drawn, Liberal accuracy, deep cover and FFF as a Liberal. */
function PresidentCard({ player }: { player: PlayerStats }): JSX.Element {
  const { hands, liberalAccuracy, deepCover, forced } = player.cards;
  return (
    <StatCard
      title="Cards as president"
      definition="The hands they drew; holding both kinds, how often they discarded a Fascist, as a Liberal (accuracy) and as Fascist or Hitler (deep cover)."
      empty={noCountedGames(player)}
    >
      <table className="player-hands">
        <thead>
          <tr>
            {["FFF", "FFL", "FLL", "LLL"].map((hand) => (
              <th key={hand} scope="col">
                {hand}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {hands.map((count, i) => (
              <td key={i}>{count}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <Facts
        facts={[
          rateFact("accuracy", "Liberal accuracy", liberalAccuracy, "hand"),
          rateFact("deepCover", "Deep cover", deepCover, "hand"),
          { key: "fff", label: "FFF drawn as a Liberal", value: String(forced.president) },
        ]}
      />
    </StatCard>
  );
}

/** As chancellor: given one of each by role, FF as a Liberal, Fascist choices. */
function ChancellorCard({ player }: { player: PlayerStats }): JSX.Element {
  const { oneOfEach, forced, fascistChoices } = player.cards;
  return (
    <StatCard
      title="As chancellor"
      definition="Handed one of each, how often they enacted the Liberal, by their role; two Fascists handed to them; and times they chose a Fascist over a Liberal."
      empty={noCountedGames(player)}
    >
      <p className="player-subhead">Given one of each, enacted the Liberal</p>
      <Facts
        facts={[
          ...ROLES.map((role) => rateFact(role, asRole(role), oneOfEach[role], "hand")),
          { key: "ff", label: "FF handed to them as a Liberal", value: String(forced.chancellor) },
          { key: "choices", label: "Fascist choices", value: String(fascistChoices) },
        ]}
      />
    </StatCard>
  );
}

/** Votes & powers: Ja rate, accuracy, loyalty, investigations, executions, survival. */
function VotesCard({ player }: { player: PlayerStats }): JSX.Element {
  const { votes, powers } = player;
  return (
    <StatCard
      title="Votes & powers"
      definition="Their votes (accuracy as a Liberal, loyalty to a teammate's government on the Fascist side), their powers as president, and games alive at the end."
      empty={noCountedGames(player)}
    >
      <Facts
        facts={[
          rateFact("ja", "Ja rate", votes.ja, "vote"),
          rateFact("accuracy", "Liberal vote accuracy", votes.liberalAccuracy, "vote"),
          rateFact("loyalty", "Fascist loyalty", votes.fascistLoyalty, "vote"),
          {
            key: "investigations",
            label: "Investigations",
            value: String(powers.investigations),
            note: `${powers.foundFascist} found a Fascist`,
          },
          {
            key: "executions",
            label: "Executions",
            value: String(powers.executions),
            note: `${powers.hitlerExecutions} of Hitler`,
          },
          rateFact("survival", "Survived to the end", powers.survival, "game"),
        ]}
      />
    </StatCard>
  );
}

/** Another player, linked, and a note after the name: "Bo · 6 games". */
function Person({ who, note }: { who: PersonLink; note: string }): JSX.Element {
  return (
    <>
      <PlayerName player={who.player} name={who.name} />
      <span className="player-person-note"> · {note}</span>
    </>
  );
}

/** People: most played with, best teammate, nemesis and favourite opponent, each linked. */
function PeopleCard({ player }: { player: PlayerStats }): JSX.Element {
  const { mostPlayedWith, bestTeammate, nemesis, favouriteOpponent } = player.people;
  return (
    <StatCard
      title="People"
      definition="Most counted games together; the best win rate on the same side, over 5 or more games so; the most losses to and wins against one opponent."
      empty={noCountedGames(player)}
    >
      <Facts
        className="player-people"
        facts={[
          {
            key: "most",
            label: "Most played with",
            value: mostPlayedWith ? <Person who={mostPlayedWith} note={plural(mostPlayedWith.games, "game")} /> : NO_VALUE,
          },
          {
            key: "teammate",
            label: "Best teammate",
            value: bestTeammate ? <Person who={bestTeammate} note={formatPercent(bestTeammate.wins / bestTeammate.games)} /> : NO_VALUE,
          },
          { key: "nemesis", label: "Nemesis", value: nemesis ? <Person who={nemesis} note={losses(nemesis.losses)} /> : NO_VALUE },
          {
            key: "favourite",
            label: "Favourite opponent",
            value: favouriteOpponent ? <Person who={favouriteOpponent} note={plural(favouriteOpponent.wins, "win")} /> : NO_VALUE,
          },
        ]}
      />
    </StatCard>
  );
}

/** Timing: their average time per decision. */
function TimingCard({ player }: { player: PlayerStats }): JSX.Element {
  return (
    <StatCard title="Timing" definition="Their average time to decide, in counted games." empty={noCountedGames(player)}>
      <Facts
        facts={DECISIONS.map((kind) => {
          const ms = player.timing[kind];
          return { key: kind, label: DECISION_WORDS[kind], value: ms === null ? NO_VALUE : formatAverageTime(ms) };
        })}
      />
    </StatCard>
  );
}

/** A latest game's ending: how it was won, or nothing for an unfinished one. */
const endingOf = (game: LatestGame) => (game.outcome === "UNFINISHED" ? "" : OUTCOME_LABELS[game.outcome]);

/**
 * Latest games: each linked by the day it started (as GAMES dates it), their role, the result, the
 * ending and GAMES' tag of its bots' level; then all of them in GAMES.
 */
function LatestGamesCard(props: { player: PlayerStats; now: number; timeZone?: string }): JSX.Element {
  const { player, now, timeZone } = props;
  const allGamesHref = routePath({ page: "games" }) + gamesFilterSearch({ ...NO_GAMES_FILTER, players: [player.player] });
  return (
    <StatCard
      title="Latest games"
      definition="Their newest games, counted or not."
      empty={player.latest.length === 0 ? NO_COUNTED_GAMES : undefined}
    >
      <table className="player-latest">
        <tbody>
          {player.latest.map((game) => (
            <tr key={game.id}>
              <td className="player-latest-date">
                <StatsLink href={routePath({ page: "game", id: game.id })} className="player-game-link">
                  {formatShortDate(game.startedAt, now, timeZone)}
                </StatsLink>
              </td>
              <td className="player-latest-role">
                <RoleWord role={game.role} />
              </td>
              <td className="player-latest-result">{game.result}</td>
              <td className="player-latest-ending">
                {endingOf(game)}
                {game.cpu && (
                  <>
                    {" "}
                    <span className="games-row-cpu">{botsLabel(game.botSkill)}</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* A no-break space before the arrow: the 44px link is a flex box, which drops a plain one at its item's edge. */}
      <StatsLink href={allGamesHref} className="stats-link player-all-games">
        All {plural(player.allGames, "game")}
        {"\u00a0"}
        <span aria-hidden="true">›</span>
      </StatsLink>
    </StatCard>
  );
}

/**
 * One player's page, from `computePlayer`'s numbers: the header (the name, their counted games,
 * the CPU games the toggle leaves out while `cpu` is off, when they last played, their trophies),
 * then the cards in the spec's order. With no counted games every card but Latest games says so.
 * Dates are seen at `now` in `timeZone` (the viewer's by default).
 */
export function PlayerView(props: { player: PlayerStats; cpu: boolean; now: number; timeZone?: string }): JSX.Element {
  const { player, cpu, now, timeZone } = props;
  return (
    <>
      <PlayerHeader player={player} cpu={cpu} now={now} timeZone={timeZone} />
      <div className="player-cards">
        <EloCard player={player} />
        <WinRateCard player={player} />
        <RolesCard player={player} />
        <PresidentCard player={player} />
        <ChancellorCard player={player} />
        <VotesCard player={player} />
        <PeopleCard player={player} />
        <TimingCard player={player} />
        <LatestGamesCard player={player} now={now} timeZone={timeZone} />
      </div>
    </>
  );
}

/** A known player's page: the CPU switch on its own (the player filter does not apply), then their numbers. */
function KnownPlayer({ number }: { number: number }): JSX.Element {
  const stats = useStats();
  const { pathname } = useLocation();
  const [now] = useState(Date.now);
  const player = useMemo(() => (stats ? computePlayer(stats, number, now) : null), [stats, number, now]);
  if (!stats || !player) return <></>; // the records are on their way (StatsApp shows them once they come)
  return (
    <div className="player-page">
      <FilterBar
        players={stats.data.players}
        filter={stats.filter}
        onChange={(next) => navigate(pathname + filterSearch(next))}
        showPlayers={false}
      />
      <PlayerView player={player} cpu={stats.filter.cpu} now={now} />
    </div>
  );
}

/**
 * One player's page (`/players/<number>`), or a short not-found page for a number no player
 * has, with a way back to PLAYERS.
 */
export default function PlayerPage({ data, route }: PageProps): JSX.Element {
  const number = route.page === "player" ? route.number : null;
  if (number === null || !data.players.some((player) => player.number === number)) {
    return (
      <section className="stats-card player-not-found">
        <p>This player was not found.</p>
        <StatsLink href={routePath({ page: "players" })} className="stats-link">
          All players
        </StatsLink>
      </section>
    );
  }
  return <KnownPlayer number={number} />;
}
