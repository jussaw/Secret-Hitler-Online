import { expect, test, type Browser, type Page } from "@playwright/test";
import { createLobby, joinGuests, lobbyCode, waitForPlayers, watchLobby } from "./lobby";

/** Joins `lobby` as `name` from the login form and picks the first free portrait. */
async function joinAs(page: Page, name: string, lobby: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your Name" }).first().fill(name);
  await page.getByRole("textbox", { name: "Lobby" }).fill(lobby);
  await page.getByRole("button", { name: "JOIN" }).click();
  await pickPortrait(page);
}

async function pickPortrait(page: Page): Promise<void> {
  await page.locator("#icon.selectable:not(.disabled)").first().click();
  await page.getByRole("button", { name: "CONFIRM" }).click();
}

/** A host page of its own (a desktop one, so the page under test can be a phone). */
async function hostPage(browser: Browser): Promise<{ host: Page; code: string }> {
  const host = await browser.newPage();
  return { host, code: await createLobby(host, "Host Player") };
}

const spectatorCookie = (page: Page) =>
  page
    .context()
    .cookies()
    .then((cookies) => cookies.find((c) => c.name === "spectator")?.value);

test("a player watches instead, and the others see the seat go", async ({ page, browser }) => {
  const { host, code } = await hostPage(browser);
  try {
    await joinAs(page, "Ann", code);
    await waitForPlayers(host, 2);

    await page.getByRole("button", { name: "WATCH INSTEAD" }).click();
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeVisible();
    expect(await spectatorCookie(page)).toBe("true");

    await expect(host.locator(".lobby-player-count")).toHaveText("1 / 10", { timeout: 10_000 });
    await expect(host.locator(".App-header .spectator-count")).toHaveText("1");
  } finally {
    await host.close();
  }
});

test("a spectator plays instead and picks a look", async ({ page, browser, context, baseURL }) => {
  const { host, code } = await hostPage(browser);
  try {
    await context.addCookies([{ name: "name", value: "Sam", url: baseURL! }]);
    await watchLobby(page, code);
    await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
    const field = page.getByRole("textbox", { name: "Your name" });
    await expect(field).toHaveValue("Sam");

    await page.getByRole("button", { name: "CONTINUE" }).click();
    const portrait = page.locator("#icon.selectable:not(.disabled)").first();
    await expect(portrait).toBeVisible();
    // An earlier bug swapped the picker for an empty box about a second later.
    await page.waitForTimeout(1500);
    await expect(portrait).toBeVisible();
    await portrait.click();
    await page.getByRole("button", { name: "CONFIRM" }).click();

    await expect(page.locator('.lobby-players li.is-user[data-player="Sam"]')).toBeVisible();
    expect(await spectatorCookie(page)).toBeUndefined();
    await expect(host.locator(".lobby-player-count")).toHaveText("2 / 10");
  } finally {
    await host.close();
  }
});

test("a full lobby turns PLAY INSTEAD off", async ({ page, browser, baseURL }) => {
  const { host, code } = await hostPage(browser);
  const guests = await joinGuests(baseURL!, code, 9);
  try {
    await watchLobby(page, code);
    await waitForPlayers(page, 10);
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeDisabled();
    await expect(page.locator(".lobby-full-note")).toHaveText(
      "The lobby is full (10 / 10). You can play when a seat frees up."
    );
  } finally {
    guests.forEach((ws) => ws.close());
    await host.close();
  }
});

test("a taken name keeps the spectator watching", async ({ page, browser }) => {
  const { host, code } = await hostPage(browser);
  try {
    await watchLobby(page, code);
    await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
    await page.getByRole("textbox", { name: "Your name" }).fill("Host Player");
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await expect(page.locator(".prompt-error")).toHaveText(
      "There is already a user with the name 'Host Player' in the lobby."
    );

    await page.getByRole("button", { name: "CANCEL" }).click();
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeEnabled();
  } finally {
    await host.close();
  }
});

test("the host passes on when the host watches instead", async ({ page, browser }) => {
  const code = await createLobby(page, "Host Player");
  const ann = await browser.newPage();
  try {
    await joinAs(ann, "Ann", code);
    await waitForPlayers(page, 2);

    await page.getByRole("button", { name: "WATCH INSTEAD" }).click();
    await expect(ann.getByRole("button", { name: "START GAME" })).toBeVisible({ timeout: 10_000 });
    await expect(ann.locator('.lobby-players li[data-player="Ann"] .roster-detail')).toHaveText("HOST");
  } finally {
    await ann.close();
  }
});

test("a reload keeps each switch", async ({ page, browser }) => {
  const { host, code } = await hostPage(browser);
  try {
    await joinAs(page, "Sam", code);
    await page.getByRole("button", { name: "WATCH INSTEAD" }).click();
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeVisible();
    await page.reload();
    await expect(page.locator(".lobby-screen")).toBeVisible();
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeVisible();

    // Coming back under the name "Sam" would take the old seat and look back, with no picker
    // (the server remembers both), so the new seat is under a new name.
    await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
    await page.getByRole("textbox", { name: "Your name" }).fill("Sammy");
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await pickPortrait(page);
    await expect(page.locator('.lobby-players li.is-user[data-player="Sammy"]')).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Your Name" }).first()).toHaveValue("Sammy");
    await expect(page.getByRole("textbox", { name: "Lobby" })).toHaveValue(code);
    expect(await lobbyCode(page)).toBe(code);
  } finally {
    await host.close();
  }
});

test("a game started right after someone watches instead seats only the connected players", async ({
  page,
  browser,
  baseURL,
}) => {
  // The host is `page` here: it presses START GAME and shows the game.
  const code = await createLobby(page, "Host Player");
  const guests = await joinGuests(baseURL!, code, 4);
  const ann = await browser.newPage();
  try {
    await joinAs(ann, "Ann", code);
    await waitForPlayers(page, 6);

    await ann.getByRole("button", { name: "WATCH INSTEAD" }).click();
    // Ann's spectator socket is open, so her player socket has closed. The server still holds her
    // seat for its grace window: the start below falls inside it.
    await expect(page.locator(".App-header .spectator-count")).toHaveText("1");
    await expect(page.locator('.lobby-players li[data-player="Ann"]')).toBeVisible();
    await page.getByRole("button", { name: "START GAME" }).click();

    await expect(page.locator(".game-screen")).toBeVisible();
    await expect(page.locator(".game-screen .roster-row")).toHaveCount(5);
    await expect(page.locator('.game-screen .roster-row[data-player="Ann"]')).toHaveCount(0);
  } finally {
    guests.forEach((ws) => ws.close());
    await ann.close();
  }
});
