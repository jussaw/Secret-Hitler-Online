import { expect, test, type Page } from "@playwright/test";
import {
  LONG_STATUS,
  NARROW_PHONE,
  overflowX,
  overlaps,
  pageHeight,
  rowShift,
  smallFieldText,
  smallLinks,
  smallTargets,
  trackerReserved,
  withStatus,
  wrappedLabels,
  type Box,
} from "./layout";
import { LONGEST_DISCORD_NAME, signInPage, signedInMe, stubMe, uniqueName } from "./accounts";
import {
  LOGIN_STATES,
  accountTargets,
  actionLabels,
  createLobby,
  joinGuests,
  lobbyStatusCard,
  botRowMismatches,
  longestLineViewers,
  longestLogin,
  playerButtonRows,
  settle,
  skillRowLines,
  skillShown,
  startGame,
  waitForPlayers,
  watchLobby,
} from "./lobby";

// Runs in the phone projects; each sets its own viewport (360x740 or 412x915). phone-360 also
// checks the login page, the lobby and the game at NARROW_PHONE (320x568).

/** In phone-360, sets the narrowest phone's viewport; every other project skips the test. */
async function narrowPhone(page: Page): Promise<void> {
  test.skip(test.info().project.name !== "phone-360", "one phone project is enough");
  await page.setViewportSize(NARROW_PHONE);
}

for (const narrow of [false, true]) {
  const phone = narrow ? "a 320px phone" : "the phone";

  for (const state of LOGIN_STATES) {
    test(`the login page fits ${phone}, ${state}`, async ({ page }) => {
      if (narrow) await narrowPhone(page);
      const { width, height } = page.viewportSize()!;
      await longestLogin(page, state);
      await settle(page);
      // The 320px phone may scroll down, never sideways.
      if (!narrow) expect(await pageHeight(page), "scrollHeight").toBeLessThanOrEqual(height);
      expect(await wrappedLabels(page, ".login-screen"), "wrapped button labels").toEqual([]);
      expect(await smallFieldText(page, ".login-screen"), "small text in text fields").toEqual([]);
      const overflow = await overflowX(page);
      expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
      expect(overflow.offscreen, "past the edge").toEqual([]);
      // SIGN IN WITH DISCORD (a link signed out with Discord), TEST SIGN-IN, CHANGE NAME and Sign
      // out among them.
      expect(await smallTargets(page, "body"), "small touch targets").toEqual([]);
      // The header's links (the stats pages' header), which smallTargets does not measure.
      expect(await smallLinks(page, ".login-screen > header nav"), "small header links").toEqual([]);
      const account = page.locator(".login-account");
      const signedIn = state.startsWith("signed in");
      const targets = signedIn
        ? [account.getByRole("button", { name: "CHANGE NAME" }), account.getByRole("button", { name: "Sign out" })]
        : [
            account.getByRole(state === "signed out" ? "link" : "button", { name: "SIGN IN WITH DISCORD" }),
            account.getByRole("button", { name: "TEST SIGN-IN" }),
          ];
      for (const target of targets) await expect(target).toBeVisible();
      if (signedIn) {
        const { signOut, changeName } = await accountTargets(page);
        expect(overlaps(signOut, changeName), "Sign out's target over CHANGE NAME").toBe(false);
      }
    });
  }

  test(`the lobby and its portrait picker fit ${phone}`, async ({ page, baseURL }) => {
    if (narrow) await narrowPhone(page);
    const { width, height } = page.viewportSize()!;
    await signInPage(page, uniqueName("Host Player"));
    await page.goto("/");
    await page.getByRole("button", { name: "CREATE LOBBY" }).click();
    const portraits = page.locator("#icon.selectable:not(.disabled)");
    await portraits.first().waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // A portrait still loading is a few pixels tall, so measure the picker once every image has.
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLImageElement>("#alert-box img")).every((img) => img.complete)
    );
    let overflow = await overflowX(page);
    expect(overflow.scrollWidth, "scrollWidth with the picker open").toBeLessThanOrEqual(width);
    expect(overflow.offscreen, "picker past the edge").toEqual([]);
    expect(await smallTargets(page, "#alert-box"), "small targets in the picker").toEqual([]);

    await portraits.first().click();
    await page.getByRole("button", { name: "CONFIRM" }).click();
    const link = await page.locator("#linkText").inputValue();
    const guests = await joinGuests(baseURL!, new URL(link).searchParams.get("lobby")!, 9);
    try {
      await waitForPlayers(page, 10);
      await settle(page);
      // The 320px phone may scroll down, never sideways.
      if (!narrow) expect(await pageHeight(page), "scrollHeight").toBeLessThanOrEqual(height);
      expect(await wrappedLabels(page, ".lobby-screen"), "wrapped button labels").toEqual([]);
      expect(await smallFieldText(page, ".lobby-screen"), "small text in text fields").toEqual([]);
      overflow = await overflowX(page);
      expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
      expect(overflow.offscreen, "past the edge").toEqual([]);
      expect(await smallTargets(page, "body"), "small touch targets").toEqual([]);
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });

  test(`the host's, a guest's and spectators' lobbies fit ${phone}`, async ({ page, browser, baseURL }) => {
    test.setTimeout(120_000);
    if (narrow) await narrowPhone(page);
    // Each viewer has a page (and cookies) of its own, with the project's phone settings.
    const others = await Promise.all(Array.from({ length: 6 }, () => browser.newPage()));
    const [host, signedIn, signedOut, noDiscord, botHost, failed] = others;
    try {
      const { width, height } = page.viewportSize()!;
      for (const other of others) await other.setViewportSize({ width, height });
      const { sockets, viewers } = await longestLineViewers(baseURL!, {
        host,
        guest: page,
        signedIn,
        signedOut,
        noDiscord,
        botHost,
        failed,
      });
      try {
        for (const { viewer, page: viewerPage, buttons, player, skill, note } of viewers) {
          expect(await actionLabels(viewerPage), `the ${viewer}'s buttons`).toEqual(buttons);
          expect(await skillShown(viewerPage), `the ${viewer}'s bot skill`).toBe(skill);
          if (note !== undefined) await expect(viewerPage.locator("#lobby-note")).toHaveText(note);
          await settle(viewerPage);
          // The 320px phone may scroll down, never sideways, and its status line may take a third
          // line.
          if (!narrow) {
            expect(await pageHeight(viewerPage), `the ${viewer}'s scrollHeight`).toBeLessThanOrEqual(height);
          }
          const overflow = await overflowX(viewerPage);
          expect(overflow.scrollWidth, `the ${viewer}'s scrollWidth`).toBeLessThanOrEqual(width);
          expect(overflow.offscreen, `past the edge for the ${viewer}`).toEqual([]);
          expect(await smallTargets(viewerPage, "body"), `the ${viewer}'s small touch targets`).toEqual([]);
          expect(await wrappedLabels(viewerPage, ".lobby-screen"), `the ${viewer}'s wrapped button labels`).toEqual([]);
          // A bot's row (#70) is a person's row's size.
          expect(await botRowMismatches(viewerPage), `the ${viewer}'s bot rows`).toEqual([]);
          // The host's BOT SKILL row, or everyone else's line, is one line (#72).
          expect(await skillRowLines(viewerPage), `the ${viewer}'s bot skill row's lines`).toBe(1);
          // A player's four buttons are two rows of two on phones, held sideways too, where one row
          // would fit.
          if (player) {
            expect((await playerButtonRows(viewerPage)).rows, `the ${viewer}'s player buttons' rows`).toEqual([2, 2]);
            await viewerPage.setViewportSize({ width: height, height: width });
            const sideways = await playerButtonRows(viewerPage);
            expect(sideways.room, `room for one row sideways for the ${viewer}`).toBeGreaterThan(0);
            expect(sideways.rows, `the ${viewer}'s player buttons' rows sideways`).toEqual([2, 2]);
            await viewerPage.setViewportSize({ width, height });
          }
          expect(
            await smallFieldText(viewerPage, ".lobby-screen"),
            `small text in the ${viewer}'s text fields`
          ).toEqual([]);
          if (!narrow) {
            const status = await lobbyStatusCard(viewerPage);
            expect(
              Math.abs(status.height - status.minHeight),
              `the ${viewer}'s status card ${status.height}px against its min-height ${status.minHeight}px`
            ).toBeLessThanOrEqual(1);
          }
        }
      } finally {
        sockets.forEach((ws) => ws.close());
      }
    } finally {
      await Promise.all(others.map((other) => other.close()));
    }
  });

  test(`CHOOSE A NAME fits ${phone} on the login page and over the lobby, and PLAY INSTEAD then takes a seat at once`, async ({
    page,
    browser,
    baseURL,
  }) => {
    if (narrow) await narrowPhone(page);
    // The host plays in a page of its own (with the project's phone settings); this phone watches.
    const host = await browser.newPage();
    try {
      const code = await createLobby(host, uniqueName("Host Player"));
      // A first sign-in: the account has no name yet, so CHOOSE A NAME opens by itself.
      await signInPage(page, null);
      await page.goto(`/?lobby=${code}`);
      await checkNamePrompt(page, "CHOOSE A NAME", ["CONTINUE", "SIGN OUT"], "on the login page");

      // Back from SIGN IN TO PLAY, the spectator cookie takes the page back to watching: there it
      // opens over the lobby.
      await page.context().addCookies([
        { name: "lobby", value: code, url: baseURL! },
        { name: "spectator", value: "true", url: baseURL! },
      ]);
      await page.reload();
      await expect(page.locator(".lobby-screen")).toBeVisible();
      await checkNamePrompt(page, "CHOOSE A NAME", ["CONTINUE", "SIGN OUT"], "over the lobby");

      // With a name saved, still watching, PLAY INSTEAD takes the seat under it at once, with no
      // prompt.
      const field = page.getByRole("textbox", { name: "Your name" });
      const name = uniqueName("Sam");
      await field.fill(name);
      await page.getByRole("button", { name: "CONTINUE" }).click();
      await expect(field).toHaveCount(0);
      await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
      await expect(page.locator(`.lobby-players li.is-user[data-player="${name}"]`)).toBeVisible();
      await expect(field).toHaveCount(0);
    } finally {
      await host.close();
    }
  });

  test(`CHANGE NAME fits ${phone} on the login page`, async ({ page }) => {
    if (narrow) await narrowPhone(page);
    // A twelve-character name in wide capitals, as the field holds it when the prompt opens.
    await stubMe(page, signedInMe("WOLFGANG MAX", LONGEST_DISCORD_NAME));
    await page.goto("/");
    await page.locator(".login-account").getByRole("button", { name: "CHANGE NAME" }).click();
    await expect(page.getByRole("textbox", { name: "Your name" })).toHaveValue("WOLFGANG MAX");
    await checkNamePrompt(page, "CHANGE NAME", ["SAVE", "CANCEL"], "on the login page");
  });

  test(`CHANGE NAME fits ${phone} in the lobby`, async ({ page }) => {
    if (narrow) await narrowPhone(page);
    const name = uniqueName("Host Player");
    await createLobby(page, name);
    await page.locator(".lobby-actions").getByRole("button", { name: "CHANGE NAME" }).click();
    await expect(page.getByRole("textbox", { name: "Your name" })).toHaveValue(name);
    await checkNamePrompt(page, "CHANGE NAME", ["SAVE", "CANCEL"], "in the lobby");
  });
}

/**
 * The open name prompt `title`, measured as it rests (after its entrance animation, with the web
 * fonts): 44px targets, 16px field text, its two buttons `labels` (in order) unwrapped and on one
 * row, nothing past the window's sides, and a field that takes twelve characters at most. Leaves
 * the field empty.
 */
async function checkNamePrompt(page: Page, title: string, labels: [string, string], where: string) {
  const { width } = page.viewportSize()!;
  const at = `${title} ${where}`;
  await expect(page.locator("#alert-box h2"), at).toHaveText(title);
  await page.waitForFunction(() =>
    document.getElementById("alert-box")!.getAnimations().every((a) => a.playState === "finished")
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(await smallTargets(page, "#alert-box"), `small targets in ${at}`).toEqual([]);
  expect(await smallFieldText(page, "#alert-box"), `small text in the name field of ${at}`).toEqual([]);
  expect(await wrappedLabels(page, "#alert-box"), `wrapped button labels in ${at}`).toEqual([]);
  const buttons = await page
    .locator("#alert-box .name-prompt-buttons button")
    .evaluateAll((els) => els.map((el) => ({ label: (el.textContent ?? "").trim(), top: el.getBoundingClientRect().top })));
  expect(buttons.map((button) => button.label), `the buttons of ${at}`).toEqual(labels);
  expect(Math.abs(buttons[0].top - buttons[1].top), `${labels.join(" and ")} on one row in ${at}`).toBeLessThanOrEqual(
    0.5
  );
  const overflow = await overflowX(page);
  expect(overflow.scrollWidth, `scrollWidth with ${at}`).toBeLessThanOrEqual(width);
  expect(overflow.offscreen, `past the edge with ${at}`).toEqual([]);

  // The field takes twelve characters at most; jsdom does not apply maxLength to typing.
  const field = page.getByRole("textbox", { name: "Your name" });
  await field.fill("");
  await field.pressSequentially("ABCDEFGHIJKLM");
  await expect(field, `the field of ${at}`).toHaveValue("ABCDEFGHIJKL");
  await field.fill("");
}

test("phones put the roster first", async ({ page, baseURL }) => {
  const code = await createLobby(page, uniqueName("Host Player"));
  const guests = await joinGuests(baseURL!, code, 9);
  try {
    await waitForPlayers(page, 10);
    await settle(page);
    const [players, codeCard] = await page.evaluate(() =>
      [".lobby-players", ".lobby-code-card"].map((selector) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      })
    );
    expect(players.bottom, "roster above the code card").toBeLessThanOrEqual(codeCard.top);
  } finally {
    guests.forEach((ws) => ws.close());
  }
});

test("the busy bubble shows at 320px", async ({ page, baseURL }) => {
  await narrowPhone(page);
  const code = await createLobby(page, uniqueName("Host Player"));
  const guests = await joinGuests(baseURL!, code, 9, { pickLooks: false });
  try {
    await waitForPlayers(page, 10);
    await settle(page);
    // Picking rows are found by their (hidden) detail line, not by the bubble being there.
    const picking = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".lobby-players .roster-row"))
        .filter((row) => row.querySelector(".roster-detail")?.textContent === "Picking a look…")
        .map((row) => {
          const box = (el: Element | null) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
          };
          return {
            player: row.getAttribute("data-player"),
            row: box(row)!,
            bubble: box(row.querySelector(".roster-busy")),
          };
        })
    );
    expect(picking, "picking rows").toHaveLength(9);
    for (const { player, row, bubble } of picking) {
      expect(bubble, `${player}'s busy bubble`).not.toBeNull();
      expect(bubble!.width * bubble!.height, `${player}'s busy bubble's area`).toBeGreaterThan(0);
      expect(bubble!.left, `${player}'s bubble left`).toBeGreaterThanOrEqual(row.left);
      expect(bubble!.right, `${player}'s bubble right`).toBeLessThanOrEqual(row.right);
      expect(bubble!.top, `${player}'s bubble top`).toBeGreaterThanOrEqual(row.top);
      expect(bubble!.bottom, `${player}'s bubble bottom`).toBeLessThanOrEqual(row.bottom);
    }
  } finally {
    guests.forEach((ws) => ws.close());
  }
});

test("text fields use 16px text, so iOS Safari does not zoom in on focus", async ({ page }) => {
  await page.goto("/");
  const sizes = await page.$$eval("input", (inputs) =>
    inputs.map((input) => parseFloat(getComputedStyle(input).fontSize))
  );
  expect(sizes.length, "login text fields").toBeGreaterThan(0);
  for (const size of sizes) expect(size, "text field font size").toBeGreaterThanOrEqual(16);
});

/** The game page's parts, in viewport px, and the height the table keeps for the tracker. */
async function measureGame(page: Page) {
  const parts = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const one = (selector: string) => box(document.querySelector(selector)!);
    const endTerm = document.querySelector(".game-decks .end-term")!;
    return {
      roster: one(".game-body > .roster"),
      rows: Array.from(document.querySelectorAll(".roster-row"), box),
      // Detail lines shown: phones show the office as a tag beside the name instead.
      details: Array.from(document.querySelectorAll(".roster-detail")).filter(
        (el) => getComputedStyle(el).display !== "none"
      ).length,
      tracker: one(".game-table > .round-tracker"),
      decks: one(".game-decks"),
      endTerm: box(endTerm),
      endTermVisibility: getComputedStyle(endTerm).visibility,
      counts: one(".game-decks #pps-container"),
      boards: one("#board-container"),
    };
  });
  return { ...parts, trackerReserved: await trackerReserved(page) };
}

const centreX = (b: Box) => (b.left + b.right) / 2;

/**
 * Every check of the phone's game page: one column of the roster, the tracker, the decks row and
 * the boards, with no scroll in either direction, even with the longest status. With `scrollDown`,
 * the page may scroll down (but never sideways), and every other check still holds.
 */
async function checkGame(
  page: Page,
  {
    players,
    spectator = false,
    scrollDown = false,
  }: { players: number; spectator?: boolean; scrollDown?: boolean }
) {
  const { width, height } = page.viewportSize()!;

  // The page.
  if (!scrollDown) expect(await pageHeight(page), "scrollHeight").toBeLessThanOrEqual(height);
  const overflow = await overflowX(page);
  expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
  expect(overflow.offscreen, "past the edge").toEqual([]);

  const game = await measureGame(page);

  // Top to bottom: the roster, the tracker, the decks row and the boards, at full width.
  expect(game.roster.bottom, "roster above the tracker").toBeLessThanOrEqual(game.tracker.top + 1);
  expect(game.tracker.bottom, "tracker above the decks").toBeLessThanOrEqual(game.decks.top + 1);
  expect(game.decks.bottom, "decks above the boards").toBeLessThanOrEqual(game.boards.top + 1);
  expect(game.boards.right - game.boards.left, "boards at full width").toBeGreaterThanOrEqual(
    width - 24
  );

  // END TERM, centred over the counts box.
  expect(
    Math.abs(centreX(game.endTerm) - centreX(game.counts)),
    "END TERM centred on the counts box"
  ).toBeLessThanOrEqual(1);
  expect(game.endTerm.bottom, "END TERM above the counts box").toBeLessThanOrEqual(
    game.counts.top + 1
  );
  if (spectator) expect(game.endTermVisibility, "a spectator's END TERM").toBe("hidden");

  // The compact roster.
  expect(game.rows, "roster rows").toHaveLength(players);
  expect(game.details, "detail lines shown").toBe(0);
  game.rows.forEach((a, i) =>
    game.rows.slice(i + 1).forEach((b, j) => {
      expect(overlaps(a, b), `rows ${i} and ${i + 1 + j} overlap`).toBe(false);
    })
  );

  // The PRES/CHAN tag appearing beside a name moves no row.
  expect(
    await rowShift(page, ".roster-tag", "CHAN"),
    "a PRES/CHAN tag moves a row"
  ).toBeLessThanOrEqual(0.5);

  // A spectator's hidden END TERM is no target.
  expect(await smallTargets(page, ".game-screen"), "small touch targets").toEqual([]);

  // The tracker keeps the height reserved for it, so the longest status cannot make it grow or
  // the page scroll.
  expect(
    Math.abs(game.tracker.bottom - game.tracker.top - game.trackerReserved),
    `tracker height against its reserved ${game.trackerReserved}px`
  ).toBeLessThanOrEqual(0.5);
  // The step line stays on one line with 12% to spare, so a font that renders a little wider (as on
  // Linux) cannot wrap it. Its natural width is the sum of its steps and their margins.
  const steps = await page.evaluate(() => {
    const tracker = document.querySelector(".game-table > .round-tracker") as HTMLElement;
    const list = tracker.querySelector(".round-steps") as HTMLElement;
    const style = getComputedStyle(tracker);
    const parent = tracker.parentElement as HTMLElement;
    const parentStyle = getComputedStyle(parent);
    const available =
      parent.clientWidth -
      parseFloat(parentStyle.paddingLeft) -
      parseFloat(parentStyle.paddingRight) -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    let natural = 0;
    list.querySelectorAll(".round-step").forEach((li) => {
      natural += li.getBoundingClientRect().width + parseFloat(getComputedStyle(li).marginLeft);
    });
    return { natural, available, listHeight: list.getBoundingClientRect().height };
  });
  console.log(`step line natural ${steps.natural}px of ${steps.available}px`);
  expect(
    steps.natural,
    `step line's natural width ${steps.natural}px against ${steps.available}px available`
  ).toBeLessThanOrEqual(steps.available * 0.88);
  const long = await withStatus(page, LONG_STATUS);
  if (!scrollDown) {
    expect(long.height, "scrollHeight with the longest status").toBeLessThanOrEqual(height);
  }
  expect(
    Math.abs(long.tracker.bottom - long.tracker.top - game.trackerReserved),
    `tracker height with the longest status against its reserved ${game.trackerReserved}px`
  ).toBeLessThanOrEqual(0.5);
}

for (const players of [5, 10]) {
  test(`${players} players fit the phone without scrolling`, async ({ page, baseURL }) => {
    const guests = await startGame(page, baseURL!, players);
    try {
      await settle(page);
      await checkGame(page, { players });
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });
}

test("a 320px phone keeps the phone layout, and only scrolls down", async ({ page, baseURL }) => {
  test.skip(test.info().project.name !== "phone-360", "one phone project is enough");
  const guests = await startGame(page, baseURL!, 10);
  try {
    await settle(page);
    await page.setViewportSize(NARROW_PHONE);
    await settle(page);
    await checkGame(page, { players: 10, scrollDown: true });
  } finally {
    guests.forEach((ws) => ws.close());
  }
});

test("a phone held sideways gets the phone layout", async ({ page, baseURL }) => {
  const guests = await startGame(page, baseURL!, 10);
  try {
    await settle(page);
    const size = { width: 915, height: 412 };
    await page.setViewportSize(size);
    // The page may scroll down here, but not sideways, and it is still a touch screen.
    const overflow = await overflowX(page);
    expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(size.width);
    expect(overflow.offscreen, "past the edge").toEqual([]);
    const game = await measureGame(page);
    expect(game.roster.bottom, "roster above the tracker").toBeLessThanOrEqual(game.tracker.top + 1);
    expect(await smallTargets(page, ".game-screen"), "small touch targets").toEqual([]);
  } finally {
    guests.forEach((ws) => ws.close());
  }
});

test("a spectator's lobby and game fit the phone", async ({ page, browser, baseURL }) => {
  const { width } = page.viewportSize()!;
  // The host plays in a page of its own (with the project's phone settings); this phone watches.
  const host = await browser.newPage();
  const hostName = uniqueName("Host Player");
  const code = await createLobby(host, hostName);
  const guests = await joinGuests(baseURL!, code, 9);
  try {
    await watchLobby(page, code);
    await expect(page.locator("#lobby-status-text")).toBeVisible();
    await expect(page.locator("#lobby-status-text")).toHaveText(
      `You are watching. Waiting for ${hostName} to start the game.`
    );
    await waitForPlayers(page, 10);
    await settle(page);
    const overflow = await overflowX(page);
    expect(overflow.scrollWidth, "lobby scrollWidth").toBeLessThanOrEqual(width);
    expect(overflow.offscreen, "lobby past the edge").toEqual([]);
    expect(await smallTargets(page, "body"), "small touch targets in the lobby").toEqual([]);

    await host.getByRole("button", { name: "START GAME" }).click();
    await expect(page.locator(".game-screen")).toBeVisible();
    await settle(page);
    await checkGame(page, { players: 10, spectator: true });
  } finally {
    guests.forEach((ws) => ws.close());
    await host.close();
  }
});

test("a spectator's game keeps the phone layout at 320px", async ({ page, browser, baseURL }) => {
  test.skip(test.info().project.name !== "phone-360", "one phone project is enough");
  // The host plays in a page of its own (with the project's phone settings); this phone watches.
  const host = await browser.newPage();
  const code = await createLobby(host, uniqueName("Host Player"));
  const guests = await joinGuests(baseURL!, code, 9);
  try {
    await watchLobby(page, code);
    await waitForPlayers(page, 10);
    await host.getByRole("button", { name: "START GAME" }).click();
    await expect(page.locator(".game-screen")).toBeVisible();
    await settle(page);
    await page.setViewportSize(NARROW_PHONE);
    await settle(page);
    await checkGame(page, { players: 10, spectator: true, scrollDown: true });
  } finally {
    guests.forEach((ws) => ws.close());
    await host.close();
  }
});
