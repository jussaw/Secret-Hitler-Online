import { describe, expect, it } from "vitest";
import { defaultPortrait } from "../assets";
import {
  isPicking,
  LobbyViewer,
  lobbyStatus,
  StatusSegment,
} from "./lobbyStatus";

const text = (s: StatusSegment[]) => s.map((x) => x.text).join("");
const names = (s: StatusSegment[]) =>
  s.filter((x) => x.highlight).map((x) => x.text);

const HOST = "Host Player";
const lg = (n: number) => `Long Guest ${n}`;
const TEN = [HOST, ...Array.from({ length: 9 }, (_, i) => lg(i + 1))];

/** Picking players get the default portrait; everyone else gets p1, p2, … */
function icons(
  players: string[],
  picking: string[] = [],
): Record<string, string> {
  const result: Record<string, string> = {};
  players.forEach((name, i) => {
    result[name] = picking.includes(name) ? defaultPortrait : `p${i + 1}`;
  });
  return result;
}

const player = (user: string): LobbyViewer => ({ user, spectator: false });
const spectator: LobbyViewer = { user: "", spectator: true };

describe("isPicking", () => {
  it("is true with no icon or the default portrait, false with a chosen one", () => {
    expect(isPicking("Ann", {})).toBe(true);
    expect(isPicking("Ann", { Ann: "p_default" })).toBe(true);
    expect(isPicking("Ann", { Ann: "p2" })).toBe(false);
  });
});

describe("lobbyStatus", () => {
  const cases: [string, string[], string[], LobbyViewer, string, string[]][] = [
    [
      "one player picking",
      TEN,
      [lg(3)],
      player(lg(1)),
      "Waiting for Long Guest 3 to pick a look.",
      [lg(3)],
    ],
    [
      "two picking",
      TEN,
      [lg(3), lg(5)],
      player(lg(1)),
      "Waiting for Long Guest 3 and 1 other to pick a look.",
      [lg(3)],
    ],
    [
      "several picking",
      TEN,
      [lg(3), lg(5), lg(7)],
      player(lg(1)),
      "Waiting for Long Guest 3 and 2 others to pick a look.",
      [lg(3)],
    ],
    [
      "the viewer picks first",
      TEN,
      [lg(3), lg(5)],
      player(lg(3)),
      "Waiting for you and 1 other to pick a look.",
      [],
    ],
    [
      "host, ready, ten",
      TEN,
      [],
      player(HOST),
      "Everyone is ready. Start when you like.",
      [],
    ],
    [
      "host, ready, three",
      TEN.slice(0, 3),
      [],
      player(HOST),
      "3 players. 2 bots will join to make 5.",
      [],
    ],
    [
      "host, ready, four",
      TEN.slice(0, 4),
      [],
      player(HOST),
      "4 players. 1 bot will join to make 5.",
      [],
    ],
    [
      "host alone",
      TEN.slice(0, 1),
      [],
      player(HOST),
      "1 player. 4 bots will join to make 5.",
      [],
    ],
    [
      "guest, ready, ten",
      TEN,
      [],
      player(lg(1)),
      "Waiting for Host Player to start the game.",
      [HOST],
    ],
    [
      "guest, ready, three",
      TEN.slice(0, 3),
      [],
      player(lg(1)),
      "Waiting for Host Player to start. 2 bots will join.",
      [HOST],
    ],
    [
      "guest, ready, four",
      TEN.slice(0, 4),
      [],
      player(lg(1)),
      "Waiting for Host Player to start. 1 bot will join.",
      [HOST],
    ],
    [
      "spectator, ready",
      TEN,
      [],
      spectator,
      "You are watching. Waiting for Host Player to start the game.",
      [HOST],
    ],
    [
      "spectator, longest",
      TEN,
      TEN.slice(1),
      spectator,
      "You are watching. Waiting for Long Guest 1 and 8 others to pick a look.",
      [lg(1)],
    ],
    [
      "spectator, empty lobby",
      [],
      [],
      spectator,
      "You are watching. No one has a seat yet.",
      [],
    ],
    ["player before the first packet", [], [], player("Sam"), "", []],
  ];

  it.each(cases)(
    "%s",
    (_label, players, picking, viewer, line, highlighted) => {
      const status = lobbyStatus(players, icons(players, picking), viewer);
      expect(text(status)).toBe(line);
      expect(names(status)).toEqual(highlighted);
    },
  );

  it("lets picking beat ready for the host", () => {
    const status = lobbyStatus(
      TEN.slice(0, 3),
      icons(TEN.slice(0, 3), [lg(2)]),
      player(HOST),
    );
    expect(text(status)).toBe("Waiting for Long Guest 2 to pick a look.");
  });

  it("lets picking beat the bots line for a host with fewer than five players", () => {
    const players = TEN.slice(0, 4);
    const status = lobbyStatus(players, icons(players, [lg(3)]), player(HOST));
    expect(text(status)).toBe("Waiting for Long Guest 3 to pick a look.");
  });
});
