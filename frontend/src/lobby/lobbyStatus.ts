import { defaultPortrait } from "../assets";
import { MIN_PLAYERS } from "../constants";

/**
 * The lobby's status line: what START GAME is waiting for, and when bots will fill the table.
 * A pure function of the lobby and the viewer, like the game's status lines.
 */

/** A piece of the line; `highlight` marks a player's name, drawn in orange. */
export type StatusSegment = { text: string; highlight: boolean };

export type LobbyViewer = { user: string; spectator: boolean };

/** Whether the player has yet to choose a look (no icon, or the default portrait). */
export function isPicking(
  name: string,
  icons: Record<string, string>,
): boolean {
  return icons[name] === undefined || icons[name] === defaultPortrait;
}

const plain = (text: string): StatusSegment => ({ text, highlight: false });
const name = (text: string): StatusSegment => ({ text, highlight: true });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The line for a guest, who is neither the host nor watching. */
function guestLine(usernames: string[], bots: number): StatusSegment[] {
  const host = name(usernames[0]);
  if (bots > 0) {
    return [
      plain("Waiting for "),
      host,
      plain(` to start. ${plural(bots, "bot")} will join.`),
    ];
  }
  return [plain("Waiting for "), host, plain(" to start the game.")];
}

export function lobbyStatus(
  usernames: string[],
  icons: Record<string, string>,
  viewer: LobbyViewer,
): StatusSegment[] {
  const prefix = viewer.spectator ? [plain("You are watching. ")] : [];
  if (usernames.length === 0) {
    return viewer.spectator
      ? [plain("You are watching. No one has a seat yet.")]
      : [];
  }

  const picking = usernames.filter((n) => isPicking(n, icons));
  const bots = Math.max(0, MIN_PLAYERS - usernames.length);

  if (picking.length > 0) {
    const first =
      picking[0] === viewer.user && !viewer.spectator
        ? plain("you")
        : name(picking[0]);
    const others = picking.length - 1;
    const rest = others > 0 ? ` and ${plural(others, "other")}` : "";
    return [
      ...prefix,
      plain("Waiting for "),
      first,
      plain(`${rest} to pick a look.`),
    ];
  }

  if (!viewer.spectator && viewer.user === usernames[0]) {
    if (bots > 0) {
      return [
        plain(
          `${plural(usernames.length, "player")}. ${plural(bots, "bot")} will join to make ${MIN_PLAYERS}.`,
        ),
      ];
    }
    return [plain("Everyone is ready. Start when you like.")];
  }
  return [...prefix, ...guestLine(usernames, bots)];
}
