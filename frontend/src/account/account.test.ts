import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTACT_ERROR } from "../lobby/joinError";
import { discordSignInHref, fetchMe, saveUsername, signOut, testSignIn } from "./account";

const respond = (status: number, body = "", type = "text/plain") =>
  new Response(body || null, { status, headers: { "Content-Type": type } });

const mockFetch = (...responses: (Response | Error)[]) => {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  }
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchMe", () => {
  it("reads a signed-out answer", async () => {
    const body = { signedIn: false, discord: true, testSignIn: false };
    const fn = mockFetch(respond(200, JSON.stringify(body), "application/json"));
    expect(await fetchMe()).toEqual(body);
    expect(fn.mock.calls[0][0]).toMatch(/\/me$/);
  });

  it("reads a signed-in answer, with and without a name", async () => {
    const me = {
      signedIn: true,
      id: "u1",
      username: null,
      discordUsername: "sam#1",
      test: false,
      discord: true,
      testSignIn: false,
    };
    mockFetch(respond(200, JSON.stringify(me), "application/json"));
    expect(await fetchMe()).toEqual(me);
    mockFetch(respond(200, JSON.stringify({ ...me, username: "Sam" }), "application/json"));
    expect(await fetchMe()).toEqual({ ...me, username: "Sam" });
  });

  it("rejects a 200 whose body is not an account answer", async () => {
    for (const body of ["null", "{}", '{"signedIn":true,"id":1}']) {
      mockFetch(respond(200, body, "application/json"));
      await expect(fetchMe()).rejects.toThrow();
      mockFetch(respond(200, body, "application/json"));
      await expect(testSignIn()).rejects.toThrow();
    }
  });

  it("rejects on a network failure or a bad status", async () => {
    mockFetch(new TypeError("network"));
    await expect(fetchMe()).rejects.toThrow();
    mockFetch(respond(500));
    await expect(fetchMe()).rejects.toThrow();
  });
});

describe("saveUsername", () => {
  it("posts JSON and returns the normalized name", async () => {
    const fn = mockFetch(respond(200, JSON.stringify({ username: "Sam" }), "application/json"));
    expect(await saveUsername(" Sam ")).toEqual({ ok: true, username: "Sam" });
    const [url, init] = fn.mock.calls[0];
    expect(url).toMatch(/\/me\/username$/);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ username: " Sam " });
  });

  it("returns the server's message for an error status", async () => {
    mockFetch(respond(409, "Another player already has that name."));
    expect(await saveUsername("Sam")).toEqual({
      ok: false,
      error: "Another player already has that name.",
    });
  });

  it("says a 401 means the page is signed out", async () => {
    mockFetch(respond(401, "Sign in to play."));
    expect(await saveUsername("Sam")).toEqual({
      ok: false,
      error: "Sign in to play.",
      signedOut: true,
    });
  });

  it("falls back to the contact error for an empty body or a 5xx", async () => {
    mockFetch(respond(400));
    expect(await saveUsername("Sam")).toEqual({ ok: false, error: CONTACT_ERROR });
    mockFetch(respond(500, "boom"));
    expect(await saveUsername("Sam")).toEqual({ ok: false, error: CONTACT_ERROR });
  });

  it("returns the contact error on a network failure", async () => {
    mockFetch(new TypeError("network"));
    expect(await saveUsername("Sam")).toEqual({ ok: false, error: CONTACT_ERROR });
  });
});

describe("signOut", () => {
  it("posts {} as JSON and resolves on 204", async () => {
    const fn = mockFetch(new Response(null, { status: 204 }));
    await signOut();
    const [url, init] = fn.mock.calls[0];
    expect(url).toMatch(/\/auth\/sign-out$/);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe("{}");
  });

  it("rejects on a non-OK status", async () => {
    mockFetch(respond(500));
    await expect(signOut()).rejects.toThrow();
  });

  it("rejects on a network failure", async () => {
    mockFetch(new TypeError("network"));
    await expect(signOut()).rejects.toThrow();
  });
});

describe("testSignIn", () => {
  it("posts a random id each call and returns the account", async () => {
    const me = { signedIn: false, discord: false, testSignIn: true };
    const fn = mockFetch(
      respond(200, JSON.stringify(me), "application/json"),
      respond(200, JSON.stringify(me), "application/json")
    );
    expect(await testSignIn()).toEqual(me);
    await testSignIn();
    const ids = fn.mock.calls.map(([, init]) => JSON.parse(init.body).id);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
    expect(fn.mock.calls[0][0]).toMatch(/\/auth\/test-sign-in$/);
    expect(fn.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
  });

  it("rejects on a failure", async () => {
    mockFetch(respond(404));
    await expect(testSignIn()).rejects.toThrow();
  });
});

describe("discordSignInHref", () => {
  it("adds the lobby only for a full code", () => {
    expect(discordSignInHref("KQMX")).toMatch(/\/auth\/discord\?lobby=KQMX$/);
    expect(discordSignInHref("kqmx")).toMatch(/\/auth\/discord\?lobby=KQMX$/);
    expect(discordSignInHref("KQ")).toMatch(/\/auth\/discord$/);
    expect(discordSignInHref("")).toMatch(/\/auth\/discord$/);
  });
});
