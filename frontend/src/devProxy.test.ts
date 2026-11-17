// @vitest-environment node
import { describe, expect, it } from "vitest";
import config from "../vite.config";

const proxy = config.server!.proxy! as Record<string, string | { target?: string; ws?: boolean }>;

/**
 * The dev server's proxy entries a request goes to, by Vite's own rule (its
 * `createProxyContextMatcher`): a key that starts with `^` is a RegExp tried on the request's
 * URL, path and query; any other key is a prefix of it.
 */
function entriesFor(url: string): string[] {
  return Object.keys(proxy).filter((key) => (key[0] === "^" ? new RegExp(key).test(url) : url.startsWith(key)));
}

describe("the dev server's proxy", () => {
  it("sends the players' socket, /game, to the backend, query and all", () => {
    for (const url of ["/game", "/game?lobby=ABCD", "/game?lobby=ABCD&spectator=true", "/game?lobby=ABCD&rejoinKey=k1"]) {
      const entries = entriesFor(url);
      expect(entries, url).toHaveLength(1);
      expect(proxy[entries[0]], url).toMatchObject({ ws: true });
    }
  });

  it("keeps the stats pages' paths, /games and /players among them, on the dev server", () => {
    for (const url of ["/games", "/games/", "/games/abc-123", "/games?players=1&page=2", "/gamesx", "/players", "/players/3", "/stats", "/stats/roles"]) {
      expect(entriesFor(url), url).toEqual([]);
    }
  });

  it("still sends the backend's routes there", () => {
    for (const url of ["/check-login?lobby=ABCD", "/new-lobby", "/ping", "/auth/discord", "/me", "/me/username", "/api/stats/games"]) {
      expect(entriesFor(url), url).toHaveLength(1);
    }
  });
});
