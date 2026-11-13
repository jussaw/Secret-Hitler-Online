import { expect, test, type Page } from "@playwright/test";
import {
  LONG_STATUS,
  NARROW_PHONE,
  overflowX,
  overlaps,
  pageHeight,
  rowShift,
  smallFieldText,
  smallTargets,
  trackerReserved,
  withStatus,
  wrappedLabels,
  type Box,
} from "./layout";
import {
  createLobby,
  joinGuests,
  lobbyStatusCard,
  longestLineLobby,
  settle,
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

  test(`the login page fits ${phone}`, async ({ page }) => {
    if (narrow) await narrowPhone(page);
    const { width } = page.viewportSize()!;
    await page.goto("/");
    await settle(page);
    const overflow = await overflowX(page);
    expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
    expect(overflow.offscreen, "past the edge").toEqual([]);
    expect(await smallTargets(page, "body"), "small touch targets").toEqual([]);
  });

  test(`the lobby and its portrait picker fit ${phone}`, async ({ page, baseURL }) => {
    if (narrow) await narrowPhone(page);
    const { width, height } = page.viewportSize()!;
    await page.goto("/");
    await page.getByRole("textbox", { name: "Your Name" }).last().fill("Host Player");
    await page.getByRole("button", { name: "CREATE LOBBY" }).click();
    const portraits = page.locator("#icon.selectable:not(.disabled)");
    await portraits.first().waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
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

  test(`the host's, a guest's and a spectator's lobby fit ${phone}`, async ({ page, browser, baseURL }) => {
    if (narrow) await narrowPhone(page);
    // Each viewer has a page (and cookies) of its own, with the project's phone settings.
    const host = await browser.newPage();
    const spectator = await browser.newPage();
    try {
      const { width, height } = page.viewportSize()!;
      await host.setViewportSize({ width, height });
      await spectator.setViewportSize({ width, height });
      const sockets = await longestLineLobby(baseURL!, { host, guest: page, spectator });
      try {
        for (const [viewer, viewerPage] of [
          ["host", host],
          ["guest", page],
          ["spectator", spectator],
        ] as const) {
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
      await host.close();
      await spectator.close();
    }
  });

  test(`the PLAY INSTEAD prompt fits ${phone}`, async ({ page, browser }) => {
    if (narrow) await narrowPhone(page);
    const { width } = page.viewportSize()!;
    // The host plays in a page of its own (with the project's phone settings); this phone watches.
    const host = await browser.newPage();
    try {
      await watchLobby(page, await createLobby(host, "Host Player"));
      await page.getByRole("button", { name: "PLAY INSTEAD" }).click();
      const field = page.getByRole("textbox", { name: "Your name" });
      await expect(field).toBeVisible();
      // Measure the prompt as it rests, after its entrance animation and with the web fonts.
      await page.waitForFunction(() =>
        document.getElementById("alert-box")!.getAnimations().every((a) => a.playState === "finished")
      );
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await smallTargets(page, "#alert-box"), "small targets in the prompt").toEqual([]);
      expect(await smallFieldText(page, "#alert-box"), "small text in the name field").toEqual([]);
      const overflow = await overflowX(page);
      expect(overflow.scrollWidth, "scrollWidth").toBeLessThanOrEqual(width);
      expect(overflow.offscreen, "past the edge").toEqual([]);

      // The field takes twelve characters at most; jsdom does not apply maxLength to typing.
      await field.fill("");
      await field.pressSequentially("ABCDEFGHIJKLM");
      await expect(field).toHaveValue("ABCDEFGHIJKL");
    } finally {
      await host.close();
    }
  });
}

test("phones put the roster first", async ({ page, baseURL }) => {
  const code = await createLobby(page, "Host Player");
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
  const code = await createLobby(page, "Host Player");
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
  const code = await createLobby(host, "Host Player");
  const guests = await joinGuests(baseURL!, code, 9);
  try {
    await watchLobby(page, code);
    await expect(page.locator("#lobby-status-text")).toHaveText(
      "You are watching. Waiting for Host Player to start the game."
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
  const code = await createLobby(host, "Host Player");
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
