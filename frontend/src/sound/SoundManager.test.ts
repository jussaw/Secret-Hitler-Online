import { describe, expect, test, vi } from "vitest";
import {
  CLIPS,
  SOUND_EVENT,
  SOUND_NAMES,
  SoundManager,
  type Clip,
  type SoundName,
  type SoundRecord,
} from "./SoundManager";

const clips = Object.fromEntries(
  SOUND_NAMES.map((name) => [name, { ogg: `/s/${name}.ogg`, mp3: `/s/${name}.mp3` }])
) as Record<SoundName, Clip>;

/** A clip's bytes are its URL, so the fake context can tell which clip it decoded. */
const bytesOf = (url: string) => new TextEncoder().encode(url).buffer as ArrayBuffer;
const urlOf = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);

/** Just enough of an AudioContext: records every clip it starts and every gain it is set to. */
class FakeContext {
  state: AudioContextState = "running";
  started: string[] = [];
  destination = {};
  gainNode = { gain: { value: 1 }, connect: vi.fn() };
  constructor(private undecodable: string[]) {}
  createGain() {
    return this.gainNode;
  }
  createBufferSource() {
    const source = {
      buffer: null as { url: string } | null,
      connect: vi.fn(),
      start: () => this.started.push(source.buffer!.url),
    };
    return source;
  }
  decodeAudioData(bytes: ArrayBuffer) {
    const url = urlOf(bytes);
    return this.undecodable.includes(url)
      ? Promise.reject(new Error("cannot decode"))
      : Promise.resolve({ url });
  }
  resume() {
    if (this.state !== "closed") this.state = "running";
    return Promise.resolve();
  }
}

type Options = {
  stored?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
  ogg?: boolean;
  unfetchable?: string[];
  /** URLs whose first fetch fails, as on a flaky network. */
  flaky?: string[];
  undecodable?: string[];
  activated?: boolean;
};

function setup(options: Options = {}) {
  const store = new Map<string, string>();
  if (options.stored !== undefined) store.set("sounds", options.stored);
  const storage = options.storage ?? {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
  const fetched: string[] = [];
  const contexts: FakeContext[] = [];
  const records: SoundRecord[] = [];
  const target = new EventTarget();
  target.addEventListener(SOUND_EVENT, (event) =>
    records.push((event as CustomEvent<SoundRecord>).detail)
  );
  const make = () =>
    new SoundManager({
      clips,
      storage,
      createContext: () => {
        const context = new FakeContext(options.undecodable ?? []);
        contexts.push(context);
        return context as unknown as AudioContext;
      },
      fetchClip: async (url) => {
        fetched.push(url);
        if (options.unfetchable?.includes(url)) throw new Error("404");
        if (options.flaky?.includes(url) && fetched.filter((u) => u === url).length === 1) {
          throw new Error("network");
        }
        return bytesOf(url);
      },
      canPlayOgg: () => options.ogg ?? true,
      isActivated: () => options.activated ?? true,
      target,
    });
  return { manager: make(), make, store, fetched, contexts, records };
}

/** Lets every pending fetch and decode settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function unlocked(options: Options = {}) {
  const harness = setup(options);
  await harness.manager.preload();
  harness.manager.unlock();
  await settle();
  return harness;
}

describe("settings", () => {
  test("starts at 70% volume, unmuted, with nothing stored", () => {
    expect(setup().manager.getSettings()).toEqual({ volume: 0.7, muted: false });
  });

  test("saves volume and mute, and a new manager restores them", () => {
    const { manager, make, store } = setup();
    manager.setVolume(0.25);
    manager.setMuted(true);
    expect(JSON.parse(store.get("sounds")!)).toEqual({ volume: 0.25, muted: true });
    expect(make().getSettings()).toEqual({ volume: 0.25, muted: true });
  });

  test.each(["not json", '{"volume":7}', '{"volume":"loud","muted":"yes"}', "null"])(
    "ignores stored settings that are not valid: %s",
    (stored) => {
      expect(setup({ stored }).manager.getSettings()).toEqual({ volume: 0.7, muted: false });
    }
  );

  test("works when localStorage throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const { manager } = setup({ storage: broken });
    expect(manager.getSettings()).toEqual({ volume: 0.7, muted: false });
    expect(() => manager.setMuted(true)).not.toThrow();
    expect(manager.getSettings().muted).toBe(true);
  });

  test("clamps the volume to 0..1", () => {
    const { manager } = setup();
    manager.setVolume(1.5);
    expect(manager.getSettings().volume).toBe(1);
    manager.setVolume(-1);
    expect(manager.getSettings().volume).toBe(0);
  });

  test("notifies subscribers and keeps getSettings stable between changes", () => {
    const { manager } = setup();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    const before = manager.getSettings();
    expect(manager.getSettings()).toBe(before);
    manager.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.getSettings()).not.toBe(before);
    unsubscribe();
    manager.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("unlocking", () => {
  test("does nothing before unlock and creates no AudioContext", async () => {
    const { manager, contexts, records } = setup();
    await manager.preload();
    manager.play("nominate");
    expect(contexts).toHaveLength(0);
    expect(records).toEqual([{ name: "nominate", played: false, reason: "locked" }]);
  });

  test("unlock waits for user activation", () => {
    const { manager, contexts } = setup({ activated: false });
    manager.unlock();
    expect(contexts).toHaveLength(0);
  });

  test("creates the AudioContext once", async () => {
    const { manager, contexts } = await unlocked();
    manager.unlock();
    expect(contexts).toHaveLength(1);
  });

  test("unlocks on the first trusted gesture and ignores synthetic ones", async () => {
    const { manager, contexts } = setup();
    const listeners = new Map<string, EventListener>();
    manager.listenForGesture({
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) =>
        void listeners.set(type, listener as EventListener),
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) =>
        void (listeners.get(type) === listener && listeners.delete(type)),
    });
    expect([...listeners.keys()].sort()).toEqual(
      ["click", "keydown", "pointerdown", "pointerup", "touchend"]
    );
    listeners.get("pointerup")!({ isTrusted: false } as Event);
    expect(contexts).toHaveLength(0);
    listeners.get("pointerup")!({ isTrusted: true } as Event);
    expect(contexts).toHaveLength(1);
  });

  test("a later trusted gesture resumes audio that the browser suspended", async () => {
    const { manager, contexts, records } = setup();
    const listeners = new Map<string, EventListener>();
    manager.listenForGesture({
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) =>
        void listeners.set(type, listener as EventListener),
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) =>
        void (listeners.get(type) === listener && listeners.delete(type)),
    });
    await manager.preload();
    listeners.get("pointerup")!({ isTrusted: true } as Event);
    await settle();
    // iOS interrupts audio for a call or Siri, and some versions suspend it on a screen lock.
    contexts[0].state = "interrupted" as AudioContextState;
    manager.play("nominate");
    listeners.get("touchend")!({ isTrusted: true } as Event);
    await settle();
    manager.play("nominate");
    expect(contexts).toHaveLength(1);
    expect(records.map((record) => record.reason ?? "played")).toEqual(["locked", "played"]);
  });
});

describe("playing", () => {
  test("plays a clip after unlock at the set volume", async () => {
    const { manager, contexts, records } = await unlocked();
    manager.play("nominate");
    expect(contexts[0].started).toEqual(["/s/nominate.ogg"]);
    expect(contexts[0].gainNode.gain.value).toBe(0.7);
    expect(records).toEqual([{ name: "nominate", played: true }]);
    manager.setVolume(0.3);
    expect(contexts[0].gainNode.gain.value).toBe(0.3);
  });

  test("does nothing while muted", async () => {
    const { manager, contexts, records } = await unlocked();
    manager.setMuted(true);
    manager.play("nominate");
    expect(contexts[0].started).toEqual([]);
    expect(records).toEqual([{ name: "nominate", played: false, reason: "muted" }]);
  });

  test("does nothing at volume 0", async () => {
    const { manager, contexts, records } = await unlocked();
    manager.setVolume(0);
    manager.play("nominate");
    expect(contexts[0].started).toEqual([]);
    expect(records).toEqual([{ name: "nominate", played: false, reason: "muted" }]);
  });

  test("does nothing while the context is suspended", async () => {
    const { manager, contexts, records } = await unlocked();
    contexts[0].state = "suspended";
    manager.play("nominate");
    expect(contexts[0].started).toEqual([]);
    expect(records).toEqual([{ name: "nominate", played: false, reason: "locked" }]);
  });

  test("a clip that fails to load does not throw, and the others still play", async () => {
    const { manager, contexts, records } = await unlocked({
      unfetchable: ["/s/veto.ogg", "/s/veto.mp3"],
    });
    expect(() => manager.play("veto")).not.toThrow();
    manager.play("nominate");
    expect(contexts[0].started).toEqual(["/s/nominate.ogg"]);
    expect(records).toEqual([
      { name: "veto", played: false, reason: "unavailable" },
      { name: "nominate", played: true },
    ]);
  });

  test("uses OGG when the browser can play it", async () => {
    const { manager, fetched } = setup();
    await manager.preload();
    expect(fetched).toHaveLength(18);
    expect(fetched.every((url) => url.endsWith(".ogg"))).toBe(true);
  });

  test("uses MP3 when the browser cannot play OGG", async () => {
    const { manager, fetched } = setup({ ogg: false });
    await manager.preload();
    expect(fetched).toHaveLength(18);
    expect(fetched.every((url) => url.endsWith(".mp3"))).toBe(true);
  });

  test("fetches a clip once more at unlock when its preload failed", async () => {
    const { manager, contexts, fetched } = await unlocked({ ogg: false, flaky: ["/s/veto.mp3"] });
    manager.play("veto");
    expect(fetched.filter((url) => url === "/s/veto.mp3")).toHaveLength(2);
    expect(contexts[0].started).toEqual(["/s/veto.mp3"]);
  });

  test("falls back to MP3 when an OGG does not decode", async () => {
    const { manager, contexts, fetched } = await unlocked({ undecodable: ["/s/veto.ogg"] });
    manager.play("veto");
    expect(fetched).toContain("/s/veto.mp3");
    expect(contexts[0].started).toEqual(["/s/veto.mp3"]);
  });
});

test("every sound has an OGG and an MP3 clip", () => {
  for (const name of SOUND_NAMES) {
    expect(CLIPS[name]?.ogg, name).toMatch(/\.ogg$/);
    expect(CLIPS[name]?.mp3, name).toMatch(/\.mp3$/);
  }
});
