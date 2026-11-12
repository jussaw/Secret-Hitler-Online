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
