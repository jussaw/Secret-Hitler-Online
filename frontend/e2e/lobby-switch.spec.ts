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

/**
 * What a test opened, so `finally` closes it even when setup fails half way. `browser.newPage()`
 * takes on the project's device, so a second page is a second phone on the phone project.
 */
class Opened {
  pages: Page[] = [];
  sockets: WebSocket[] = [];

  async page(browser: Browser): Promise<Page> {
    const page = await browser.newPage();
    this.pages.push(page);
    return page;
  }

  /** A second page that creates a lobby as "Host Player". */
  async host(browser: Browser): Promise<{ host: Page; code: string }> {
    const host = await this.page(browser);
    return { host, code: await createLobby(host, "Host Player") };
  }

  async guests(baseURL: string, lobby: string, count: number): Promise<void> {
    this.sockets.push(...(await joinGuests(baseURL, lobby, count)));
  }

  async close(): Promise<void> {
    this.sockets.forEach((ws) => ws.close());
    await Promise.all(this.pages.map((p) => p.close()));
  }
}

/** The portrait alt text of `name`'s row on `page`. */
const faceOf = (page: Page, name: string) =>
  page.locator(`.lobby-players li[data-player="${name}"] .roster-face`).getAttribute("alt");

const spectatorCookie = (page: Page) =>
  page
    .context()
    .cookies()
    .then((cookies) => cookies.find((c) => c.name === "spectator")?.value);

test("a player watches instead, and the others see the seat go", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const { host, code } = await opened.host(browser);
    await joinAs(page, "Ann", code);
    await waitForPlayers(host, 2);

    await page.getByRole("button", { name: "WATCH INSTEAD" }).click();
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeVisible();
    expect(await spectatorCookie(page)).toBe("true");

    await expect(host.locator(".lobby-player-count")).toHaveText("1 / 10", { timeout: 10_000 });
    await expect(host.locator(".App-header .spectator-count")).toHaveText("1");
  } finally {
    await opened.close();
  }
});

test("a spectator plays instead and picks a look", async ({ page, browser, context, baseURL }) => {
  const opened = new Opened();
  try {
    const { host, code } = await opened.host(browser);
    await context.addCookies([{ name: "name", value: "Sam", url: baseURL! }]);
    await watchLobby(page, code);
    await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
    await expect(page.getByRole("textbox", { name: "Your name" })).toHaveValue("Sam");

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
    await opened.close();
  }
});

test("a full lobby turns PLAY INSTEAD off", async ({ page, browser, baseURL }) => {
  const opened = new Opened();
  try {
    const { code } = await opened.host(browser);
    await opened.guests(baseURL!, code, 9);
    await watchLobby(page, code);
    await waitForPlayers(page, 10);
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeDisabled();
    await expect(page.locator(".lobby-full-note")).toHaveText(
      "The lobby is full (10 / 10). You can play when a seat frees up."
    );
  } finally {
    await opened.close();
  }
});

test("a taken name keeps the spectator watching", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const { code } = await opened.host(browser);
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
    await opened.close();
  }
});

test("the host passes on when the host watches instead", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const code = await createLobby(page, "Host Player");
    const ann = await opened.page(browser);
    await joinAs(ann, "Ann", code);
    await waitForPlayers(page, 2);

    await page.getByRole("button", { name: "WATCH INSTEAD" }).click();
    await expect(ann.getByRole("button", { name: "START GAME" })).toBeVisible({ timeout: 10_000 });
    await expect(ann.locator('.lobby-players li[data-player="Ann"] .roster-detail')).toHaveText("HOST");
  } finally {
    await opened.close();
  }
});

/** No portrait picker is in the alert box, now and 1.5 s on (a ghost picker came late). */
async function expectNoPicker(page: Page): Promise<void> {
  const picker = page.locator("#alert-box #icon-container");
  await expect(picker).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(picker).toHaveCount(0);
}

test("a reload keeps each switch, and coming back as Sam keeps the look", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const { host, code } = await opened.host(browser);
    await joinAs(page, "Sam", code);
    const look = await faceOf(page, "Sam");
    await page.getByRole("button", { name: "WATCH INSTEAD" }).click();
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeVisible();
    await page.reload();
    await expect(page.locator(".lobby-screen")).toBeVisible();
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toBeVisible();

    // The seat is certainly gone now, so this return is outside the 3 s grace window. The server
    // still remembers the portrait: Sam gets it back and no picker opens.
    await expect(host.locator(".lobby-player-count")).toHaveText("1 / 10", { timeout: 10_000 });
    await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
    await expect(page.getByRole("textbox", { name: "Your name" })).toHaveValue("Sam");
    await page.getByRole("button", { name: "CONTINUE" }).click();
    await expect(page.locator('.lobby-players li.is-user[data-player="Sam"]')).toBeVisible();
    expect(await faceOf(page, "Sam")).toBe(look);
    await expectNoPicker(page);
    await expect(page.locator('.lobby-players li[data-player="Host Player"] .roster-detail')).toHaveText(
      "HOST"
    );

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Your Name" }).first()).toHaveValue("Sam");
    await expect(page.getByRole("textbox", { name: "Lobby" })).toHaveValue(code);
    expect(await lobbyCode(page)).toBe(code);
  } finally {
    await opened.close();
  }
});

test("the host comes back inside the grace window and is still the host", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const code = await createLobby(page, "Host Player");
    const ann = await opened.page(browser);
    await joinAs(ann, "Ann", code);
    await waitForPlayers(page, 2);
    const look = await faceOf(ann, "Host Player");
    // Ann's page records whether the host's seat ever went (the count dropping to 1 / 10).
    await ann.evaluate(() => {
      const w = window as unknown as { __seatWentAway: boolean };
      w.__seatWentAway = false;
      new MutationObserver(() => {
        if (document.querySelector(".lobby-player-count")?.textContent === "1 / 10") w.__seatWentAway = true;
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });

    await page.getByRole("button", { name: "WATCH INSTEAD" }).click();
    await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
    await page.getByRole("button", { name: "CONTINUE" }).click();

    await expect(page.getByRole("button", { name: "START GAME" })).toBeVisible();
    await expect(page.locator('.lobby-players li[data-player="Host Player"] .roster-detail')).toHaveText(
      "HOST"
    );
    await expectNoPicker(page);
    const order = () => ann.locator(".lobby-players li.roster-row").evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-player"))
    );
    expect(await order()).toEqual(["Host Player", "Ann"]);
    expect(await faceOf(ann, "Host Player")).toBe(look);
    // Proof that the whole switch fell inside the window: the seat never went from Ann's view.
    expect(
      await ann.evaluate(() => (window as unknown as { __seatWentAway: boolean }).__seatWentAway),
      "the return missed the grace window, so this test proves nothing"
    ).toBe(false);
  } finally {
    await opened.close();
  }
});

test("a game started right after someone watches instead seats only the connected players", async ({
  page,
  browser,
  baseURL,
}) => {
  const opened = new Opened();
  try {
    // The host is `page` here: it presses START GAME and shows the game.
    const code = await createLobby(page, "Host Player");
    await opened.guests(baseURL!, code, 4);
    const ann = await opened.page(browser);
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
    await opened.close();
  }
});
