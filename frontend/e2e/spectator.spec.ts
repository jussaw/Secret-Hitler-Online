import { expect, test, type Page } from "@playwright/test";
import { LobbyState as S, type GameState } from "../src/types";
import { isVictory, openTable, play } from "./driveGame";
import { EVERY_ROLE, TEN, openFakeWatch, spectatorPacket } from "./fakeGame";
import { watchLobby } from "./lobby";
import { findSecrets } from "./secrets";
import { heard, recordSounds } from "./soundLog";

/**
 * Logs the text of every prompt that opens (#alert-box gains appear-custom-alert), so a test can
 * prove a spectator sees none before the victory screen.
 */
async function recordAlerts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __alerts: string[]; __alertOpen: boolean };
    w.__alerts = [];
    w.__alertOpen = false;
    new MutationObserver(() => {
      const box = document.querySelector("#alert-box.appear-custom-alert");
      if (box && !w.__alertOpen) w.__alerts.push((box.textContent ?? "").trim().slice(0, 80));
      w.__alertOpen = box !== null;
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
}

const alerts = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __alerts: string[] }).__alerts);

test("a spectator gets the player's error for an unknown lobby", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  await page.goto("/");
  await page.getByRole("textbox", { name: "Lobby" }).fill("ZZZZ");
  await page.getByRole("button", { name: "WATCH" }).click();
  await expect(page.getByText("The lobby could not be found.")).toBeVisible();

  await page.reload();
  await page.getByRole("textbox", { name: "Lobby" }).fill("ZZZZ");
  await page.getByRole("textbox", { name: "Your Name" }).first().fill("Ann");
  await page.getByRole("button", { name: "JOIN" }).click();
  await expect(page.getByText("The lobby could not be found.")).toBeVisible();
});

test("a spectator watches a scripted game without prompts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the scripted game runs in one browser");
  test.setTimeout(120_000);
  await recordSounds(page);
  await recordAlerts(page);
  const game = await openFakeWatch(page);

  // The lobby, read-only.
  await expect(page.getByText("You are watching. The game starts when the VIP starts it.")).toBeVisible();
  await expect(page.getByRole("button", { name: "LEAVE LOBBY" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CHANGE ICON" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "START GAME" })).toHaveCount(0);

  const [, P, C] = TEN;
  const T = TEN[5];
  const status = page.locator("#status-bar-text");
  const step = async (overrides: Partial<GameState>, text: string) => {
    game.send(spectatorPacket(overrides));
    await expect(status).toHaveText(text, { timeout: 30_000 });
  };
  const allVotes = Object.fromEntries(TEN.map((name) => [name, true]));

  await step({ president: P }, `Waiting for ${P} to nominate a chancellor.`);
  await step(
    { state: S.CHANCELLOR_VOTING, president: P, chancellor: C },
    `${P} nominated ${C}. Waiting for all players to vote.`
  );
  game.send(spectatorPacket({ state: S.CHANCELLOR_VOTING, president: P, chancellor: C, userVotes: { [TEN[3]]: true } }));
  await heard(page, 3);
  await step(
    { state: S.LEGISLATIVE_PRESIDENT, president: P, chancellor: C, userVotes: allVotes },
    `Waiting for ${P} to choose a policy to discard.`
  );
  await step(
    { state: S.LEGISLATIVE_CHANCELLOR, president: P, chancellor: C, userVotes: allVotes },
    `Waiting for ${C} to choose a policy to enact.`
  );
  await step(
    { state: S.PP_INVESTIGATE, president: P, chancellor: C, fascistPolicies: 1, lastPolicy: "FASCIST" },
    `Investigation: ${P} is choosing a player to investigate.`
  );
  const investigated = spectatorPacket({
    state: S.POST_LEGISLATIVE,
    lastState: S.PP_INVESTIGATE,
    president: P,
    chancellor: C,
    targetUser: T,
    fascistPolicies: 1,
    lastPolicy: "FASCIST",
  }) as { players: Record<string, { investigated: boolean }> };
  investigated.players[T].investigated = true;
  game.send(investigated);
  await expect(status).toHaveText(`${P} investigated ${T}.`, { timeout: 30_000 });
  await expect(status).toHaveText(`Waiting for ${P} to end their term.`, { timeout: 30_000 });
  expect(await alerts(page), "prompts before the end").toEqual([]);

  const end = spectatorPacket({
    state: S.FASCIST_VICTORY_POLICY,
    lastState: S.LEGISLATIVE_CHANCELLOR,
    president: P,
    chancellor: C,
    fascistPolicies: 6,
    lastPolicy: "FASCIST",
  }) as { players: Record<string, { id?: string }> };
  for (const [name, role] of Object.entries(EVERY_ROLE)) end.players[name].id = role;
  game.send(end);
  const returnToLobby = page.getByRole("button", { name: "RETURN TO LOBBY" });
  await expect(returnToLobby).toBeVisible({ timeout: 30_000 });
  const opened = await alerts(page);
  expect(opened, "the victory screen is the only prompt").toHaveLength(1);
  expect(opened[0]).toContain("Fascists successfully passed six policies!");

  const sounds = (await heard(page, 12)).map((sound) => sound.name);
  expect(sounds).toEqual([
    "gameStart",
    "nominate",
    "voteCast",
    "voteCast",
    "votePassed",
    "cardDraw",
    "cardDiscard",
    "policyFascist",
    "power",
    "investigate",
    "policyFascist",
    "victory",
  ]);

  await returnToLobby.click();
  await expect.poll(() => game.urls.length).toBe(2);
  for (const url of game.urls) {
    const query = new URL(url).searchParams;
    expect(query.get("spectator"), url).toBe("true");
    expect(query.has("name"), url).toBe(false);
  }
});

test("a spectator joins a running game and never receives a secret", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  test.setTimeout(180_000);
  await recordAlerts(page);
  const table = await openTable(baseURL!, 7);
  try {
    const policies = (g: GameState) => g.liberalPolicies + g.fascistPolicies;
    await play(table, { until: (g) => policies(g) >= 1 });

    const frames: { state?: string; packet: unknown }[] = [];
    const sockets: string[] = [];
    page.on("websocket", (ws) => {
      if (!ws.url().includes("/game")) return;
      sockets.push(ws.url());
      ws.on("framereceived", (frame) => {
        const packet = JSON.parse(String(frame.payload));
        frames.push({ state: packet.state, packet });
      });
    });
    await watchLobby(page, table.lobby);
    await expect(page.locator(".game-screen")).toBeVisible();

    await play(table, { until: (g) => policies(g) >= 2 });
    await page.reload();
    await expect(page.locator(".game-screen")).toBeVisible();
    await play(table);

    await expect.poll(() => frames.some((f) => f.state && isVictory(f.state)), { timeout: 10_000 }).toBe(true);
    const end = frames.findIndex((f) => f.state && isVictory(f.state));
    const before = frames.slice(0, end);
    expect(before.filter((f) => f.state).length, "game frames before the end").toBeGreaterThan(5);
    expect(before.flatMap((f) => findSecrets(f.packet)), "secrets before the end").toEqual([]);
    const victory = frames[end].packet as GameState;
    for (const name of victory.playerOrder) {
      expect(victory.players[name].id, `${name}'s role at the end`).toBeTruthy();
    }

    expect(sockets.length, "the reload opened a new socket").toBeGreaterThanOrEqual(2);
    for (const url of sockets) {
      const query = new URL(url).searchParams;
      expect(query.get("spectator"), url).toBe("true");
      expect(query.has("name"), url).toBe(false);
    }
    for (const opened of await alerts(page)) {
      expect(opened, "only the victory screen opens").toContain("RETURN TO LOBBY");
    }
  } finally {
    table.close();
  }
});
