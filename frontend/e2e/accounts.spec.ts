import { expect, test, type Browser, type Page } from "@playwright/test";
import { signInPage, signedOutMe, stubMe, uniqueName } from "./accounts";
import { codeField, createLobby, joinLobby, lobbyCode, startGame, waitForPlayers, watchLobby } from "./lobby";
import { recordSounds, soundLog } from "./soundLog";

/**
 * Signing in, naming, renaming and watching, played in a real browser against the real server.
 * The tests' server has the test sign-in and no Discord, so a Discord sign-in is only checked by
 * its link, with /me stubbed (the server's own /auth/discord would answer 503).
 */

/** What a test opened, so `finally` closes it even when setup fails half way. */
class Opened {
  pages: Page[] = [];

  async page(browser: Browser): Promise<Page> {
    const page = await browser.newPage();
    this.pages.push(page);
    return page;
  }

  async close(): Promise<void> {
    await Promise.all(this.pages.map((p) => p.close()));
  }
}

/** A sign-in link to Discord for `code`: the client's own origin (an absolute URL), then the path. */
const discordLink = (code: string) => new RegExp(`^https?://[^/]+/auth/discord\\?lobby=${code}$`);

const prompt =(page: Page) => page.locator("#alert-box.appear-custom-alert");

test("a signed-out visitor can only watch", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const host = await opened.page(browser);
    const code = await createLobby(host, uniqueName("Host Player"));

    // The page is signed out, on a server with Discord sign-in (stubbed: the tests' server has none).
    await stubMe(page, signedOutMe({ discord: true }));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "CREATE LOBBY" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "JOIN", exact: true })).toBeDisabled();

    // The code switches WATCH on and goes into SIGN IN WITH DISCORD's link, but JOIN stays off.
    await codeField(page).fill(code);
    await expect(page.getByRole("button", { name: "JOIN", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "WATCH" })).toBeEnabled();
    await expect(page.getByRole("link", { name: "SIGN IN WITH DISCORD" })).toHaveAttribute(
      "href",
      discordLink(code)
    );

    await page.getByRole("button", { name: "WATCH" }).click();
    await expect(page.locator("#linkText")).toBeVisible();
    await expect(page.locator(".App-header .spectator-count")).toHaveText("1");
    await expect(page.getByRole("button", { name: "PLAY INSTEAD" })).toHaveCount(0);
  } finally {
    await opened.close();
  }
});

test("the first sign-in asks for a name, and then a lobby can be made", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "CREATE LOBBY" })).toBeDisabled();
  await page.getByRole("button", { name: "TEST SIGN-IN" }).click();

  await expect(prompt(page).locator("h2")).toHaveText("CHOOSE A NAME");
  const name = uniqueName("Newcomer");
  await page.getByRole("textbox", { name: "Your name" }).fill(name);
  await page.getByRole("button", { name: "CONTINUE" }).click();

  await expect(page.locator(".login-account-name")).toHaveText(name);
  await expect(page.getByRole("button", { name: "CREATE LOBBY" })).toBeEnabled();
  await page.getByRole("button", { name: "CREATE LOBBY" }).click();
  await page.locator("#icon.selectable:not(.disabled)").first().click();
  await page.getByRole("button", { name: "CONFIRM" }).click();
  await expect(page.locator(`.lobby-players li.is-user[data-player="${name}"]`)).toBeVisible();
});

test("a name is changed on the login page, and a taken one is refused", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const other = await opened.page(browser);
    const taken = uniqueName("Taken");
    await signInPage(other, taken);

    const name = uniqueName("Before");
    await signInPage(page, name);
    await page.goto("/");
    await expect(page.locator(".login-account-name")).toHaveText(name);

    await page.getByRole("button", { name: "CHANGE NAME" }).click();
    await expect(prompt(page).locator("h2")).toHaveText("CHANGE NAME");
    const field = page.getByRole("textbox", { name: "Your name" });
    await expect(field).toHaveValue(name);

    // Another account's name, in other letters: the error stays under the field, the prompt open.
    await field.fill(taken.toUpperCase());
    await page.getByRole("button", { name: "SAVE" }).click();
    await expect(page.locator(".prompt-error")).toHaveText("Another player already has that name.");
    await expect(page.locator(".login-account-name")).toHaveText(name);

    const renamed = uniqueName("After");
    await field.fill(renamed);
    await page.getByRole("button", { name: "SAVE" }).click();
    await expect(field).toHaveCount(0);
    await expect(page.locator(".login-account-name")).toHaveText(renamed);

    // The new name is the account's: it is there after a reload.
    await page.reload();
    await expect(page.locator(".login-account-name")).toHaveText(renamed);
  } finally {
    await opened.close();
  }
});

test("a rename shows in the lobby at once, and no join sound plays", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const host = await opened.page(browser);
    await recordSounds(host);
    await recordSounds(page);
    const code = await createLobby(host, uniqueName("Host Player"));
    const before = uniqueName("Before");
    await joinLobby(page, code, before);
    await waitForPlayers(host, 2);
    // play() records every call, aloud or not (no page here has had a gesture), so the log shows
    // the join the host's page just heard.
    const joins = async (p: Page) => (await soundLog(p)).filter((s) => s.name === "playerJoined").length;
    await expect.poll(() => joins(host)).toBeGreaterThanOrEqual(1);
    const hostJoins = await joins(host);
    const pageJoins = await joins(page);

    await page.getByRole("button", { name: "CHANGE NAME" }).click();
    const after = uniqueName("After");
    await page.getByRole("textbox", { name: "Your name" }).fill(after);
    await page.getByRole("button", { name: "SAVE" }).click();

    // Both pages show the new name and no old one, with no reload.
    for (const viewer of [page, host]) {
      await expect(viewer.locator(`.lobby-players li[data-player="${after}"]`)).toBeVisible();
      await expect(viewer.locator(`.lobby-players li[data-player="${before}"]`)).toHaveCount(0);
      await waitForPlayers(viewer, 2);
    }
    await expect(page.locator(`.lobby-players li.is-user[data-player="${after}"]`)).toBeVisible();

    // A rename is not a join: neither page played another join sound.
    await page.waitForTimeout(500);
    expect(await joins(host)).toBe(hostJoins);
    expect(await joins(page)).toBe(pageJoins);
  } finally {
    await opened.close();
  }
});

test("a game has no CHANGE NAME, and the server refuses a rename in it", async ({ page, baseURL }) => {
  const sockets = await startGame(page, baseURL!, 5);
  try {
    await expect(page.locator(".game-screen")).toBeVisible();
    await expect(page.getByRole("button", { name: "CHANGE NAME" })).toHaveCount(0);

    const answer = await page.request.post("/me/username", {
      headers: { "Content-Type": "application/json" },
      data: { username: uniqueName("Late") },
    });
    expect(answer.status()).toBe(403);
    expect(await answer.text()).toContain("You can't change your name during a game.");
  } finally {
    sockets.forEach((ws) => ws.close());
  }
});

test("a signed-out spectator's SIGN IN TO PLAY links to Discord and back to the lobby", async ({
  page,
  browser,
}) => {
  const opened = new Opened();
  try {
    const host = await opened.page(browser);
    const code = await createLobby(host, uniqueName("Host Player"));
    await stubMe(page, signedOutMe({ discord: true }));
    await watchLobby(page, code);
    expect(await lobbyCode(page)).toBe(code);

    const link = page.getByRole("link", { name: "SIGN IN TO PLAY" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", discordLink(code));
  } finally {
    await opened.close();
  }
});

test("a signed-in spectator plays instead at once, under the account's name", async ({ page, browser }) => {
  const opened = new Opened();
  try {
    const host = await opened.page(browser);
    const code = await createLobby(host, uniqueName("Host Player"));
    const name = uniqueName("Sam");
    await signInPage(page, name);
    await watchLobby(page, code);

    await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
    // No prompt asks for a name: the portrait picker opens, and the seat is the account's.
    await expect(page.getByRole("textbox", { name: "Your name" })).toHaveCount(0);
    await expect(page.locator("#icon.selectable:not(.disabled)").first()).toBeVisible();
    await page.locator("#icon.selectable:not(.disabled)").first().click();
    await page.getByRole("button", { name: "CONFIRM" }).click();

    await expect(page.locator(`.lobby-players li.is-user[data-player="${name}"]`)).toBeVisible();
    await waitForPlayers(host, 2);
    await expect(host.locator(`.lobby-players li[data-player="${name}"]`)).toBeVisible();
  } finally {
    await opened.close();
  }
});
