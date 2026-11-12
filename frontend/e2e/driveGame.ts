import type { GameState } from "../src/types";

/**
 * A real game on the server, played by raw WebSocket players with the moves of the backend's
 * GameDriver: presidents discard a liberal, chancellors enact a fascist, the first election
 * fails, the chancellor vetoes once at five fascist policies, and Hitler is never nominated
 * after three fascist policies or executed. Every socket pings so the server's idle timeout
 * never drops it.
 */

const PING_MS = 10_000;
const WAIT_MS = 30_000;
const VICTORIES = [
  "FASCIST_VICTORY_POLICY",
  "FASCIST_VICTORY_ELECTION",
  "LIBERAL_VICTORY_POLICY",
  "LIBERAL_VICTORY_EXECUTION",
];

type Packet = GameState & { type: string; usernames?: string[]; icon: Record<string, string> };
type Seat = { name: string; ws: WebSocket; send(command: string, params?: object): void };

export type Table = {
  lobby: string;
  /** The last game state the first seat received. */
  latest(): GameState | undefined;
  close(): void;
};

type Internal = Table & {
  seats: Seat[];
  /** Why the server closed a seat, if it did: a refused move closes the mover's socket. */
  closed: string[];
  /** Every role any seat has seen (fascists see them all). */
  roles: Record<string, string>;
  changed(): Promise<void>;
};

export const isVictory = (state: string): boolean => VICTORIES.includes(state);

/** Creates a lobby, seats "Long Guest 1".. with portraits p1.., and starts the game. */
export async function openTable(baseURL: string, players: number): Promise<Table> {
  const lobby = await (await fetch(new URL("/new-lobby", baseURL))).text();
  let latest: Packet | undefined;
  let lastLobby: Packet | undefined;
  const roles: Record<string, string> = {};
  let wake: () => void = () => {};
  let tick = new Promise<void>((resolve) => (wake = resolve));
  const notify = () => {
    wake();
    tick = new Promise<void>((resolve) => (wake = resolve));
  };

  const seats: Seat[] = [];
  const closed: string[] = [];
  for (let i = 1; i <= players; i++) {
    const name = `Long Guest ${i}`;
    const url = new URL("/game", baseURL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("lobby", lobby);
    url.searchParams.set("name", name);
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error(`${name} could not connect`)), { once: true });
    });
    ws.addEventListener("message", (event) => {
      const packet = JSON.parse(String(event.data)) as Packet;
      if (packet.type === "game") {
        // Seats get each broadcast at different moments, so only the first seat's packets, which
        // arrive in order, say what the game's state is. Every seat's say what roles are known.
        if (i === 1) latest = packet;
        for (const [player, state] of Object.entries(packet.players)) {
          if (state.id) roles[player] = state.id;
        }
      } else if (packet.type === "lobby") {
        lastLobby = packet;
      }
      notify();
    });
    const send = (command: string, params: object = {}) =>
      ws.send(JSON.stringify({ name, lobby, command, ...params }));
    const ping = setInterval(() => send("ping"), PING_MS);
    ws.addEventListener(
      "close",
      (event) => {
        clearInterval(ping);
        closed.push(`${name}: ${event.code} ${event.reason}`);
      },
      { once: true }
    );
    send("select-icon", { icon: `p${i}` });
    seats.push({ name, ws, send });
  }

  const table: Internal = {
    lobby,
    seats,
    closed,
    roles,
    latest: () => latest,
    changed: () => tick,
    close: () => seats.forEach((seat) => seat.ws.close()),
  };
  const ready = () =>
    lastLobby?.usernames?.length === players &&
    Object.values(lastLobby.icon).every((icon) => icon !== "p_default");
  await waitUntil(table, ready, "every seat to pick a portrait");
  seats[0].send("start-game");
  await waitUntil(table, () => latest !== undefined, "the game to start");
  return table;
}

async function waitUntil(table: Table, done: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (!done()) {
    const left = deadline - Date.now();
    if (left <= 0) {
      const t = table as Internal;
      const g = t.latest();
      throw new Error(
        `Timed out waiting for ${what}; last state ${g ? key(g) : "none"}; closed: ${t.closed.join("; ") || "none"}`
      );
    }
    await Promise.race([
      (table as Internal).changed(),
      new Promise((resolve) => setTimeout(resolve, Math.min(left, 500))),
    ]);
  }
}

/** Everything a move depends on, so a packet that changes none of it is not acted on twice. */
const key = (g: GameState) =>
  JSON.stringify([
    g.state,
    g.president,
    g.chancellor,
    g.liberalPolicies,
    g.fascistPolicies,
    g.electionTracker,
    Object.keys(g.userVotes).length,
    g.vetoOccurred,
    g.playerOrder.filter((name) => g.players[name].alive),
  ]);

/**
 * Plays until `until` holds for the current state, or the game ends.
 * @param pace awaited before every move, with the state the move answers.
 * @return the state where it stopped.
 */
export async function play(
  table: Table,
  opts: { until?: (g: GameState) => boolean; pace?: (g: GameState) => Promise<void> } = {}
): Promise<GameState> {
  const t = table as Internal;
  const state = t as Internal & { voted?: Set<string>; failedOnce?: boolean; vetoed?: boolean };
  let acted = "";
  for (;;) {
    await waitUntil(t, () => t.latest() !== undefined && key(t.latest()!) !== acted, "the next state");
    const g = t.latest()!;
    if (isVictory(g.state) || opts.until?.(g)) return g;
    acted = key(g);
    if (opts.pace) await opts.pace(g);
    move(state, g);
  }
}

function move(t: Internal & { voted?: Set<string>; failedOnce?: boolean; vetoed?: boolean }, g: GameState) {
  const seat = (name: string) => t.seats.find((s) => s.name === name)!;
  const alive = g.playerOrder.filter((name) => g.players[name].alive);
  const isHitler = (name: string) => t.roles[name] === "HITLER";
  const others = alive.filter((name) => name !== g.president);
  if (g.state !== "CHANCELLOR_VOTING") t.voted = undefined;

  switch (g.state) {
    case "CHANCELLOR_NOMINATION": {
      const start = g.playerOrder.indexOf(g.president);
      const nominee = [...g.playerOrder.slice(start + 1), ...g.playerOrder.slice(0, start)].find(
        (name) =>
          g.players[name].alive &&
          name !== g.lastChancellor &&
          !(name === g.lastPresident && alive.length > 5) &&
          !(isHitler(name) && g.fascistPolicies >= 3)
      );
      seat(g.president).send("nominate-chancellor", { target: nominee });
      break;
    }
    case "CHANCELLOR_VOTING": {
      if (!t.voted) {
        t.voted = new Set();
      }
      const vote = t.failedOnce === true;
      for (const name of alive) {
        if (!t.voted.has(name) && !(name in g.userVotes)) {
          t.voted.add(name);
          seat(name).send("register-vote", { vote });
        }
      }
      t.failedOnce = true;
      break;
    }
    case "LEGISLATIVE_PRESIDENT":
      seat(g.president).send("register-president-choice", {
        choice: Math.max(0, (g.presidentChoices ?? []).indexOf("LIBERAL" as never)),
      });
      break;
    case "LEGISLATIVE_CHANCELLOR":
      if (g.fascistPolicies === 5 && !g.vetoOccurred && !t.vetoed) {
        t.vetoed = true;
        seat(g.chancellor).send("chancellor-veto");
      } else {
        seat(g.chancellor).send("register-chancellor-choice", {
          choice: Math.max(0, (g.chancellorChoices ?? []).indexOf("FASCIST" as never)),
        });
      }
      break;
    case "LEGISLATIVE_PRESIDENT_VETO":
      seat(g.president).send("president-veto", { veto: true });
      break;
    case "PRESIDENTIAL_POWER_PEEK":
      seat(g.president).send("register-peek");
      break;
    case "PRESIDENTIAL_POWER_INVESTIGATE":
      seat(g.president).send("get-investigation", {
        target: others.find((name) => !g.players[name].investigated),
      });
      break;
    case "PRESIDENTIAL_POWER_ELECTION":
      seat(g.president).send("register-special-election", { target: others[0] });
      break;
    case "PRESIDENTIAL_POWER_EXECUTION":
      seat(g.president).send("register-execution", { target: others.find((name) => !isHitler(name)) });
      break;
    case "POST_LEGISLATIVE":
      seat(g.president).send("end-term");
      break;
    default:
      throw new Error(`No move for ${g.state}`);
  }
}
