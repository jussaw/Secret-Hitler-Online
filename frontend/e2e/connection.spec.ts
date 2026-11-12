import { expect, test } from "@playwright/test";
import { createLobby } from "./lobby";

/**
 * The server closes a /game socket after 30 s with no traffic either way, so a quiet table (a
 * president thinking) keeps its sockets only if the client pings sooner than that.
 */
test("a quiet lobby keeps its socket past the server's idle timeout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  test.setTimeout(90_000);
  // Notes whether the "Lost connection" snackbar ever shows, however briefly.
  await page.addInitScript(() => {
    const w = window as unknown as { __lostConnection: boolean };
    w.__lostConnection = false;
    new MutationObserver(() => {
      if (document.querySelector("#snackbar")?.textContent?.includes("Lost connection")) {
        w.__lostConnection = true;
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  const opened: string[] = [];
  const closed: string[] = [];
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/game")) return;
    opened.push(ws.url());
    ws.on("close", () => closed.push(ws.url()));
  });

  await createLobby(page, "Host Player");
  await expect.poll(() => opened.length).toBe(1);
  // A lone player in a lobby: nothing else sends, so only the client's pings keep the socket.
  await page.waitForTimeout(35_000);

  expect(closed, "sockets closed").toEqual([]);
  expect(opened, "sockets opened").toHaveLength(1);
  const lost = await page.evaluate(() => (window as unknown as { __lostConnection: boolean }).__lostConnection);
  expect(lost, "the Lost connection snackbar showed").toBe(false);
});
