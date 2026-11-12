/**
 * Plays the game's sound effects through Web Audio.
 *
 * Nothing touches an audio API before the first real gesture: the AudioContext is created inside
 * that gesture, so the browser never refuses it and never logs an autoplay warning. Until then,
 * play() is a silent no-op. Volume and mute are kept per browser in localStorage.
 */

export const SOUND_NAMES = [
  "yourTurn",
  "playerJoined",
  "gameStart",
  "nominate",
  "voteCast",
  "votePassed",
  "voteFailed",
  "trackerAdvance",
  "cardDraw",
  "cardDiscard",
  "policyLiberal",
  "policyFascist",
  "power",
  "investigate",
  "execution",
  "veto",
  "victory",
  "defeat",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

export type Clip = { ogg: string; mp3: string };
export type SoundSettings = { volume: number; muted: boolean };
/** What became of one play() call: tests and the acceptance drive listen for these. */
export type SoundRecord = {
  name: SoundName;
  played: boolean;
  reason?: "locked" | "muted" | "unavailable";
};

/** Dispatched as a CustomEvent<SoundRecord> for every play(), in production too. */
export const SOUND_EVENT = "sound-play";
export const SETTINGS_KEY = "sounds";
export const DEFAULT_SETTINGS: SoundSettings = { volume: 0.7, muted: false };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type GestureTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type SoundDeps = {
  clips: Record<SoundName, Clip>;
  /** Defaults to localStorage, or none where reading it throws. */
  storage?: Storage | null;
  createContext?: () => AudioContext;
  fetchClip?: (url: string) => Promise<ArrayBuffer>;
  canPlayOgg?: () => boolean;
  /** Whether the page has user activation now; touch pointerdown, for one, comes before it. */
  isActivated?: () => boolean;
  /** Where SoundRecords are dispatched. */
  target?: EventTarget;
};

/** Trusted events that can carry user activation (HTML's "activation triggering input events"). */
const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown", "click"];
const LISTENER_OPTIONS = { capture: true, passive: true };

function defaultStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function defaultFetchClip(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.arrayBuffer();
}

function readSettings(storage: Storage | null): SoundSettings {
  try {
    const stored = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? "null");
    const { volume, muted } = stored ?? {};
    if (typeof volume === "number" && volume >= 0 && volume <= 1 && typeof muted === "boolean") {
      return { volume, muted };
    }
  } catch {
    // Unreadable storage or bad JSON: fall back to the defaults.
  }
  return DEFAULT_SETTINGS;
}

export class SoundManager {
  private readonly clips: Record<SoundName, Clip>;
  private readonly storage: Storage | null;
  private readonly createContext: () => AudioContext;
  private readonly fetchClip: (url: string) => Promise<ArrayBuffer>;
  private readonly format: keyof Clip;
  private readonly isActivated: () => boolean;
  private readonly target: EventTarget | undefined;

  private settings: SoundSettings;
  private readonly listeners = new Set<() => void>();
  private context?: AudioContext;
  private gain?: GainNode;
  /** Each clip's bytes in the preferred format, fetched by preload(). */
  private fetches?: Map<SoundName, Promise<ArrayBuffer>>;
  private readonly buffers = new Map<SoundName, AudioBuffer>();

  constructor(deps: SoundDeps) {
    this.clips = deps.clips;
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
    this.createContext = deps.createContext ?? (() => new AudioContext());
    this.fetchClip = deps.fetchClip ?? defaultFetchClip;
    const canPlayOgg =
      deps.canPlayOgg ?? (() => new Audio().canPlayType('audio/ogg; codecs="opus"') !== "");
    this.format = canPlayOgg() ? "ogg" : "mp3";
    this.isActivated =
      deps.isActivated ?? (() => navigator.userActivation?.isActive ?? true);
    this.target = deps.target ?? (typeof window === "undefined" ? undefined : window);
    this.settings = readSettings(this.storage);
  }

  getSettings = (): SoundSettings => this.settings;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setVolume(volume: number): void {
    this.update({ volume: Math.min(1, Math.max(0, volume)) });
  }

  setMuted(muted: boolean): void {
    this.update({ muted });
  }

  /**
   * Fetches every clip in the preferred format. Never rejects: a clip that fails is fetched once
   * more, as MP3, at unlock.
   */
  preload(): Promise<void> {
    if (!this.fetches) {
      this.fetches = new Map(
        SOUND_NAMES.map((name) => {
          const bytes = this.fetchClip(this.clips[name][this.format]);
          bytes.catch(() => {}); // A failure is handled when the clip is decoded.
          return [name, bytes];
        })
      );
    }
    return Promise.allSettled(this.fetches.values()).then(() => undefined);
  }

  /**
   * Creates the AudioContext inside a gesture, once, and decodes the clips. Later calls resume
   * it if the browser has suspended or interrupted it (iOS does for calls, Siri, a screen lock).
   */
  unlock(): void {
    if (!this.isActivated()) return;
    if (this.context) {
      const state: string = this.context.state;
      if (state !== "running" && state !== "closed") this.context.resume().catch(() => {});
      return;
    }
    let context: AudioContext;
    try {
      context = this.createContext();
    } catch {
      return; // No Web Audio: the game stays silent.
    }
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.value = this.effectiveVolume();
    this.gain.connect(context.destination);
    context.resume().catch(() => {});
    void this.preload();
    for (const name of SOUND_NAMES) void this.decode(name);
  }

  /**
   * Unlocks on the first trusted gesture. It keeps listening, so a later gesture resumes audio the
   * browser has suspended; once audio runs, each gesture costs one state check.
   */
  listenForGesture(target: GestureTarget): void {
    const onGesture = (event: Event) => {
      if (event.isTrusted) this.unlock();
    };
    for (const type of GESTURES) target.addEventListener(type, onGesture, LISTENER_OPTIONS);
  }

  play(name: SoundName): void {
    const context = this.context;
    if (!context || !this.gain || context.state !== "running") return this.record(name, "locked");
    if (this.effectiveVolume() === 0) return this.record(name, "muted");
    const buffer = this.buffers.get(name);
    if (!buffer) return this.record(name, "unavailable");
    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain);
      source.start();
    } catch {
      return this.record(name, "unavailable");
    }
    this.record(name);
  }

  private async decode(name: SoundName): Promise<void> {
    const context = this.context!;
    const attempt = (bytes: Promise<ArrayBuffer>) =>
      bytes.then((data) => context.decodeAudioData(data));
    try {
      this.buffers.set(name, await attempt(this.fetches!.get(name)!));
    } catch {
      // One more try, as MP3: some browsers claim Ogg Opus but cannot decode it, MP3 plays
      // everywhere, and a fetch that failed at startup may succeed now.
      try {
        this.buffers.set(name, await attempt(this.fetchClip(this.clips[name].mp3)));
      } catch {
        // Skipped: the game goes on without this clip.
      }
    }
  }

  private effectiveVolume(): number {
    return this.settings.muted ? 0 : this.settings.volume;
  }

  private update(change: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...change };
    if (this.gain) this.gain.gain.value = this.effectiveVolume();
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage can be full or blocked; the setting still applies to this page.
    }
    this.listeners.forEach((listener) => listener());
  }

  private record(name: SoundName, reason?: SoundRecord["reason"]): void {
    const detail: SoundRecord = reason ? { name, played: false, reason } : { name, played: true };
    this.target?.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail }));
  }
}

const files = import.meta.glob<string>("../assets/sounds/*.{ogg,mp3}", {
  eager: true,
  query: "?url",
  import: "default",
});

/** Each sound's two files, from src/assets/sounds/<name>.ogg and .mp3. */
export const CLIPS = Object.fromEntries(
  SOUND_NAMES.map((name) => [
    name,
    {
      ogg: files[`../assets/sounds/${name}.ogg`],
      mp3: files[`../assets/sounds/${name}.mp3`],
    },
  ])
) as Record<SoundName, Clip>;

export const sounds = new SoundManager({ clips: CLIPS });
