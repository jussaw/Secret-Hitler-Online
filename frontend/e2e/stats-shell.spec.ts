import { expect, test, type Page } from "@playwright/test";
import { outcomeLabel } from "../src/stats/format";
import { EVENT_FIELDS, parseStatsData, STATS_GAMES_PATH, type Outcome } from "../src/stats/record";
import { routePath } from "../src/stats/routes";
import { NARROW_PHONE } from "./layout";
import { settle } from "./lobby";
import {
  bigStatsData,
  checkStatsPage,
  downloads,
  STATS_ONLY_STRINGS,
  statsPageProblems,
  statsSizesFor,
  stubStats,
} from "./stats";

/** The stats pages' shell: the header, the routes and the placeholders, at every size. */

const data = bigStatsData();
const tenSeatCpuGame = data.games.find((g) => g.seats.length === 10 && g.hasCpu)!;
const tenSeatGame = data.games.find((g) => g.seats.length === 10 && !g.hasCpu)!;
const newest = data.games[data.games.length - 1];

const desktopOnly = () => test.skip(test.info().project.name !== "desktop", "one browser is enough");

/** Checks the open page at every size its project checks. */
async function checkEverySize(page: Page): Promise<void> {
  for (const size of statsSizesFor(test.info().project.name, page.viewportSize()!)) {
    await checkStatsPage(page, size);
  }
}

/** Text in the page's main part, below the header. */
const inMain = (page: Page, text: string) => page.locator("main").getByText(text, { exact: true }).first();

/** Opens `path` with the big response stubbed, waits for `ready` in the main part, and settles the page. */
async function open(page: Page, path: string, ready: string): Promise<void> {
  await stubStats(page, data);
  await page.goto(path);
  await expect(inMain(page, ready)).toBeVisible();
  await settle(page);
}

test("bigStatsData() is a valid response", () => {
  desktopOnly();
  const big = bigStatsData();
  expect(() => parseStatsData(big)).not.toThrow();
  expect(JSON.stringify(bigStatsData()), "the same on every call").toBe(JSON.stringify(big));
  expect(big.games.length).toBe(400);
  expect(big.games.map((g) => g.id).slice(0, 2)).toEqual(["big-001", "big-002"]);
  expect(big.games[399].id).toBe("big-400");
  expect(big.players.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const player of big.players) expect(player.name).toMatch(/^W{10}\d\d$/);

  const outcomes = new Set<Outcome>(big.games.map((g) => g.outcome));
  expect([...outcomes].sort()).toEqual(
    ["FASCIST_POLICIES", "HITLER_ELECTED", "HITLER_EXECUTED", "LIBERAL_POLICIES", "UNFINISHED"].sort()
  );
  const types = new Set(big.games.flatMap((g) => g.events.map((e) => e.type)));
  expect([...types].sort()).toEqual(Object.keys(EVENT_FIELDS).sort());
  expect(big.games.some((g) => g.hasCpu && g.seats.some((s) => s.cpu && s.player === null))).toBe(true);
  expect(big.games.some((g) => g.seats.some((s) => s.cpu && s.role === "HITLER")), "a CPU Hitler").toBe(true);
  expect(big.games.find((g) => g.id === "big-025")!.outcome).toBe("UNFINISHED");
  const restored = big.games.find((g) => g.id === "big-200")!;
  expect(restored.complete).toBe(false);
  expect(restored.events[0].type).toBe("restored");

  for (let i = 1; i < big.games.length; i++) {
    expect(big.games[i].endedAt, `${big.games[i].id} after the one before`).toBeGreaterThan(big.games[i - 1].endedAt);
  }
  for (const game of big.games) {
    const last = game.events[game.events.length - 1];
    expect(last, `${game.id}'s last event`).toMatchObject({ type: "end", outcome: game.outcome });
    const enacts = game.events.filter((e) => e.type === "enact");
    const board = enacts.length > 0 ? enacts[enacts.length - 1] : { liberal: 0, fascist: 0 };
    expect([board.liberal, board.fascist], `${game.id}'s board`).toEqual([game.liberalPolicies, game.fascistPolicies]);
    const minutes = (game.endedAt - game.startedAt) / 60_000;
    expect(minutes >= 15 && minutes <= 60, `${game.id} lasts ${minutes} minutes`).toBe(true);

    // The election tracker moves up one at a time from 0 after every policy, and only a
    // policy puts it back: a third failed election, or a veto accepted at 2, is 3 and a chaos
    // policy. A record that starts at a restore may find it anywhere at first.
    let tracker: number | null = game.complete ? 0 : null;
    for (let i = 0; i < game.events.length; i++) {
      const event = game.events[i];
      if (event.type === "tracker") {
        if (tracker !== null) expect(event.value, `${game.id}'s tracker at event ${i}`).toBe(tracker + 1);
        tracker = event.value;
        const next = game.events[i + 1];
        if (event.value === 3) expect(next, `${game.id}'s chaos at event ${i + 1}`).toMatchObject({ type: "enact", by: "chaos" });
      } else if (event.type === "enact") {
        if (event.by === "chaos") expect(tracker, `${game.id}'s tracker before chaos at event ${i}`).toBe(3);
        tracker = 0;
      }
    }
  }
});

test("the page check catches what it should", async ({ page }) => {
  desktopOnly();
  const at = async (width: number, height: number, body: string) => {
    await page.setViewportSize({ width, height });
    await page.setContent(`
      <style>html, body { margin: 0; overflow-x: hidden; } p { margin: 0; font-size: 16px; }</style>
      <div class="stats-screen"><main class="stats-main">${body}</main></div>`);
    return statsPageProblems(page);
  };
  const wide = `<div id="wide" style="width: 2000px; height: 10px"></div>`;

  for (const [width, height] of [
    [360, 740],
    [1600, 900],
  ]) {
    expect((await at(width, height, wide)).sideways.join(" "), "a wide div").toContain("div#wide");
    expect(
      (await at(width, height, `<div style="width: 300px; overflow-x: auto">${wide}</div>`)).sideways,
      "a wide div in a box that scrolls sideways"
    ).toEqual([]);
    await page.setContent(`
      <style>html, body { margin: 0; overflow-x: hidden; }</style>
      <div class="stats-screen"><main class="stats-main" style="overflow-y: auto">${wide}</main></div>`);
    expect((await statsPageProblems(page)).sideways.join(" "), "a wide div in a vertical scroller").toContain(
      "div#wide"
    );
  }

  const controls = `
    <button id="short" style="height: 30px; width: 100px">Short</button>
    <p>Read the <a id="inline" href="/x">rules</a> first.</p>
    <table><tr>
      <td>Name <a id="cell" href="/y" style="display: inline-block; height: 20px">Ann</a></td>
      <td><p>Name <a id="cell-sentence" href="/z">Bo</a> won</p></td>
    </tr></table>
    <input id="small" type="text" style="font-size: 14px; height: 50px; width: 200px">`;
  const phone = await at(360, 740, controls);
  expect(phone.smallTargets.join(" ")).toContain("button#short");
  expect(phone.smallTargets.join(" ")).not.toContain("a#inline");
  expect(phone.smallTargets.join(" ")).toContain("a#cell ");
  expect(phone.smallTargets.join(" "), "a link in a sentence in a table cell").toContain("a#cell-sentence");
  expect(phone.smallText.join(" ")).toContain("input#small");
  expect((await at(360, 740, "<p>No fields here.</p>")).smallText).toEqual([]);

  const desktop = await at(1600, 900, controls);
  expect(desktop.smallTargets).toEqual([]);
  expect(desktop.smallText).toEqual([]);
});

test.describe("every page fits every size", () => {
  test("the stats home", async ({ page }) => {
    test.slow();
    await open(page, "/stats", "LATEST GAMES");
    await checkEverySize(page);
  });

  test("GAMES' placeholder", async ({ page }) => {
    test.slow();
    await open(page, "/stats/games", "GAMES");
    await checkEverySize(page);
  });

  test("a game's page", async ({ page }) => {
    test.slow();
    await open(page, routePath({ page: "game", id: tenSeatCpuGame.id }), "Bot 1");
    await checkEverySize(page);
  });

  test("an unknown game", async ({ page }) => {
    test.slow();
    await open(page, "/stats/games/no-such-game", "This game was not found.");
    await checkEverySize(page);
  });

  test("PLAYERS", async ({ page }) => {
    test.slow();
    await open(page, "/stats/players", "PLAYERS");
    await checkEverySize(page);
  });

  test("a player's page", async ({ page }) => {
    test.slow();
    await open(page, "/stats/players/1", "PLAYER");
    await checkEverySize(page);
  });

  test("an unknown address", async ({ page }) => {
    test.slow();
    await open(page, "/stats/nowhere", "This page was not found.");
    await checkEverySize(page);
  });

  test("the loading line", async ({ page }) => {
    test.slow();
    await page.route(`**${STATS_GAMES_PATH}`, () => {
      // Never answered.
    });
    await page.goto("/stats");
    await expect(page.getByRole("status")).toHaveText("Loading the games…");
    await settle(page);
    await checkEverySize(page);
  });

  test("the error line", async ({ page }) => {
    test.slow();
    await page.route(`**${STATS_GAMES_PATH}`, (route) => route.fulfill({ status: 503, body: "" }));
    await page.goto("/stats");
    await expect(page.getByRole("alert")).toHaveText("Could not load the games. Reload the page to try again.");
    await settle(page);
    await checkEverySize(page);
  });
});

test("a twelve-character name stays inside its line at 320px", async ({ page }) => {
  test.slow();
  await page.setViewportSize(NARROW_PHONE);
  await open(page, routePath({ page: "game", id: tenSeatGame.id }), tenSeatGame.seats[0].name);
  const { seats, names } = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const line = document.querySelector(".game-seats")!;
    return { seats: box(line), names: Array.from(line.querySelectorAll(".player-name"), box) };
  });
  expect(names.length).toBe(10);
  for (const name of names) {
    expect(name.left, "a name's left edge").toBeGreaterThanOrEqual(seats.left - 1);
    expect(name.right, "a name's right edge").toBeLessThanOrEqual(seats.right + 1);
  }
  expect((await statsPageProblems(page)).sideways).toEqual([]);
});

test("the game's first download holds no stats code", async ({ browser, baseURL }) => {
  desktopOnly();
  const isClip = (url: string) => /\.(ogg|mp3)(\?|$)/.test(url);

  const game = await browser.newPage({ baseURL });
  const gameFiles = await downloads(game, "/");
  for (const file of gameFiles) {
    for (const text of STATS_ONLY_STRINGS) expect(file.body.includes(text), `${file.url} holds "${text}"`).toBe(false);
  }
  expect(gameFiles.some((f) => isClip(f.url)), "the game fetches its sound clips").toBe(true);
  await game.close();

  const stats = await browser.newPage({ baseURL });
  await stubStats(stats, data);
  const statsFiles = await downloads(stats, "/stats");
  expect(
    statsFiles.some((f) => f.body.includes(STATS_GAMES_PATH)),
    "a script of the stats chunk"
  ).toBe(true);
  expect(statsFiles.filter((f) => isClip(f.url)).map((f) => f.url), "no sound clip on the stats").toEqual([]);
  await stats.close();
});

test("the header moves between the pages in place", async ({ page }) => {
  desktopOnly();
  await open(page, "/stats", "LATEST GAMES");
  await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true));
  const nav = page.getByRole("navigation", { name: "Stats pages" });
  const current = nav.locator('[aria-current="page"]');

  for (const [label, path, ready] of [
    ["GAMES", "/stats/games", "Coming in a later update."],
    ["PLAYERS", "/stats/players", "Coming in a later update."],
    ["STATS", "/stats", "LATEST GAMES"],
  ]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(current).toHaveText(label);
    await expect(page.getByText(ready, { exact: true })).toBeVisible();
  }
  await page.locator(`a[href="${routePath({ page: "game", id: newest.id })}"]`).click();
  await expect(page).toHaveURL(routePath({ page: "game", id: newest.id }));
  await expect(current).toHaveText("GAMES");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(outcomeLabel(newest));
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);

  await nav.getByRole("link", { name: "PLAY", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "CREATE LOBBY" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBeUndefined();
});

test("back, forward, reload and a deep link", async ({ page }) => {
  desktopOnly();
  const gamePath = routePath({ page: "game", id: newest.id });
  const heading = page.getByRole("heading", { level: 1 });
  await open(page, "/stats", "LATEST GAMES");
  await page.locator(`a[href="${gamePath}"]`).click();
  await expect(heading).toHaveText(outcomeLabel(newest));

  await page.goBack();
  await expect(page).toHaveURL("/stats");
  await expect(page.getByText("LATEST GAMES", { exact: true })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(gamePath);
  await expect(heading).toHaveText(outcomeLabel(newest));

  // A reload asks the server for the game's address, which its fallback answers with the page.
  await page.reload();
  await expect(page).toHaveURL(gamePath);
  await expect(heading).toHaveText(outcomeLabel(newest));
  await expect(page).toHaveTitle("Game · Secret Hitler Online");

  await page.goto("/stats/players/1");
  await expect(inMain(page, "PLAYER")).toBeVisible();
});
