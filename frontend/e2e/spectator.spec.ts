import { expect, test, type Page } from "@playwright/test";
import { LobbyState as S, type GameState } from "../src/types";
import { isVictory, openTable, play } from "./driveGame";
import {
  EVERY_ROLE,
  TEN,
  WATCHED_LOBBY,
  gamePacket,
  openFakeGame,
  openFakeWatch,
  spectatorPacket,
} from "./fakeGame";
import { DESKTOP_SIZES, NARROW_WINDOWS, overlaps } from "./layout";
import { settle, watchLobby } from "./lobby";
import { findSecrets } from "./secrets";
import { heard, recordSounds } from "./soundLog";

/**
 * Logs the full text of every prompt that opens (#alert-box gains appear-custom-alert), so a test
 * can prove a spectator sees none before the victory screen. The log lives in the test, so it
 * keeps what opened before a reload.
 */
async function recordAlerts(page: Page): Promise<string[]> {
  const opened: string[] = [];
  await page.exposeFunction("__alertOpened", (text: string) => opened.push(text));
  await page.addInitScript(() => {
    const w = window as unknown as { __alertOpened(text: string): void };
    let open = false;
    new MutationObserver(() => {
      const box = document.querySelector("#alert-box.appear-custom-alert");
      if (box && !open) w.__alertOpened((box.textContent ?? "").trim());
      open = box !== null;
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
  return opened;
}

/**
 * Logs every text the status line shows, in order, skipping repeats, the empty line and the
 * placeholder ("---") the game screen opens with.
 */
async function recordStatus(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __status: string[] };
    w.__status = [];
    new MutationObserver(() => {
      const text = document.querySelector("#status-bar-text")?.textContent ?? "";
      if (text && text !== "---" && text !== w.__status[w.__status.length - 1]) w.__status.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

const statusLog = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __status: string[] }).__status);

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
  const alerts = await recordAlerts(page);
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
  expect(alerts, "prompts before the end").toEqual([]);

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
  expect(alerts, "the victory screen is the only prompt").toHaveLength(1);
  expect(alerts[0]).toContain("Fascists successfully passed six policies!");

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

test("a spectator who leaves gets the name cookie back in the JOIN form", async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  await context.addCookies([{ name: "name", value: "Ann", url: baseURL! }]);
  const joinName = page.getByRole("textbox", { name: "Your Name" }).first();

  const game = await openFakeWatch(page);
  await page.getByRole("button", { name: "LEAVE LOBBY" }).click();
  await expect(page.getByRole("button", { name: "WATCH" })).toBeVisible();
  await expect(joinName, "after LEAVE LOBBY").toHaveValue("Ann");

  // The same after the server goes away and every reconnect fails.
  const sockets = game.urls.length;
  await page.getByRole("button", { name: "WATCH" }).click();
  await expect.poll(() => game.urls.length).toBe(sockets + 1);
  game.send(WATCHED_LOBBY);
  await expect(page.getByText(`Players (${TEN.length}/10)`)).toBeVisible();
  game.down(true);
  await expect(page.getByText("Disconnected from the lobby.")).toBeVisible();
  await expect(joinName, "after a disconnect").toHaveValue("Ann");
});

/**
 * A socket's first packet describes the table as it is, so a spectator who joins or reloads
 * mid-game is not shown again what has already happened: no policy, tracker or result line and
 * no vote reveal, only what the table waits for.
 */
for (const { name, first, waiting } of [
  {
    name: "after an investigation",
    first: spectatorPacket({
      state: S.POST_LEGISLATIVE,
      lastState: S.PP_INVESTIGATE,
      president: TEN[1],
      chancellor: TEN[2],
      targetUser: TEN[5],
      liberalPolicies: 2,
      fascistPolicies: 1,
      lastPolicy: "FASCIST",
    }),
    waiting: `Waiting for ${TEN[1]} to end their term.`,
  },
  {
    name: "after a vote",
    first: spectatorPacket({
      state: S.LEGISLATIVE_PRESIDENT,
      president: TEN[1],
      chancellor: TEN[2],
      userVotes: Object.fromEntries(TEN.map((player) => [player, true])),
    }),
    waiting: `Waiting for ${TEN[1]} to choose a policy to discard.`,
  },
]) {
  test(`a spectator who joins ${name} sees only what the table waits for`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one browser is enough");
    await recordStatus(page);
    await openFakeWatch(page, first);
    await expect(page.locator("#status-bar-text")).toHaveText(waiting, { timeout: 30_000 });
    expect(await statusLog(page)).toEqual([waiting]);
  });
}

test("a held status line from a cleared queue does not cut the next one short", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  await page.clock.install();
  const game = await openFakeWatch(page);
  const [, P, C] = TEN;
  const status = page.locator("#status-bar-text");
  const eventBar = page.locator("#event-bar.appear-eventbar");
  game.send(spectatorPacket({ president: P }));
  await expect(status).toHaveText(`Waiting for ${P} to nominate a chancellor.`);

  // From here the page's clock moves only when the test moves it.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  game.send(
    spectatorPacket({
      state: S.POST_LEGISLATIVE,
      lastState: S.LEGISLATIVE_CHANCELLOR,
      president: P,
      chancellor: C,
      fascistPolicies: 1,
      lastPolicy: "FASCIST",
    })
  );
  await page.clock.runFor(400);
  await expect(status).toHaveText("A fascist policy was enacted.");
  await page.clock.runFor(1600); // 2 s into the line's 3 s hold

  // The server goes away: the client gives up and clears its queue. WATCH again at once.
  game.down(true);
  await expect(page.getByText("Disconnected from the lobby.")).toBeVisible();
  game.down(false);
  const sockets = game.urls.length;
  await page.getByRole("button", { name: "WATCH" }).click();
  await expect.poll(() => game.urls.length).toBe(sockets + 1);
  game.send(WATCHED_LOBBY);
  await expect(page.getByText(`Players (${TEN.length}/10)`)).toBeVisible();

  // The next policy holds its line 3 s, then the board moves (0.5 s) and the power's event bar
  // shows. The old line's hold ends 1 s in, and must not end this one.
  game.send(
    spectatorPacket({ state: S.PP_INVESTIGATE, president: P, chancellor: C, fascistPolicies: 2, lastPolicy: "FASCIST" })
  );
  await page.clock.runFor(2500);
  await expect(eventBar, "2.5 s in, the policy line still holds").toHaveCount(0);
  await page.clock.runFor(1500);
  await expect(eventBar, "4 s in, the power's event bar shows").toHaveText("PRESIDENTIAL POWER");
});

test("a spectator joins a running game and never receives a secret", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  test.setTimeout(180_000);
  // The page's clock runs as usual until the end, when the test runs it on (below).
  await page.clock.install();
  const alerts = await recordAlerts(page);
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

    // The spectator's animations trail the game, so run them on to the victory screen.
    const returnToLobby = page.getByRole("button", { name: "RETURN TO LOBBY" });
    await expect(async () => {
      await page.clock.runFor(10_000);
      await expect(returnToLobby).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 60_000 });
    expect(alerts, "only the victory screen opens").toHaveLength(1);
    expect(alerts[0], "only the victory screen opens").toContain("RETURN TO LOBBY");
  } finally {
    table.close();
  }
});

/**
 * The spectator count, the header, its title's text and the sound control, as boxes, and whether
 * the count is what a pointer at its centre hits (for its tooltip).
 */
function countFit(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | Range) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const header = document.querySelector("header")!;
    const count = header.querySelector<HTMLElement>(".spectator-count")!;
    const title = document.createRange();
    title.selectNodeContents(
      Array.from(header.childNodes).find((node) => node.nodeType === 3 && node.textContent!.trim())!
    );
    const c = count.getBoundingClientRect();
    const hit = document.elementFromPoint((c.left + c.right) / 2, (c.top + c.bottom) / 2);
    const height = header.getBoundingClientRect().height;
    count.style.display = "none";
    const heightWithout = header.getBoundingClientRect().height;
    count.style.display = "";
    return {
      header: box(header),
      count: box(count),
      icon: box(count.querySelector("svg")!),
      title: box(title),
      speaker: box(header.querySelector(".sound-control")!),
      hitsCount: hit !== null && count.contains(hit),
      height,
      heightWithout,
    };
  });
}

test("the spectator count fits every header", async ({ page, isMobile }) => {
  test.setTimeout(240_000);
  const sizes = isMobile ? [page.viewportSize()!] : [...DESKTOP_SIZES, ...NARROW_WINDOWS];
  const game = await openFakeGame(page);
  await settle(page);
  // The title's own font, not a wider fallback, is what the count must clear.
  await page.evaluate(async () => {
    await document.fonts.load(getComputedStyle(document.querySelector("header")!).font, "SECRET-HITLER.ONLINE");
  });
  const icon = Object.fromEntries(TEN.map((name, i) => [name, `p${i + 1}`]));
  const check = async (where: string) => {
    for (const size of sizes) {
      if (!isMobile) await page.setViewportSize(size);
      const at = `${where} at ${size.width}x${size.height}`;
      const fit = await countFit(page);
      expect(fit.count.left, `count inside the header, ${at}`).toBeGreaterThanOrEqual(fit.header.left);
      expect(fit.count.right, `count inside the header, ${at}`).toBeLessThanOrEqual(fit.header.right);
      expect(fit.icon.top, `eye inside the header, ${at}`).toBeGreaterThanOrEqual(fit.header.top - 0.5);
      expect(fit.icon.bottom, `eye inside the header, ${at}`).toBeLessThanOrEqual(fit.header.bottom + 0.5);
      expect(overlaps(fit.count, fit.title), `count clear of the title, ${at}`).toBe(false);
      expect(overlaps(fit.count, fit.speaker), `count clear of the speaker, ${at}`).toBe(false);
      expect(fit.height, `header height, ${at}`).toBeCloseTo(fit.heightWithout, 1);
      expect(fit.hitsCount, `a pointer at the count's centre reaches it, ${at}`).toBe(true);
    }
  };

  for (const spectatorCount of [1, 12]) {
    game.send({ type: "lobby", usernames: TEN, icon, spectatorCount });
    await expect(page.locator("header .spectator-count")).toHaveText(String(spectatorCount));
    await check(`lobby watched by ${spectatorCount}`);
  }
  for (const spectatorCount of [1, 12]) {
    game.send({ ...gamePacket({ president: TEN[1] }), spectatorCount });
    await expect(page.locator(".game-screen header .spectator-count")).toHaveText(String(spectatorCount));
    await check(`game watched by ${spectatorCount}`);
  }
});
