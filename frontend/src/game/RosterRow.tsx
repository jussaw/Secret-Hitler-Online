import type { ReactNode } from "react";
import { Bot } from "lucide-react";
import PlayerBase from "../assets/player-base.png";
import portraits, { defaultPortrait, portraitsAltText } from "../assets";
import "./PlayerRoster.css";

export type RosterRowProps = {
  name: string;
  icon: string; // portrait id, e.g. "p3" or "p_default"
  isUser: boolean;
  disabled: boolean; // darkened, as an executed player
  detail: string; // the line under the name, "" for none
  detailClass: string; // "office" | "role-liberal" | "role-fascist" | ""
  tag: string; // the compact rows' tag: "PRES" | "CHAN" | "HOST" | ""
  roleIcon?: { src: string; alt: string };
  status: ReactNode; // the right slot: a vote or busy image, or null
  /**
   * A bot the lobby's game will seat (#70): Lucide's robot on a plain tile in place of the
   * portrait (`icon` is not read), `is-bot` for the dashed look (LobbyScreen.css), and `data-bot`
   * in place of `data-player`.
   */
  bot?: boolean;
};

/** One roster row: portrait, name, detail line, tag and status slot. Shared by the game and the lobby. */
export default function RosterRow(props: RosterRowProps) {
  const className =
    "roster-row" + (props.bot ? " is-bot" : "") + (props.isUser ? " is-user" : "") + (props.disabled ? " is-disabled" : "");
  const icon = portraits[props.icon] ? props.icon : defaultPortrait; // an unknown id shows the default
  const name = props.bot ? { "data-bot": props.name } : { "data-player": props.name };
  return (
    <li className={className} {...name} title={props.name}>
      {props.bot ? (
        <span className="roster-portrait roster-bot-portrait">
          <Bot className="roster-bot-icon" aria-hidden="true" />
        </span>
      ) : (
        <span className="roster-portrait">
          <img className="roster-card" src={PlayerBase} alt="" />
          <img className="roster-face" src={portraits[icon]} alt={portraitsAltText[icon]} />
        </span>
      )}
      <span className="roster-text">
        <span className="roster-name">
          <span className="roster-name-text">{props.name}</span>
          {props.roleIcon && <img className="roster-role-icon" src={props.roleIcon.src} alt={props.roleIcon.alt} />}
        </span>
        <span className={"roster-detail" + (props.detailClass ? " " + props.detailClass : "")}>{props.detail}</span>
      </span>
      <span className="roster-tag">{props.tag}</span>
      <span className="roster-status">{props.status}</span>
    </li>
  );
}
