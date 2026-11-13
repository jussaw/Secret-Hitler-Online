import IconBusy from "../assets/player-icon-busy.png";
import { defaultPortrait } from "../assets";
import RosterRow from "../game/RosterRow";
import { isPicking } from "./lobbyStatus";

/**
 * The lobby's players in join order, in the game's roster rows. The first player is the host
 * (`HOST` under the name, or after it in the phones' compact rows); a player still on the default
 * portrait gets `Picking a look…` and the busy bubble. The host keeps `HOST` while picking.
 */
export default function LobbyRoster(props: {
  usernames: string[];
  icons: Record<string, string>;
  user: string;
}) {
  const { usernames, icons, user } = props;
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
    </ol>
  );
}
