import { expect, test } from "@playwright/test";
import { LobbyState as S } from "../src/types";
import {
  EVERY_ROLE,
  TEN,
  gamePacket,
  lobbyPacket,
  openFakeGame,
  openFakeWatch,
  spectatorPacket,
} from "./fakeGame";
import { waitForPlayers } from "./lobby";

test("the vote result keeps ELECTION lit, then the legislative session lights", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  const current = page.locator(".round-step[aria-current='step']");
  const line = page.locator("#status-bar-text");
  const watch = await openFakeWatch(
    page,
    spectatorPacket({
      state: S.CHANCELLOR_VOTING,
      lastState: S.CHANCELLOR_NOMINATION,
      president: TEN[1],
      chancellor: TEN[2],
    })
  );
  await expect(current).toHaveText(/ELECTION/);
  watch.send(
    spectatorPacket({
      state: S.LEGISLATIVE_PRESIDENT,
      lastState: S.CHANCELLOR_VOTING,
      president: TEN[1],
      chancellor: TEN[2],
      userVotes: Object.fromEntries(TEN.map((name) => [name, true])),
    })
  );
  await expect(line).toHaveText("10 - 0: Vote passed");
  await expect(current).toHaveText(/ELECTION/);
  await expect(line).toHaveText("Waiting for Long Guest 1 to choose a policy to discard.", { timeout: 15000 });
  await expect(current).toHaveText(/LEGISLATIVE SESSION/);
});

test("after a failed vote, end of term lights ELECTION", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  await openFakeWatch(
    page,
    spectatorPacket({ state: S.POST_LEGISLATIVE, lastState: S.CHANCELLOR_VOTING, president: TEN[1] })
  );
  await expect(page.locator("#status-bar-text")).toHaveText("Waiting for Long Guest 1 to end their term.");
  await expect(page.locator(".round-step[aria-current='step']")).toHaveText(/ELECTION/);
});

test("the old line fades visibly and keeps its step until the new line lands", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  const current = page.locator(".round-step[aria-current='step']");
  const line = page.locator("#status-bar-text");
  const watch = await openFakeWatch(
    page,
    spectatorPacket({
      state: S.CHANCELLOR_VOTING,
      lastState: S.CHANCELLOR_NOMINATION,
      president: TEN[1],
      chancellor: TEN[2],
    })
  );
  await expect(current).toHaveText(/ELECTION/);
  await line.evaluate((el) => {
    const w = window as unknown as { __fade: { visibility: string; name: string; step: string | null }[] };
    w.__fade = [];
    new MutationObserver(() => {
      const cs = getComputedStyle(el);
      if (cs.animationName !== "round-hide") return;
      w.__fade.push({
        visibility: cs.visibility,
        name: cs.animationName,
        step: document.querySelector(".round-step[aria-current='step']")?.textContent ?? null,
      });
    }).observe(el, { attributes: true, attributeFilter: ["class"] });
  });
  watch.send(
    spectatorPacket({
      state: S.LEGISLATIVE_PRESIDENT,
      lastState: S.CHANCELLOR_VOTING,
      president: TEN[1],
      chancellor: TEN[2],
      userVotes: Object.fromEntries(TEN.map((name) => [name, true])),
    })
  );
  await expect(line).toHaveText("10 - 0: Vote passed");
  await expect(line).not.toHaveClass(/fading|hide/);
  const samples = await page.evaluate(() => (window as unknown as { __fade: unknown[] }).__fade);
  expect(samples.length).toBeGreaterThan(0);
  for (const s of samples as { visibility: string; name: string; step: string | null }[]) {
    expect(s.name).toBe("round-hide");
    expect(s.visibility).toBe("visible");
    expect(s.step).toMatch(/ELECTION/);
  }
});

test("ELECTION stays lit under the victory screen when Hitler is elected", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  const current = page.locator(".round-step[aria-current='step']");
  const watch = await openFakeWatch(
    page,
    spectatorPacket({
      state: S.CHANCELLOR_VOTING,
      lastState: S.CHANCELLOR_NOMINATION,
      president: TEN[2],
      chancellor: TEN[1],
      fascistPolicies: 3,
    })
  );
  await expect(current).toHaveText(/ELECTION/);
  watch.send({
    ...gamePacket(
      {
        state: S.FASCIST_VICTORY_ELECTION,
        lastState: S.CHANCELLOR_VOTING,
        president: TEN[2],
        chancellor: TEN[1],
        fascistPolicies: 3,
        userVotes: Object.fromEntries(TEN.map((name) => [name, true])),
      },
      EVERY_ROLE
    ),
    spectatorCount: 1,
  });
  await page.getByRole("button", { name: "RETURN TO LOBBY" }).waitFor({ timeout: 15000 });
  await expect(current).toHaveText(/ELECTION/);
});

test("RETURN TO LOBBY gives the next game a fresh line and no lit step", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  const current = page.locator(".round-step[aria-current='step']");
  const okay = page.getByRole("button", { name: "OKAY" });
  const game = await openFakeGame(page);
  game.send(gamePacket({ president: TEN[1] }));
  await okay.waitFor();
  const snapshot = () =>
    page.evaluate(() => ({
      text: document.querySelector("#status-bar-text")?.textContent ?? null,
      lit: document.querySelectorAll(".round-step[aria-current='step']").length,
    }));
  const opening = await snapshot();
  await okay.click();
  await expect(current).toHaveText(/NOMINATION/);
  game.send(gamePacket({ state: S.LEGISLATIVE_PRESIDENT, president: TEN[1], chancellor: TEN[2] }));
  // The vote-result line holds ELECTION lit first.
  await expect(current).toHaveText(/LEGISLATIVE SESSION/, { timeout: 15000 });
  game.send(
    gamePacket(
      { state: S.FASCIST_VICTORY_POLICY, president: TEN[1], chancellor: TEN[2] },
      EVERY_ROLE
    )
  );
  const returnButton = page.getByRole("button", { name: "RETURN TO LOBBY" });
  await returnButton.waitFor({ timeout: 15000 });
  await returnButton.click();
  await expect.poll(() => game.urls.length).toBe(2);
  game.send(lobbyPacket());
  await waitForPlayers(page, 10);
  game.send(gamePacket({ president: TEN[1] }));
  await okay.waitFor();
  expect(await snapshot()).toEqual(opening);
});
