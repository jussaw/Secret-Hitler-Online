import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { startGame } from "./lobby";

/** One of the page's /game sockets, through the test: the page's end and the server's end. */
type Proxied = { page: WebSocketRoute; server?: WebSocketRoute };

/**
 * Routes the page's /game sockets through the test. While `refuse()` returns true a new socket is
 * closed at once, as with no network; otherwise it is passed to the server, and a close from the
 * server is passed back with its code and reason, which `serverCloses` records.
 */
async function proxySockets(page: Page, refuse: () => boolean = () => false) {
  const sockets: Proxied[] = [];
  const serverCloses: string[] = [];
  await page.routeWebSocket(/\/game\?/, (ws) => {
    if (refuse()) {
      sockets.push({ page: ws });
      void ws.close({ code: 4000, reason: "no network" });
      return;
    }
    const server = ws.connectToServer();
    server.onClose((code, reason) => {
      serverCloses.push(`${code} ${reason}`);
      void ws.close({ code, reason });
    });
    sockets.push({ page: ws, server });
  });
  return { sockets, serverCloses };
}

/**
 * The network drops under the page's socket: the page's end closes, and the server's end stays
 * open, as a dead connection looks to the server until its 30 s idle timeout.
 */
async function dropNetwork(socket: Proxied) {
  socket.page.onClose(() => {});
  socket.server!.onClose(() => {});
  await socket.page.close({ code: 4000, reason: "network gone" });
}

/** From now on, notes in the page whether the login page or the "Lost connection" snackbar shows. */
async function watchForDrops(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __drops: string[] };
    w.__drops = [];
    new MutationObserver(() => {
      if (document.querySelector("#snackbar")?.textContent?.includes("Lost connection")) {
        if (!w.__drops.includes("snackbar")) w.__drops.push("snackbar");
      }
      if (document.body.textContent?.includes("JOIN A GAME") && !w.__drops.includes("login")) {
        w.__drops.push("login");
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __drops: string[] }).__drops);
}

test.describe("a player whose network drops mid-game", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one browser is enough");
  });

  test("is back in the game at once, though the server still holds their old socket", async ({
    page,
    baseURL,
  }) => {
    const { sockets, serverCloses } = await proxySockets(page);
    const others = await startGame(page, baseURL!, 5);
    const drops = await watchForDrops(page);
    try {
      expect(sockets).toHaveLength(1);
      await dropNetwork(sockets[0]);

      await expect.poll(() => sockets.length).toBe(2);
      // The server takes the new socket in place of the old one, and refuses nothing.
      await page.waitForTimeout(2_000);
      expect(serverCloses).toEqual([]);
      await expect(page.locator(".game-screen")).toBeVisible();
      expect(await drops(), "the page left the game or showed the snackbar").toEqual([]);
    } finally {
      others.forEach((ws) => ws.close());
    }
  });

  test("rides out a few seconds with no network", async ({ page, baseURL }) => {
    let networkBackAt = 0; // up until the drop
    const { sockets, serverCloses } = await proxySockets(page, () => Date.now() < networkBackAt);
    const others = await startGame(page, baseURL!, 5);
    try {
      networkBackAt = Date.now() + 2_500;
      await dropNetwork(sockets[0]);

      // Back once the network is, without a press, after the snackbar said it was retrying.
      await expect(page.locator("#snackbar")).toContainText("Lost connection to the server: retrying...");
      await expect.poll(() => sockets.filter((s) => s.server).length, { timeout: 15_000 }).toBe(2);
      await page.waitForTimeout(1_000);
      expect(serverCloses).toEqual([]);
      await expect(page.locator(".game-screen")).toBeVisible();
      await expect(page.getByText("Disconnected from the lobby.")).toHaveCount(0);
    } finally {
      others.forEach((ws) => ws.close());
    }
  });
});
