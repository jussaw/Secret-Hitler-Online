import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import type { SoundRecord } from "../src/sound/SoundManager";
import { LobbyState, type PolicyType, type Role } from "../src/types";
import { TEN, gamePacket, openFakeGame } from "./fakeGame";
import { DESKTOP_SIZES, NARROW_WINDOWS, overflowX, overlaps, smallTargets } from "./layout";
import { settle } from "./lobby";

/** A play() call as the page recorded it, with what was on screen just after it. */
type Heard = SoundRecord & { t: number; alert: string; eventBar: string; status: string };

/**
 * Records every play() call (SoundManager dispatches "sound-play" on window) with what was on
 * screen just after it: the alert and event bar two frames later, once the animation queued after
 * the sound has rendered, and the status line 350 ms later, once its 250 ms text fade is done.
 * Also counts how many AudioContexts the page creates.
 */
export async function recordSounds(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __sounds: unknown[];
      __audioContexts: number;
      AudioContext?: typeof AudioContext;
    };
    w.__sounds = [];
    w.__audioContexts = 0;
    const Original = w.AudioContext;
    if (Original) {
      w.AudioContext = class extends Original {
        constructor(options?: AudioContextOptions) {
          super(options);
          w.__audioContexts++;
        }
      };
    }
    const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? "";
    window.addEventListener("sound-play", (event) => {
      const entry = {
        ...(event as CustomEvent).detail,
        t: performance.now(),
        alert: "",
        eventBar: "",
        status: "",
      };
      w.__sounds.push(entry);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          entry.alert = text("#alert-box.appear-custom-alert");
          entry.eventBar = text("#event-bar.appear-eventbar");
        })
      );
      setTimeout(() => (entry.status = text("#status-bar-text")), 350);
    });
  });
}

export const soundLog = (page: Page): Promise<Heard[]> =>
  page.evaluate(() => (window as unknown as { __sounds: Heard[] }).__sounds);

const audioContexts = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts);

/** Waits until the page has recorded `count` sounds, and their screen context. */
async function heard(page: Page, count: number): Promise<Heard[]> {
  await expect
    .poll(async () => (await soundLog(page)).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(count);
  await page.waitForTimeout(400);
  return soundLog(page);
}

const icon = Object.fromEntries(TEN.map((name, i) => [name, `p${i + 1}`]));
const [USER, HITLER] = TEN;
/** Every role, as players see them at the end of a game: the user is a fascist. */
const ROLES = Object.fromEntries(
  TEN.map((name) => [name, (name === USER ? "FASCIST" : name === HITLER ? "HITLER" : "LIBERAL") as Role])
);

test("no sound plays and no AudioContext exists before the first gesture", async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium alone runs the audio tests");
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") warnings.push(message.text());
  });
  await recordSounds(page);
  // The login form fills Create Lobby's name from this cookie, so no typing is needed.
  await context.addCookies([{ name: "name", value: encodeURIComponent(USER), url: baseURL! }]);
  await page.route("**/new-lobby", (route) => route.fulfill({ body: "FAKE" }));
  let connect!: (ws: WebSocketRoute) => void;
  const connected = new Promise<WebSocketRoute>((resolve) => (connect = resolve));
  await page.routeWebSocket(/\/game\?/, (ws) => {
    ws.onMessage(() => {});
    connect(ws);
  });

  await page.goto("/");
  // A click from a script is not a gesture: the page has had no trusted input yet.
  await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent === "CREATE LOBBY")!
      .click()
  );
  const ws = await connected;
  ws.send(JSON.stringify({ type: "lobby", usernames: TEN.slice(0, 9), icon }));
  ws.send(JSON.stringify({ type: "lobby", usernames: TEN, icon }));
  // The lobby rebuilds the portrait dialog after it renders, so let it render before the game.
  await page.getByText(`Players (${TEN.length}/10)`).waitFor();
  ws.send(JSON.stringify(gamePacket()));
  const okay = page.locator("#alert-box.appear-custom-alert").getByRole("button", { name: "OKAY" });
  await okay.waitFor();

  const before = await heard(page, 2);
  expect(before.map(({ name, played, reason }) => ({ name, played, reason }))).toEqual([
    { name: "playerJoined", played: false, reason: "locked" },
    { name: "gameStart", played: false, reason: "locked" },
  ]);
  expect(await audioContexts(page), "AudioContexts before a gesture").toBe(0);
  expect(warnings, "console warnings and errors").toEqual([]);

  await okay.click();
  const after = await heard(page, 3);
  expect(after[2]).toMatchObject({ name: "yourTurn", played: true });
  expect(await audioContexts(page), "AudioContexts after the first gesture").toBe(1);
  expect(warnings, "console warnings and errors").toEqual([]);
});

test("each sound waits for its animation", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || isMobile, "the desktop project runs the wiring test");
  test.setTimeout(120_000);
  await recordSounds(page);
  const game = await openFakeGame(page); // Its CREATE LOBBY click unlocks audio.
  const alertBox = page.locator("#alert-box.appear-custom-alert");
  const press = (name: string) => alertBox.getByRole("button", { name, exact: true }).click();
  const ok = () => game.send({ type: "ok" });
  const F = "FASCIST" as PolicyType;
  const L = "LIBERAL" as PolicyType;

  // 1. Another player joins the lobby.
  game.send({ type: "lobby", usernames: TEN.slice(0, 9), icon });
  game.send({ type: "lobby", usernames: TEN, icon });
  await heard(page, 1);
  // 2. The game starts with the user as president.
  game.send(gamePacket());
  await heard(page, 2);
  await press("OKAY");
  await heard(page, 3);
  ok(); // closes the nomination prompt
  // 3. The user nominates; 4. another player votes while the user's vote prompt is open.
  game.send(gamePacket({ state: LobbyState.CHANCELLOR_VOTING, chancellor: TEN[1] }));
  await alertBox.getByRole("button", { name: "CONFIRM" }).waitFor();
  game.send(
    gamePacket({ state: LobbyState.CHANCELLOR_VOTING, chancellor: TEN[1], userVotes: { [TEN[2]]: true } })
  );
  await heard(page, 5);
  ok(); // closes the vote prompt
  // 5. The vote fails and the tracker moves; the president must end the term.
  const failed = Object.fromEntries(TEN.map((name, i) => [name, i < 3]));
  game.send(
    gamePacket({
      state: LobbyState.POST_LEGISLATIVE,
      chancellor: TEN[1],
      userVotes: failed,
      electionTracker: 1,
      electionTrackerAdvanced: true,
    })
  );
  await heard(page, 8);
  await press("OKAY");
  await heard(page, 9);
  // 6. The next government enacts a fascist policy, which grants an execution.
  game.send(
    gamePacket({ state: LobbyState.LEGISLATIVE_CHANCELLOR, chancellor: TEN[1], chancellorChoices: [F, L] })
  );
  game.send(
    gamePacket({
      state: LobbyState.PP_EXECUTION,
      chancellor: TEN[1],
      fascistPolicies: 1,
      lastPolicy: "FASCIST",
    })
  );
  await heard(page, 10);
  await press("OKAY");
  await heard(page, 12);
  ok(); // closes the execution prompt
  // 7. Hitler is executed: liberals win, and the user, a fascist, loses.
  game.send(
    gamePacket(
      {
        state: LobbyState.LIBERAL_VICTORY_EXECUTION,
        chancellor: TEN[1],
        targetUser: HITLER,
        fascistPolicies: 1,
        lastPolicy: "FASCIST",
      },
      ROLES,
      [HITLER]
    )
  );
  await heard(page, 13);
  await press("OKAY");
  const log = await heard(page, 14);

  expect(log.map((sound) => sound.name)).toEqual([
    "playerJoined",
    "gameStart",
    "yourTurn",
    "nominate",
    "voteCast",
    "voteCast",
    "voteFailed",
    "trackerAdvance",
    "yourTurn",
    "policyFascist",
    "power",
    "yourTurn",
    "execution",
    "defeat",
  ]);
  const [, gameStart, nominationTurn, nominate, voteCast, closingVote, voteFailed, tracker,
    endTermTurn, policy, power, executionTurn, execution, defeat] = log;
  expect(gameStart.alert, "gameStart").toContain("YOU ARE: LIBERAL");
  expect(nominationTurn.alert, "yourTurn to nominate").toContain("NOMINATION");
  expect(nominate.eventBar, "nominate").toBe("VOTING");
  expect(voteCast.alert, "voteCast plays while the vote prompt is open").toContain("VOTING");
  expect(voteFailed.status, "voteFailed").toMatch(/Vote failed$/);
  expect(voteFailed.t - closingVote.t, "the tally comes 2 s into the reveal").toBeGreaterThan(1800);
  expect(voteFailed.t - closingVote.t, "the tally comes 2 s into the reveal").toBeLessThan(2600);
  expect(tracker.alert, "trackerAdvance").toContain("LEGISLATURE FAILED");
  expect(endTermTurn.status, "yourTurn to end the term").toBe("Waiting for the president to end their term.");
  expect(policy.alert, "policyFascist").toContain("POLICY ENACTED");
  expect(power.eventBar, "power").toBe("PRESIDENTIAL POWER");
  expect(executionTurn.alert, "yourTurn to execute").toContain("EXECUTION");
  expect(execution.alert, "execution").toContain("EXECUTION RESULTS");
  expect(defeat.alert, "defeat").toContain("Liberals successfully executed Hitler!");
});

/** The control's button, its icon and the header title's text, measured on the current page. */
async function headerFit(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | Range) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const header = document.querySelector("header")!;
    const control = header.querySelector<HTMLElement>(".sound-control")!;
    const title = document.createRange();
    title.selectNodeContents(
      Array.from(header.childNodes).find((node) => node.nodeType === 3 && node.textContent!.trim())!
    );
    const height = header.getBoundingClientRect().height;
    control.style.display = "none";
    const heightWithout = header.getBoundingClientRect().height;
    control.style.display = "";
    return {
      header: box(header),
      button: box(control.querySelector("button")!),
      icon: box(control.querySelector("svg")!),
      title: box(title),
      height,
      heightWithout,
    };
  });
}

test("the control fits every header", async ({ page, isMobile }) => {
  test.setTimeout(240_000);
  const sizes = isMobile ? [page.viewportSize()!] : [...DESKTOP_SIZES, ...NARROW_WINDOWS];
  const button = page.locator("header .sound-toggle");
  const volume = page.locator("header .sound-volume");
  const check = async (where: string) => {
    for (const size of sizes) {
      if (!isMobile) await page.setViewportSize(size);
      const at = `${where} at ${size.width}x${size.height}`;
      const fit = await headerFit(page);
      expect(fit.button.left, `button inside the header, ${at}`).toBeGreaterThanOrEqual(fit.header.left);
      expect(fit.button.right, `button inside the header, ${at}`).toBeLessThanOrEqual(fit.header.right);
      expect(fit.icon.top, `icon inside the header, ${at}`).toBeGreaterThanOrEqual(fit.header.top - 0.5);
      expect(fit.icon.bottom, `icon inside the header, ${at}`).toBeLessThanOrEqual(fit.header.bottom + 0.5);
      expect(overlaps(fit.button, fit.title), `button clear of the title, ${at}`).toBe(false);
      expect(fit.height, `header height, ${at}`).toBeCloseTo(fit.heightWithout, 1);
      // Phones and narrow windows (tablets held upright) are touch screens, as in no-scroll.spec.
      const touch = isMobile || size.width / size.height < 5 / 4;
      if (touch) expect(await smallTargets(page, "header"), `small targets, ${at}`).toEqual([]);

      // With the slider showing: on screen, and a large target on phones.
      if (isMobile) await button.tap();
      else await button.hover();
      await expect.poll(() => volume.evaluate((el) => getComputedStyle(el).opacity), { message: at }).toBe("1");
      expect((await overflowX(page)).offscreen, `past the edge with the slider, ${at}`).toEqual([]);
      if (touch) {
        expect(await smallTargets(page, ".sound-control"), `small targets in the control, ${at}`).toEqual([]);
        // The open slider must not cover any of the button, or a tap there sets the volume.
        const reachable = await page.evaluate(() => {
          const r = document.querySelector("header .sound-toggle")!.getBoundingClientRect();
          return [r.top + 2, r.top + r.height / 2, r.bottom - 2].every(
            (y) => !!document.elementFromPoint(r.left + r.width / 2, y)?.closest(".sound-toggle")
          );
        });
        expect(reachable, `the whole button reachable with the slider open, ${at}`).toBe(true);
      }
      if (isMobile) {
        await page.mouse.click(5, (await page.viewportSize())!.height - 5);
        await button.tap(); // undo the mute
        await page.mouse.click(5, (await page.viewportSize())!.height - 5);
      } else {
        await page.mouse.move(5, 500);
      }
      await expect.poll(() => volume.evaluate((el) => getComputedStyle(el).opacity), { message: at }).toBe("0");
    }
  };

  await page.goto("/");
  await settle(page);
  await check("login");
  const game = await openFakeGame(page);
  await settle(page);
  await check("lobby");
  game.send(gamePacket({ president: TEN[1] }));
  await page.locator(".game-screen").waitFor();
  await settle(page);
  await check("game");
});

test("mute and volume survive a reload", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || isMobile, "the desktop project covers the settings");
  await recordSounds(page);
  await page.goto("/");
  const button = page.getByRole("button", { name: "Mute sounds" });
  const slider = page.getByRole("slider", { name: "Volume" });
  await slider.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveValue("60");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(slider).toHaveValue("60");
  const game = await openFakeGame(page); // its click unlocks audio
  game.send({ type: "lobby", usernames: TEN.slice(0, 9), icon });
  game.send({ type: "lobby", usernames: TEN, icon });
  const [joined] = await heard(page, 1);
  expect(joined).toMatchObject({ name: "playerJoined", played: false, reason: "muted" });
});

test("hover and keyboard show the slider on desktop", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || isMobile, "hover and Tab are desktop input");
  await page.goto("/");
  const button = page.getByRole("button", { name: "Mute sounds" });
  const slider = page.getByRole("slider", { name: "Volume" });
  const opacity = () => page.locator(".sound-volume").evaluate((el) => getComputedStyle(el).opacity);
  expect(await opacity()).toBe("0");
  await button.hover();
  await expect.poll(opacity).toBe("1");
  await page.mouse.move(5, 600);
  await expect.poll(opacity).toBe("0");

  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await expect.poll(opacity).toBe("1");
  await page.keyboard.press("Tab");
  await expect(slider).toBeFocused();
  await expect.poll(opacity).toBe("1");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("75");
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Space");
  await expect(button).toHaveAttribute("aria-pressed", "true");
});

test("a tap shows the slider on phones", async ({ page, isMobile }) => {
  test.skip(!isMobile, "tapping is phone input");
  await page.goto("/");
  const button = page.getByRole("button", { name: "Mute sounds" });
  const opacity = () => page.locator(".sound-volume").evaluate((el) => getComputedStyle(el).opacity);
  expect(await opacity()).toBe("0");
  await button.tap();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect.poll(opacity).toBe("1");
  await page.getByRole("heading", { name: "JOIN A GAME" }).tap();
  await expect.poll(opacity).toBe("0");
});

test("the control stays usable over a prompt", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || isMobile, "the desktop project covers the overlay");
  const game = await openFakeGame(page);
  game.send(gamePacket());
  await page.locator("#alert-box.appear-custom-alert").getByRole("button", { name: "OKAY" }).waitFor();
  const button = page.getByRole("button", { name: "Mute sounds" });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
});

test("a tap shows the slider in a browser without :has()", async ({ page, isMobile }) => {
  test.skip(!isMobile, "tapping is phone input");
  // Firefox before 121 has no :has(). An unknown pseudo-class drops a rule the same way, along
  // with every selector listed beside it.
  await page.route(/\.css(\?|$)/, async (route) => {
    const response = await route.fetch();
    const css = (await response.text()).replaceAll(":has(", ":-unknown-has(");
    await route.fulfill({ response, body: css });
  });
  await page.goto("/");
  const opacity = () => page.locator(".sound-volume").evaluate((el) => getComputedStyle(el).opacity);
  await page.getByRole("button", { name: "Mute sounds" }).tap();
  await expect.poll(opacity).toBe("1");
});

test("a disconnect during the vote reveal cancels its sound", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || isMobile, "the desktop project covers the wiring");
  await recordSounds(page);
  await page.route("**/new-lobby", (route) => route.fulfill({ body: "FAKE" }));
  let refuse = false;
  let connect!: (ws: WebSocketRoute) => void;
  const connected = new Promise<WebSocketRoute>((resolve) => (connect = resolve));
  await page.routeWebSocket(/\/game\?/, (ws) => {
    if (refuse) return void ws.close(); // the server is gone: every reconnect fails
    ws.onMessage(() => {});
    connect(ws);
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your Name" }).last().fill(USER);
  await page.getByRole("button", { name: "CREATE LOBBY" }).click();
  const ws = await connected;
  const send = (packet: object) => ws.send(JSON.stringify(packet));
  send({ type: "lobby", usernames: TEN, icon });
  await page.getByText(`Players (${TEN.length}/10)`).waitFor();
  send(gamePacket({ president: TEN[1] }));
  await page.locator("#alert-box.appear-custom-alert").getByRole("button", { name: "OKAY" }).click();
  send(gamePacket({ state: LobbyState.CHANCELLOR_VOTING, president: TEN[1], chancellor: TEN[2] }));
  await page.locator("#alert-box.appear-custom-alert").getByRole("button", { name: "CONFIRM" }).waitFor();
  send({ type: "ok" });
  const passed = Object.fromEntries(TEN.map((name) => [name, true]));
  send(gamePacket({ state: LobbyState.LEGISLATIVE_PRESIDENT, president: TEN[1], chancellor: TEN[2], userVotes: passed }));
  await expect(page.locator("#status-bar-text")).toHaveText("Tallying votes...");
  // The reveal is running and its result sound is 2 s away. The server goes away now: after five
  // failed reconnects the client returns to the login page and clears its animation queue.
  refuse = true;
  ws.close();
  await expect(page.getByText("Disconnected from the lobby.")).toBeVisible();
  await page.waitForTimeout(3000);
  const names = (await soundLog(page)).map((sound) => sound.name);
  expect(names, "sounds after the disconnect").not.toContain("votePassed");
  expect(names, "sounds after the disconnect").not.toContain("cardDraw");
});
