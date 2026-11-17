import IconBusy from "../assets/player-icon-busy.png";
import { defaultPortrait } from "../assets";
import RosterRow from "../game/RosterRow";
import { isPicking } from "./lobbyStatus";

/**
 * The lobby's players in join order, in the game's roster rows, then a row for each bot the game
 * will seat. The first player is the host (`HOST` under the name, or after it in the phones'
 * compact rows); a player still on the default portrait gets `Picking a look…` and the busy
 * bubble. The host keeps `HOST` while picking. A bot's row is dashed, with Lucide's robot in place
 * of a portrait and the name the game will give it.
 */
export default function LobbyRoster(props: {
  usernames: string[];
  bots: string[];
  icons: Record<string, string>;
  user: string;
}) {
  const { usernames, bots, icons, user } = props;
  return (
    <ol className="roster" aria-label="Players">
      {usernames.map((name, i) => {
        const host = i === 0;
        const picking = isPicking(name, icons);
        return (
          <RosterRow
            key={name}
            name={name}
            icon={icons[name] ?? defaultPortrait}
            isUser={name === user}
            disabled={false}
            detail={host ? "HOST" : picking ? "Picking a look…" : ""}
            detailClass={host ? "office" : ""}
            tag={host ? "HOST" : ""}
            status={picking ? <img className="roster-busy" src={IconBusy} alt="busy" /> : null}
          />
        );
      })}
      {/* RosterRow's own parts, so a bot's row takes a person's size in every layout. */}
      {bots.map((name) => (
        <RosterRow
          key={`bot:${name}`}
          bot
          name={name}
          icon={defaultPortrait}
          isUser={false}
          disabled={false}
          detail=""
          detailClass=""
          tag=""
          status={null}
        />
      ))}
    </ol>
  );
}
