import { expect, test } from "@playwright/test";
import { LobbyState as S } from "../src/types";
import { TEN, openFakeWatch, spectatorPacket } from "./fakeGame";

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
