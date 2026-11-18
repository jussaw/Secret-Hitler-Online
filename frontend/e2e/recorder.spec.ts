import { expect, test } from "@playwright/test";
import type { GameState } from "../src/types";
import { isVictory, openTable, play } from "./driveGame";

/**
 * The server records a real game (#31): one played to its end by raw-socket players is served by
 * GET /api/stats/games in the record's format (2), its keys in the spec's order, with no account ID.
 */

const RECORD_KEYS = [
  "id",
  "format",
  "startedAt",
  "endedAt",
  "outcome",
  "winner",
  "complete",
  "hasCpu",
  "botSkill",
  "liberalPolicies",
  "fascistPolicies",
  "rounds",
  "seats",
  "events",
];

const OUTCOMES: Record<string, string> = {
  LIBERAL_VICTORY_POLICY: "LIBERAL_POLICIES",
  LIBERAL_VICTORY_EXECUTION: "HITLER_EXECUTED",
  FASCIST_VICTORY_POLICY: "FASCIST_POLICIES",
  FASCIST_VICTORY_ELECTION: "HITLER_ELECTED",
};

type StoredGame = { [key: string]: unknown; seats: { name: string }[] };

test("a game played to its end is served by /api/stats/games", async ({ request, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  test.setTimeout(180_000);
  // Seven seats, as in spectator.spec.ts: driveGame's presidents never nominate Hitler after three
  // fascist policies, and in a game of five the two executions can leave no one else to nominate.
  const table = await openTable(baseURL!, 7);
  try {
    const victory: GameState = await play(table);
    expect(isVictory(victory.state), victory.state).toBe(true);

    // The writer saves on its own thread, so the record lands just after the victory.
    const seatNames = (record: StoredGame) => record.seats.map((seat) => seat.name).join("\n");
    const ours = victory.playerOrder.join("\n");
    let body = "";
    let record: StoredGame | undefined;
    await expect
      .poll(
        async () => {
          const response = await request.get("/api/stats/games");
          expect(response.status()).toBe(200);
          body = await response.text();
          const games = (JSON.parse(body) as { games: StoredGame[] }).games;
          record = games.find((game) => seatNames(game) === ours);
          return record !== undefined;
        },
        { timeout: 10_000 }
      )
      .toBe(true);

    expect(Object.keys(record!)).toEqual(RECORD_KEYS);
    expect(record!.outcome).toBe(OUTCOMES[victory.state]);
    expect(record!.complete).toBe(true);
    expect(record!.format).toBe(2);
    expect(record!.hasCpu).toBe(false);
    expect(record!.botSkill).toBeNull(); // seven people, no bots
    expect(body).not.toContain("test-");
  } finally {
    table.close();
  }
});
