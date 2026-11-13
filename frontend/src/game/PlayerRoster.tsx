import PlayerBase from "../assets/player-base.png";
import IconFascist from "../assets/player-icon-fascist.png";
import IconHitler from "../assets/player-icon-hitler.png";
import IconLiberal from "../assets/player-icon-liberal.png";
import IconBusy from "../assets/player-icon-busy.png";
import YesVote from "../assets/player-icon-ja.png";
import NoVote from "../assets/player-icon-nein.png";
import portraits, { portraitsAltText } from "../assets";
import { GameState, Role } from "../types";
import { DISABLE_EXECUTED_PLAYERS, PlayerRow, usePlayerRows } from "../player/usePlayerRows";
import "./PlayerRoster.css";

const ROLE_WORDS: Record<string, string> = {
  [Role.LIBERAL]: "Liberal",
  [Role.FASCIST]: "Fascist",
  [Role.HITLER]: "Hitler",
};

const ROLE_ICONS: Record<string, string> = {
  [Role.LIBERAL]: IconLiberal,
  [Role.FASCIST]: IconFascist,
  [Role.HITLER]: IconHitler,
};

const ROLE_CLASSES: Record<string, string> = {
  [Role.LIBERAL]: "role-liberal",
  [Role.FASCIST]: "role-fascist",
  [Role.HITLER]: "role-fascist",
};

const TAGS: Record<PlayerRow["office"], string> = { PRESIDENT: "PRES", CHANCELLOR: "CHAN", "": "" };

function RosterRow({ row }: { row: PlayerRow }) {
  const disabled = row.disabledText !== "";
  const roleWord = row.role !== undefined ? ROLE_WORDS[row.role] : undefined;
  const text = row.office || row.disabledText || roleWord || "";
  // The role's colour applies only when the role word itself is what the line shows.
  const detailClass = row.office
    ? "office"
    : !row.disabledText && row.role !== undefined
    ? ROLE_CLASSES[row.role]
    : "";

  let status = null;
  if (row.showVote) {
    status = <img className="roster-vote" src={row.vote ? YesVote : NoVote} alt={row.vote ? "ja" : "nein"} />;
  } else if (row.busy) {
    status = <img className="roster-busy" src={IconBusy} alt="busy" />;
  }

  const className = "roster-row" + (row.isUser ? " is-user" : "") + (disabled ? " is-disabled" : "");
  return (
    <li className={className} data-player={row.name} title={row.name}>
      <span className="roster-portrait">
        <img className="roster-card" src={PlayerBase} alt="" />
        <img className="roster-face" src={portraits[row.icon]} alt={portraitsAltText[row.icon]} />
      </span>
      <span className="roster-text">
        <span className="roster-name">
          <span className="roster-name-text">{row.name}</span>
          {row.role !== undefined && (
            <img className="roster-role-icon" src={ROLE_ICONS[row.role]} alt={ROLE_WORDS[row.role]} />
          )}
        </span>
        <span className={"roster-detail" + (detailClass ? " " + detailClass : "")}>{text}</span>
      </span>
      <span className="roster-tag">{TAGS[row.office]}</span>
      <span className="roster-status">{status}</span>
    </li>
  );
}

/** One row per player in playerOrder: portrait, name, office or role, and the vote or busy bubble. */
export default function PlayerRoster(props: {
  gameState: GameState;
  user: string;
  showVotes: boolean;
  showBusy: boolean;
}) {
  const rows = usePlayerRows({
    user: props.user,
    gameState: props.gameState,
    showVotes: props.showVotes,
    showBusy: props.showBusy,
    playerDisabledFilter: DISABLE_EXECUTED_PLAYERS,
  });
  return (
    <ol className="roster" aria-label="Players">
      {rows.map((row) => (
        <RosterRow key={row.name} row={row} />
      ))}
    </ol>
  );
}
