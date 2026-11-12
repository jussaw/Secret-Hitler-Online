# Phase 6: Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Game events are audible, each in step with the animation it belongs to, with a mute button and a volume slider in the header on every page.

**Architecture:** Three modules in `frontend/src/sound/`. `SoundManager` plays short clips through Web Audio. It creates its `AudioContext` only inside the first real gesture, so nothing can play, or log an autoplay warning, before then. `soundEvents` is a pure function from (previous state, next state, local player) to sound names, and `SOUND_CUES` names the queued animation each sound waits for. `App` puts each sound into its existing animation queue just before that animation. `SoundControl` is the speaker button and slider, placed in the three headers.

**Tech Stack:** React 18, TypeScript 5, Vite 8, Vitest 5 · `lucide-react` 1.63.0 · Web Audio (`AudioContext`, `GainNode`) · `@playwright/test` 1.64.1 · ffmpeg (libopus, libmp3lame) for the clips · Java 17 jar from the Gradle 7.4.2 wrapper.

Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 6. Spec: [`docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`](../specs/2026-11-11-self-hosted-fork-design.md), section "6. Sounds".

## Global Constraints

- Events: your turn / input needed, player joined lobby, game start and role reveal, nomination, vote cast, votes revealed (passed / failed), election tracker advance, card draw, card discard, policy enacted (one per party), presidential power used, investigation, execution, veto, victory, defeat.
- Clips are CC0 only (Freesound with the CC0 filter, Kenney, OpenGameArt's CC0 section; no CC-BY, no Pixabay licence, nothing merely "royalty-free"), stored in `frontend/src/assets/sounds/`, listed with file, source URL, author and licence in `docs/SOUND-CREDITS.md`. Short, normalized, OGG with MP3 fallback, under 100 KB each where possible. No music.
- Volume and mute are per browser, in `localStorage`. Before the first user gesture `play` is a silent no-op, and the console shows no autoplay warning.
- A sound file that fails to load is skipped; the game is unaffected.
- UI: a speaker button with a volume slider in the header on every page. The desktop table, the phone layout and the narrow-window layout look the same apart from the new control. No new art; the speaker icons come from the Lucide icon pack (`lucide-react`, ISC), at the user's request.
- The WebSocket protocol does not change.
- Do not fix the baseline issues in `CLAUDE.md` (#4, #5, #8, #9, #10, #13) or the 30 s WebSocket idle timeout. Ask the user first if this phase has to touch their code. Anything that drives a game keeps every socket pinging (about every 10 s).
- Java 17 for Gradle and `npm run e2e` (`JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu` locally). Lockfile changes use `npx npm@11.21.1`. `npm run e2e` needs `npx playwright install chromium firefox`.
- Commits follow Conventional Commits with a scope (`frontend`, `ci`, `plan`, `docs`, `claude`); tick each `docs/PLAN.md` box in the same commit as its work.
- The user picks every clip from a shortlist before anything is downloaded, listens to the sounds in a real game, and is asked before the PR is merged.

## Findings from the re-read

Measured against `./gradlew runLocal` and `npm run dev` with Playwright's Chromium and Firefox; scripts and screenshots are in the session scratchpad.

1. **Line numbers.** `onGameStateChanged` is at `App.tsx:968`, not 1025. The queue is `animationQueue` (`App.tsx:198`), run by `onAnimationFinish` (1453), `clearAnimationQueue` (1469) and `addAnimationToQueue` (1481); `App.tsx:129` has the "Refactor out AnimationQueue" TODO. `showVotes` is at 1493. The lobby and investigation packets are handled in `onWebSocketMessage` (405, 437), and `tryOpenWebSocket` is at 276. The header is in three places: `App.tsx:632` (login), `App.tsx:823` (lobby) and `GameScreen.tsx:40` (game).
2. **The queue.** It is a FIFO of functions, and each one calls `onAnimationFinish` when it is done. An event bar takes 2.5 s. `showVotes` takes 6.5 s: the vote cards flip at 1 s and the tally ("4 - 1: Vote passed") appears at 2 s. A status message takes no time. A prompt holds the queue until the player closes it, or until the server's next `ok` for prompts queued with `closeOnOK`. `clearAnimationQueue` drops everything still waiting. It runs on a disconnect to the login page, on LEAVE LOBBY and on confirming a portrait.
3. **The queue waits on the player's own prompts.** While your vote prompt is open, other players' votes keep arriving, and a sound queued behind that prompt would play only after you vote. In the lobby the portrait picker holds the queue the same way. So vote-cast and player-joined sounds cannot use the queue.
4. **What the server sends** (`Lobby.updateAllUsers`, `SecretHitlerGame`). Every command sends every player a fresh state. CPU players vote in the same tick as the nomination, and their votes go out with the next human vote. Each human vote sends one packet. The vote that completes the round sends the next state with every vote in `userVotes`. A failed vote goes to `POST_LEGISLATIVE` with the tracker one higher and `electionTrackerAdvanced` true. On the third failure the top policy is enacted instead, with the tracker back at 0 (`POST_LEGISLATIVE`, or a policy victory). `electionTrackerAdvanced` stays true until the next nomination, so PLAN's example ("`electionTrackerAdvanced` true returns `trackerAdvance`") would fire again on END TERM. Veto: `LEGISLATIVE_CHANCELLOR` → `LEGISLATIVE_PRESIDENT_VETO`. If the president agrees, the tracker advances; if not, the state goes back to `LEGISLATIVE_CHANCELLOR`.
5. **The president's investigation result is its own packet** (`investigation`), sent before the `ok` and the new state. `InvestigationAlert` is queued ahead of that state's steps, so a sound taken from the state change would play only after the president closes the alert. The other players see "INVESTIGATION RESULTS" from `POST_LEGISLATIVE` with `lastState` `PRESIDENTIAL_POWER_INVESTIGATE`.
6. **App's `oldState` cannot tell a game start from a reload.** After a reload, `this.state.gameState` is `DEFAULT_GAME_STATE` (`SETUP`), the same as when a game starts. After a dropped socket it keeps the last state and is not reset. `tryOpenWebSocket` does reset `usernames` to `[]` on every socket. A rejoin gets a game packet with no lobby packet first, while a game start comes after lobby packets.
7. **Roles.** A player always receives their own role and, once the game is over, everyone's. `GameToJSONConverter.convert` throws for a name that is not a player, so today nobody outside `playerOrder` gets game packets. Spectators arrive in Phase 7.
8. **Headers** (measured at every size). The login and lobby headers are identical: 51.8px tall at 360x740, 64px at 412x915, and 54-134px on desktop. The title leaves at least 66px clear on each side at 360. The game header is slimmer (`GameScreen.css`): 33.9px at 1280x720, 50.8px at 1920x1080, 34.8px at 360x740, 43.1px at 412x915, 42.4px at 700x900 and 33px at 800x700. On phones that is less than a 44px touch target. At 360 the first seat row (its label line) starts 8px below the header, and the top-right seat spans x 260-340. `App.css`'s `(max-width: 768px)` rule makes every button and input at least 44px tall, which also covers 700x900 and 744x1133 in `NARROW_WINDOWS`.
9. **The prompt overlay covers the header.** `#alert` is fixed, `inset: 0`, at z-index 75, with a backdrop at 0.8 opacity. While any prompt is open, which is when most sounds play, a control under it cannot be clicked. The snackbar sits at 100.
10. **Playwright does not enforce autoplay.** In Playwright's Chromium and Firefox, `navigator.userActivation.hasBeenActive` is already true before any click, because `page.evaluate` counts as activation. An `AudioContext` made with no gesture starts "running". A test therefore cannot wait for the browser to refuse. It has to prove that the app itself creates no `AudioContext` and starts no clip before the first trusted gesture. Real Chrome logs "The AudioContext was not allowed to start" when a context is created before a gesture, so the context must be created inside one. Touch `pointerdown` is not an activating event; `pointerup`, `touchend`, mouse `pointerdown` and `keydown` are.
11. **Formats.** `canPlayType`: Chromium says "probably" to Ogg Opus, Ogg Vorbis and MP3; Firefox says "probably" to Ogg and "maybe" to MP3. Safari before 18.4 has no Ogg. The local ffmpeg has libopus and libmp3lame but no libvorbis (only the experimental native encoder). Vite treats `.ogg` and `.mp3` as assets.
12. **iOS ignores `HTMLAudioElement.volume`**, so a working slider on iPhones needs Web Audio's `GainNode`.
13. **The e2e build is production** (no `VITE_DEBUG`), so a record of `play()` calls behind `DEBUG` would not exist in `npm run e2e`.
14. `docs/SOUND-CREDITS.md` does not exist yet, though `CLAUDE.md` already refers to it. `main.tsx` renders `App` in `StrictMode`, which constructs `App` twice in development, so audio set-up belongs in a module singleton rather than in `App`'s constructor.

## Decisions

**D1. `SoundManager` uses Web Audio.** One `AudioContext` with one `GainNode` (gain = `muted ? 0 : volume`). Each `play` starts a new `AudioBufferSourceNode`, so clips can overlap. HTMLAudioElement is ruled out by Finding 12. `frontend/src/sound/SoundManager.ts` exports the class, the name list, the clip map and a singleton `sounds`:

```ts
export const SOUND_NAMES = ["yourTurn", "playerJoined", "gameStart", "nominate", "voteCast", "votePassed",
  "voteFailed", "trackerAdvance", "cardDraw", "cardDiscard", "policyLiberal", "policyFascist", "power",
  "investigate", "execution", "veto", "victory", "defeat"] as const;
export type SoundName = (typeof SOUND_NAMES)[number];
export type Clip = { ogg: string; mp3: string };
export type SoundSettings = { volume: number; muted: boolean };
export type SoundRecord = { name: SoundName; played: boolean; reason?: "locked" | "muted" | "unavailable" };
export const SOUND_EVENT = "sound-play"; // CustomEvent<SoundRecord>, dispatched on `target` for every play()
export const SETTINGS_KEY = "sounds";    // localStorage: {"volume":0.7,"muted":false}
export const DEFAULT_SETTINGS: SoundSettings = { volume: 0.7, muted: false };

export type SoundDeps = {
  clips: Record<SoundName, Clip>;
  storage?: Pick<Storage, "getItem" | "setItem"> | null; // default: localStorage, or null if it throws
  createContext?: () => AudioContext;                      // default: () => new AudioContext()
  fetchClip?: (url: string) => Promise<ArrayBuffer>;       // default: fetch, rejecting when !ok
  canPlayOgg?: () => boolean;                              // default: canPlayType('audio/ogg; codecs="opus"') !== ""
  isActivated?: () => boolean;                             // default: navigator.userActivation?.isActive ?? true
  target?: EventTarget;                                    // default: window
};

export class SoundManager {
  constructor(deps: SoundDeps);
  getSettings(): SoundSettings;           // the same object until a setting changes (useSyncExternalStore)
  subscribe(listener: () => void): () => void;
  setVolume(volume: number): void;        // clamps to 0..1, saves, sets the gain
  setMuted(muted: boolean): void;         // saves, sets the gain
  preload(): Promise<void>;               // fetches every clip in the preferred format; never rejects
  unlock(): void;                         // see D2
  listenForGesture(target: Pick<EventTarget, "addEventListener" | "removeEventListener">): void; // see D2
  play(name: SoundName): void;            // never throws; dispatches a SoundRecord
}
export const CLIPS: Record<SoundName, Clip>; // built with import.meta.glob from ../assets/sounds
export const sounds: SoundManager;
```

Stored settings that are not valid JSON, or whose `volume` is not a number in 0..1, fall back to `DEFAULT_SETTINGS`. Storage that throws (private windows) is treated as absent. The slider is linear: gain = volume.

**D2. Unlock and autoplay.** "The first gesture" is the browser's own definition of user activation: the first click, tap or key press anywhere on the page. `listenForGesture(document)` (called from `main.tsx`) adds capture listeners for `pointerdown`, `pointerup`, `touchend`, `keydown` and `click`. Each ignores events whose `isTrusted` is false and calls `unlock()`. The listeners are removed once the context is "running". `unlock()` does nothing unless `isActivated()` is true (Finding 10: touch `pointerdown` comes before activation, and making a context then would log the warning). It creates the context once, calls `resume()`, and decodes the clips that `preload` fetched. On every page the first gesture comes before any sound: JOIN or CREATE LOBBY on the login page, and again after a reload, because rejoining also goes through JOIN.

`play(name)` dispatches a record and returns without touching any audio API in these cases. Reason `"locked"`: there is no context, or its state is not "running" (so a suspended context cannot release a burst of queued clips later). Reason `"muted"`: muted, or volume 0. Reason `"unavailable"`: the clip has not decoded or failed to load. Since no `AudioContext` exists before the first gesture, nothing can log an autoplay warning. A unit test checks that `createContext` is never called before `unlock`. A browser test reaches a game using only untrusted clicks, then checks three things: no `AudioContext` was constructed, every record so far says `"locked"`, and the console shows no warning or error.

Added by the final review: the gesture listeners stay for the whole session, and each trusted gesture resumes a context the browser has suspended or interrupted (iOS does for calls, Siri and some screen locks). Without that, sound stopped for the rest of the session.

**D3. Preload, formats and size.** The clip map is built with `import.meta.glob("../assets/sounds/*.{ogg,mp3}", { eager: true, query: "?url", import: "default" })`. A unit test checks that every `SoundName` has both files. `main.tsx` calls `sounds.preload()` at startup, which fetches the 18 clips in one format: Ogg Opus when `canPlayOgg()` is true, otherwise MP3 (Safari before 18.4). Opus is used rather than Vorbis because the local ffmpeg has libopus and no libvorbis (Finding 11), and Opus is smaller at the same quality. `unlock` decodes the fetched clips. A clip that fails to fetch or decode is fetched and decoded once more as MP3, and one that fails both times is skipped. Clips are mono, 48 kHz Opus at about 64 kbps and 44.1 kHz MP3 at about 96 kbps, so a 1-2 s effect is about 10-25 KB. Budget: every file under 100 KB, and under 600 KB for each format's 18 files. Task 1 reports the real sizes.

**D4. The record.** Every `play()` dispatches `new CustomEvent(SOUND_EVENT, { detail: SoundRecord })` on `window`, in production as well, because the e2e build has no `DEBUG` (Finding 13). It costs one event per sound and changes nothing when nobody listens. Browser tests and the acceptance drive listen from an init script and record each sound with the time and what was on screen two animation frames later: the alert's heading, the event bar's text when it is showing, and the status text.

**D5. The event table.** "Everyone" means every player whose client gets the packet, dead players included. Rules compare `prev` and `next`; `POLICY_STATES` is the list App already uses at `App.tsx:991` (`POST_LEGISLATIVE`, the four powers, and the two policy victories).

| Sound | Plays when (`prev` → `next`) | Who hears it | Waits for (cue) |
|---|---|---|---|
| `playerJoined` | a lobby packet holds a name the previous lobby packet on this socket did not | everyone in the lobby | `now`: on arrival |
| `gameStart` | `prev.state` is `SETUP` (the lobby) and `next.state` is not | everyone | `start`: the role reveal opening |
| `nominate` | `CHANCELLOR_NOMINATION` → `CHANCELLOR_VOTING` | everyone | `phase`: the VOTING event bar |
| `voteCast` | `prev.state` is `CHANCELLOR_VOTING` and `next.userVotes` has more entries, including the vote that closes the round | everyone | `now`: on arrival (Finding 3) |
| `votePassed` | `CHANCELLOR_VOTING` → `LEGISLATIVE_PRESIDENT` or `FASCIST_VICTORY_ELECTION` | everyone | `votes`: the tally line, 2 s into `showVotes` |
| `voteFailed` | `CHANCELLOR_VOTING` → any other state | everyone | `votes`: the tally line |
| `trackerAdvance` | `next.state` in `POLICY_STATES`, `next.electionTracker !== prev.electionTracker`, and (`next.electionTracker !== 0` or `next.electionTrackerAdvanced`), the same test as the alert (`App.tsx:1001-1006`) | everyone | `tracker`: `ElectionTrackerAlert` opening |
| `cardDraw` | → `LEGISLATIVE_PRESIDENT` from any other state | everyone | `phase`: the LEGISLATIVE SESSION event bar, after the vote reveal |
| `cardDiscard` | `LEGISLATIVE_PRESIDENT` → `LEGISLATIVE_CHANCELLOR` (the president's discard; the chancellor's is heard as the policy) | everyone but the chancellor, whose prompt opens at that moment with `yourTurn` | `phase`: the "Waiting for the chancellor" status line |
| `policyLiberal` | `next.state` in `POLICY_STATES` and `next.liberalPolicies > prev.liberalPolicies` | everyone | `policy`: `PolicyEnactedAlert` opening |
| `policyFascist` | the same for `fascistPolicies` | everyone | `policy` |
| `power` | → one of the four power states from any other state | everyone | `phase`: the PRESIDENTIAL POWER event bar |
| `investigate` | `PRESIDENTIAL_POWER_INVESTIGATE` → `POST_LEGISLATIVE` | everyone but the president, who hears it from the `investigation` packet (Finding 5) | `result`: "INVESTIGATION RESULTS", or `InvestigationAlert` for the president |
| `execution` | `PRESIDENTIAL_POWER_EXECUTION` → `POST_LEGISLATIVE` or `LIBERAL_VICTORY_EXECUTION` | everyone | `result`: "EXECUTION RESULTS" or "YOU HAVE BEEN EXECUTED" |
| `veto` | `LEGISLATIVE_CHANCELLOR` → `LEGISLATIVE_PRESIDENT_VETO` (the chancellor moves to veto; an approved veto is heard as `trackerAdvance`) | everyone but the president, whose prompt opens at that moment with `yourTurn` | `phase`: the "motioned to veto" status line |
| `yourTurn` | D6 | the local player only | `prompt`: their prompt opening |
| `victory` | → one of the four victory states, and the local player's party won, or the user is not in `playerOrder` (D9) | the winners | `end`: the victory prompt opening |
| `defeat` | the same, and the local player's party lost | the losers | `end` |

`soundEvents` returns the names in the order they play: `voteCast`, `votePassed`/`voteFailed`, `trackerAdvance`, the policy, `gameStart`, `nominate`, `cardDraw`, `cardDiscard`, `veto`, `power`, `investigate`, `execution`, `yourTurn`, `victory`/`defeat`. Party comes from `next.players[user].id`: `FASCIST` and `HITLER` are fascist, and `LIBERAL` is liberal.

**D6. Your turn.** The local player is "the one who must act" in these cases: `CHANCELLOR_NOMINATION`, `LEGISLATIVE_PRESIDENT`, `LEGISLATIVE_PRESIDENT_VETO`, the four power states and `POST_LEGISLATIVE` (END TERM) when they are `next.president`, and `LEGISLATIVE_CHANCELLOR` when they are `next.chancellor`. They must also be alive. Voting is not on the list: every living player votes at once, and `nominate` already announces it. `yourTurn` plays when `prev.state !== next.state` and `next` makes the local player the actor. Every action moves the game to a new state, so this is once per action. It does not repeat when a packet arrives in the same state (a vote, another player reconnecting). A veto refused by the president gives the chancellor `yourTurn` again, because they must choose again. `prev` undefined plays nothing (D7), so a reconnect or reload never plays it. END TERM counts (the user's call): it is the only action with no prompt, and a president who forgets it stalls the game. A president therefore hears three or four `yourTurn`s per term.

**D7. No burst after a reload or reconnect.** App keeps its own previous state for sounds, separate from `this.state.gameState` (Finding 6):
- `soundState?: GameState` and `lobbyUsers?: string[]`, both set to `undefined` in `tryOpenWebSocket`. Every new socket starts with no history: a reload, a reconnect after a drop, a rejoin, or RETURN TO LOBBY.
- On a lobby packet: `lobbySounds(this.lobbyUsers, usernames)` plays; then `lobbyUsers = usernames` and `soundState = DEFAULT_GAME_STATE` (state `SETUP`, the lobby).
- On a game packet: `soundEvents(this.soundState, next, name)`, then `soundState = next`.
- `soundEvents(undefined, …)` and `lobbySounds(undefined, …)` return `[]`. So the first packet on a socket plays nothing, while a game that starts from the lobby plays `gameStart`.

**D8. Riding the queue.** `soundEvents.ts` exports `type Cue = "now" | "start" | "votes" | "tracker" | "policy" | "phase" | "prompt" | "result" | "end"` and `SOUND_CUES: Record<SoundName, Cue>` (D5's last column). App gets three methods:
- `playSounds(names)` calls `sounds.play` for each name.
- `queueSounds(names, cue)` plays the names with that cue at once if `cue` is `"now"`. For any other cue it queues one instant step (`playSounds`, then `onAnimationFinish`) when any name has that cue.
- `showVotes(newState, names = [])` plays the `votes` names in its existing 2000 ms timeout, together with the tally text.

`onGameStateChanged` calls `queueSounds(sounds, cue)` just before the step each cue names, so a sound starts with its animation in the same tick (the step order is in Task 4). Clearing the queue drops the sound steps waiting in it, so a sound whose animation never runs never plays. `clearAnimationQueue` also cancels a vote-tally sound that a running `showVotes` has scheduled. App keeps those timers in `soundTimers`. A clip already playing is under 2 s and is left to finish.

**D9. Users not in `playerOrder`.** No such user gets game packets yet (Finding 7). `soundEvents` must still not throw for one, and it treats them as an onlooker. They hear every "everyone" sound, never `yourTurn`, `investigate` as a non-president, and `victory` at the end of the game, as PLAN says for spectators. Phase 7 adds spectators without changing `soundEvents`.

**D10. The control.** `frontend/src/sound/SoundControl.tsx`:

```html
<div class="sound-control [open]" role="group" aria-label="Sound">
  <button type="button" class="sound-toggle" aria-label="Mute sounds" aria-pressed="false"><svg class="lucide lucide-volume-2" aria-hidden="true">…</svg></button>
  <div class="sound-volume"><input type="range" min="0" max="100" step="5" aria-label="Volume" aria-valuetext="70%"></div>
</div>
```

- Settings come from `useSyncExternalStore(sounds.subscribe, sounds.getSettings)`, so the three headers stay in step.
- The button toggles mute. Its `aria-pressed` reports the muted state, and its label stays "Mute sounds". The icon is Lucide's `VolumeX` when muted or at volume 0, `Volume1` below 50% and `Volume2` otherwise (the user asked for a minimalist icon from a popular pack). It comes from `lucide-react`, pinned at 1.63.0, the newest release at least two weeks old. It is drawn in `currentColor` (the header's white) at about 60% of the button, with `aria-hidden`.
- The slider changes the volume in 5% steps and unmutes if the sound was muted. Arrow keys, Page Up/Down and Home/End work because it is a native range input.
- The slider sits in a small panel right below the button, in the header colour, absolutely positioned so that no layout moves. When hidden it has `opacity: 0; pointer-events: none`, so it stays in the accessibility tree. It shows in these cases:
  - Desktop: on hover (`@media (hover: hover)`), or while the control holds keyboard focus (`:has(:focus-visible)`), so Tab reaches the button, then the slider.
  - Phones: a tap on the button toggles mute and also adds `open`, which shows the slider. A tap anywhere outside the control removes it. This needs no focus, because iOS Safari does not focus buttons on tap.
- Placement: `header` becomes `position: relative` (`App.css`). The control is absolutely positioned at the header's right edge (`right: 8px`, or 1vw if larger), so the title stays centred and the header keeps its height. The title leaves at least 66px on each side at 360 (Finding 8). On desktop the button is as tall as the header allows, up to 44px. On phones, and in windows up to 768px wide, it is 44x44. In the game header that is taller than the header at 360x740 (34.8px) and 700x900 (42.4px). The plan keeps the header as it is: the button is top-aligned with its glyph centred on the title line, and the rest of its hit area hangs up to 9px below the header, over the empty label line of the top-right seat, which is not interactive. The user chose this over a 44px game header on phones, which would move the stacked page down 9px at 360.
- Added after the final review, at the user's request: the chancellor and the president no longer hear `cardDiscard` or `veto` at the moment `yourTurn` opens their prompt (D5). The slider-open rules are separate from the `:has()` rule, which an older browser would drop with its whole selector list (the production build already split them). A disconnect during the vote reveal is tested to cancel the result sound.
- Added by the final review: the slider's panel starts below the button. A click-through strip joins it to the header, so on phones the whole 44px button stays tappable with the slider out. At volume 0 the button shows as pressed, and pressing it brings the sound back at 70%.
- Over prompts: `.sound-control` has `z-index: 80`, above the prompt overlay (75) and below the snackbar (100), so you can mute while a prompt is open, which is when most sounds play (Finding 9). The speaker then shows above the dimmed backdrop in its corner (the user's call).

**D11. Tests.**
- Unit: `SoundManager.test.ts` (Task 2), `soundEvents.test.ts` (Task 3) and `SoundControl.test.tsx` (Task 5).
- Browser, new: `e2e/sounds.spec.ts`. It runs in `desktop` and both phone projects (no config change), and in `firefox` for the header-fit test only; tests that need audio skip there.
- The existing no-scroll, phone and prompt tests still pass, and they now include the control: phone `smallTargets(page, "body")` and `".game-screen"` check its 44px, and no-scroll checks page height and width with it in place.

**D12. Acceptance drive** (scratchpad, never the repo). Seven Chromium contexts at 1920x1080 play one full game against `runLocal` and `npm run dev`. Each page records `sound-play` events with their screen context (D4) and keeps its socket pinging every 10 s. The script chooses moves so that every sound occurs at least once. Round 1 fails its vote. One chancellor enacts a liberal policy. Presidents otherwise discard a liberal and chancellors enact a fascist. After five fascist policies, a chancellor vetoes and the president agrees. Powers target a living non-president who is not Hitler. The sixth fascist policy wins. The script nominates around Hitler after three fascist policies, using a fascist player's view. A checker then compares each page's record with what the game did. Counts: one `policyLiberal` or `policyFascist` per enacted policy, one `voteFailed` or `votePassed` per election, one `voteCast` per vote packet, one `yourTurn` per action of that player, and one `victory` or `defeat` each. Order: the record follows the game's sequence of events. Context: each sound's screen context matches its cue (for example, `nominate` with the VOTING bar, `votePassed` with "Vote passed", `policyFascist` with "POLICY ENACTED"). The user gets a table by event. The drive also collects every page's console and compares it with the baseline warnings.

**D13. Out of scope.** Music. Per-sound volume. The iPhone ring/silent switch, which Web Audio follows. Fitting tall prompts. The baseline issues and the idle timeout.

## Review Focus

1. **A packet in the same state must not replay a sound.** Repeats come from reconnects (`updateAllUsers` on every connect), from icon updates in the lobby, and from the same state sent twice. Task 3: "a packet in the same state plays nothing" (every state, `prev` equal to `next`).
2. **A sound must not play out of step when the queue is cleared or blocked.** Cases: the vote cast while the player's own vote prompt is open, and a disconnect during `showVotes`. Task 4 browser test: `voteCast` is recorded while the vote prompt is still open. Task 4 Step 5 cancels the tally timer in `clearAnimationQueue`.
3. **Nothing may play, or log, before the first trusted gesture, including after a reload into a running game.** Task 4 browser test "no sound plays and no AudioContext exists before the first gesture", plus D7's `undefined` rule in Task 3.
4. **The control must not change any layout at any size**, including Firefox's rounding in narrow windows, and must stay a 44px target on phones with the slider open. Task 5 browser test "the control fits every header", run in all four projects.
5. **Bad storage or a missing clip must never break the game.** Cases: `localStorage` throwing, garbage in `sounds`, a 404 clip, an undecodable OGG. Task 2 unit tests.

## File map

| File | Change | Task |
|---|---|---|
| `frontend/src/assets/sounds/<name>.ogg`, `.mp3` | new: 18 clips, two formats | 1 |
| `docs/SOUND-CREDITS.md` | new: file, source URL, author, licence per clip | 1 |
| `frontend/src/sound/SoundManager.ts`, `SoundManager.test.ts` | new (D1-D4) | 2 |
| `frontend/src/main.tsx` | `sounds.preload()`, `sounds.listenForGesture(document)` | 2 |
| `frontend/src/sound/soundEvents.ts`, `soundEvents.test.ts` | new (D5-D9) | 3 |
| `frontend/src/App.tsx` | sound state, `playSounds`, `queueSounds`, cue steps, `showVotes` names, investigation packet, timers | 4 |
| `frontend/e2e/sounds.spec.ts` | new: gesture, wiring (Task 4); control (Task 5) | 4, 5 |
| `frontend/playwright.config.ts` | `firefox` also matches `sounds.spec` | 5 |
| `frontend/src/sound/SoundControl.tsx`, `.css`, `SoundControl.test.tsx` | new (D10) | 5 |
| `frontend/package.json`, `package-lock.json` | `lucide-react` 1.63.0 | 5 |
| `frontend/src/App.tsx` (632, 823), `frontend/src/game/GameScreen.tsx` (40), `frontend/src/App.css` (`header`) | control in the three headers | 5 |
| `CLAUDE.md` | sound modules, record event, credits rule, `sounds.spec.ts` | 5 |
| `docs/PLAN.md` | ticks; Phase 6 wording follows this breakdown | 1-5 |

---

### Task 1 (PLAN 6.1): Source clips

**Files:**
- Create: `frontend/src/assets/sounds/<SoundName>.ogg` and `.mp3` for each of the 18 names, `docs/SOUND-CREDITS.md`
- Scratchpad only: `sounds-src/` (downloads, one folder each), `clips/process.sh` (the ffmpeg pipeline)

**Interfaces:**
- Produces: files named exactly after `SOUND_NAMES` (D1), for example `frontend/src/assets/sounds/policyFascist.ogg`. Task 2's glob and its "every sound has both files" test consume them.

- [ ] **Step 1: Shortlist.** For each sound, 2-3 CC0 candidates with a link the user can listen to in the browser: a Freesound sound page (filtered to CC0), an OpenGameArt page in its CC0 section, or a Kenney pack page with the file named. For each candidate give the licence as stated on its page and a few words on how it sounds. Hint: rubber stamp or gavel for policies, a card slide and flip for draw and discard, a short fanfare for victory, a falling tone for defeat. **Stop and give the list to the user. Do not download anything until they pick.**

- [ ] **Step 2: Download the picks** into their own new folders, `scratchpad/sounds-src/<SoundName>/`, one source each. Re-check the licence on each page at download time.

- [ ] **Step 3: Process.** `clips/process.sh` (in the scratchpad, taking paths as arguments) runs, per clip: trim the silence at both ends (`silenceremove`, plus the start and end the user picked if the source is long), fade the last 20 ms out, downmix to mono, then loudness-normalize. Clips under 3 s are too short for `loudnorm` to measure reliably, so it measures integrated loudness on the clip padded with silence (`apad`, `ebur128`) and applies the gain with `volume`, with `alimiter` capping true peak at -1.5 dBTP. Target: -18 LUFS for effects, and the same for `victory`/`defeat` unless they sound too loud beside the rest. Export `libopus -b:a 64k` (`.ogg`, 48 kHz) and `libmp3lame -b:a 96k` (`.mp3`, 44.1 kHz).

- [ ] **Step 4: Check.** `ffprobe` every output: codec, mono, duration. Print each file's size and integrated loudness (`ebur128`), and both formats' totals. Expected: every file under 100 KB (any exception named, with why), each format under 600 KB in total, and loudness within ±1 LU of the target. Play each pair locally (`afplay`) to confirm the OGG and MP3 sound the same and nothing clips.

- [ ] **Step 5: `docs/SOUND-CREDITS.md`.** A table with one row per sound name: files (`<name>.ogg`, `<name>.mp3`), source title and URL, author as credited on the source page, licence ("CC0 1.0"), and what was changed ("trimmed, normalized, mono"). Above the table, one line: every clip is CC0, so credit is a courtesy, and a new clip must be CC0 and get a row here.

- [ ] **Step 6: Commit.** This ticks "Begin Task 6.1" and the three Task 6.1 boxes. The second box is reworded to D3: "exported as Ogg Opus and MP3".

```bash
git add frontend/src/assets/sounds docs/SOUND-CREDITS.md docs/PLAN.md
git commit -m "feat(frontend): add cc0 sound clips and their credits"
```

### Task 2 (PLAN 6.2): `SoundManager`

**Files:**
- Create: `frontend/src/sound/SoundManager.ts`, `frontend/src/sound/SoundManager.test.ts`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: Task 1's files.
- Produces: everything in D1, used by Tasks 3-5: `SOUND_NAMES`, `SoundName`, `SoundRecord`, `SOUND_EVENT`, `SETTINGS_KEY`, `DEFAULT_SETTINGS`, `SoundManager`, `CLIPS`, `sounds`.

- [ ] **Step 1: Write the failing tests** in `SoundManager.test.ts`, with fakes passed through `SoundDeps`. These are a `FakeContext` (records `createBufferSource().start()` calls, exposes `gain.gain.value`, has a settable `state`, a `decodeAudioData` that resolves a fake buffer, or rejects for bytes marked bad), an in-memory storage, a `fetchClip` that resolves an `ArrayBuffer` per URL or rejects for chosen URLs, and a fake gesture target that stores its listeners. Tests:
  - `starts at 70% volume, unmuted, with nothing stored`: `getSettings()` equals `{ volume: 0.7, muted: false }`.
  - `saves volume and mute, and a new manager restores them`: after `setVolume(0.25)` and `setMuted(true)`, storage holds `{"volume":0.25,"muted":true}` under `"sounds"`, and a second manager on that storage reports the same.
  - `ignores stored settings that are not valid`: `"not json"`, `{"volume":7}` and `{"volume":"loud","muted":"yes"}` all give `DEFAULT_SETTINGS`.
  - `works when localStorage throws`: storage whose `getItem` and `setItem` throw; `setMuted(true)` does not throw and `getSettings().muted` is true.
  - `clamps the volume to 0..1`: `setVolume(1.5)` gives 1 and `setVolume(-1)` gives 0.
  - `does nothing before unlock and creates no AudioContext`: `play("nominate")` starts nothing, `createContext` was never called, and the record is `{ name: "nominate", played: false, reason: "locked" }`.
  - `unlock waits for user activation`: with `isActivated` returning false, `unlock()` does not call `createContext`.
  - `plays a clip after unlock at the set volume`: after `preload()`, `unlock()` and the decodes settle, `play("nominate")` starts one source, the gain is 0.7, and the record is `{ played: true }`.
  - `does nothing while muted or at volume 0`: no source starts, and the record reason is `"muted"`.
  - `does nothing while the context is suspended`: with `state` "suspended", the record reason is `"locked"`.
  - `a clip that fails to load does not throw, and the others still play`: `fetchClip` rejects for `veto`'s URL; `play("veto")` records `"unavailable"`, and `play("nominate")` plays.
  - `uses OGG when the browser can play it, MP3 otherwise`: the URLs fetched by `preload()` end in `.ogg`, or in `.mp3` when `canPlayOgg` is false.
  - `falls back to MP3 when an OGG does not decode`: `decodeAudioData` rejects `veto.ogg`'s bytes; after unlock, `play("veto")` plays, and `veto.mp3` was fetched.
  - `unlocks on the first trusted gesture and ignores synthetic ones`: calling the stored `pointerup` listener with `{ isTrusted: false }` creates no context. With `{ isTrusted: true }` it creates one. Once the context is running, every listener has been removed.
  - `creates the AudioContext once`: a second `unlock()` does not call `createContext`.
  - `notifies subscribers and keeps getSettings stable between changes`: the same object is returned twice, and a new one after `setMuted`.
  - `every sound has an OGG and an MP3 clip`: for each of `SOUND_NAMES`, `CLIPS[name].ogg` ends in `.ogg` and `CLIPS[name].mp3` in `.mp3`.

- [ ] **Step 2: Run them to verify they fail.** `cd frontend && npm test -- --run src/sound`. Expected: FAIL, `./SoundManager` cannot be resolved.

- [ ] **Step 3: Implement `SoundManager.ts`** to D1-D4. `preload` keeps each clip's `ArrayBuffer`, and `unlock` decodes them, falling back to MP3 per D3. A rejected decode or fetch leaves that clip `"unavailable"` and is caught, never rethrown. `play` connects the source to the gain node and the gain to `destination`, so the gain applies to every clip. The default `isActivated` treats a browser without `navigator.userActivation` as activated.

- [ ] **Step 4: Run the unit tests.** `cd frontend && npm test -- --run`. Expected: all pass.

- [ ] **Step 5: `main.tsx`.** Before `createRoot`: `sounds.listenForGesture(document); void sounds.preload();`.

- [ ] **Step 6: Build and check by hand.** `cd frontend && npm run build`. Expected: clean, with 18 `.ogg` and 18 `.mp3` files hashed into `dist/assets/` (`ls dist/assets | grep -c "\.ogg$"` prints 18). In the dev server, the login page fetches the 18 OGG files in the network panel, and the console has nothing new before or after the first click.

- [ ] **Step 7: Commit.** Ticks the three Task 6.2 boxes.

```bash
git add frontend/src/sound frontend/src/main.tsx docs/PLAN.md
git commit -m "feat(frontend): add a sound manager that unlocks on the first gesture"
```

### Task 3 (PLAN 6.3): `soundEvents`

**Files:**
- Create: `frontend/src/sound/soundEvents.ts`, `frontend/src/sound/soundEvents.test.ts`

**Interfaces:**
- Consumes: `SoundName` (Task 2); `GameState`, `LobbyState`, `Role` (`src/types`); `makeGameState` (`src/game/testGameState.ts`, tests only).
- Produces: `soundEvents(prev: GameState | undefined, next: GameState, user: string): SoundName[]`; `lobbySounds(prev: string[] | undefined, next: string[]): SoundName[]`; `type Cue`; `SOUND_CUES: Record<SoundName, Cue>` (D8). Task 4 uses all four.

- [ ] **Step 1: Write the failing tests.** Players `["Ann", "Bob", "Cat", "Dan", "Eve"]`, the user is `"Ann"` unless a row says otherwise, and states come from `makeGameState(NAMES, overrides)`. Write one `test.each` table of `[title, prev overrides, next overrides, user, expected]`, plus separate tests where a table does not fit. Every row of D5 has at least one case:
  - lobby to game: prev `{ state: SETUP }` → next nomination with president Bob gives `["gameStart"]`; with president Ann, `["gameStart", "yourTurn"]`.
  - nomination → voting (chancellor Cat): `["nominate"]`.
  - voting, `userVotes` `{}` → `{ Bob: true }`: `["voteCast"]`. The same votes again give `[]`.
  - voting with four votes → `LEGISLATIVE_PRESIDENT` with five (3 ja): `["voteCast", "votePassed", "cardDraw"]`.
  - voting with four votes, tracker 0 → `POST_LEGISLATIVE`, five votes (2 ja), tracker 1, `electionTrackerAdvanced` true, president Bob: `["voteCast", "voteFailed", "trackerAdvance"]`.
  - the third failure: voting, tracker 2 → `POST_LEGISLATIVE`, tracker 0, advanced, `fascistPolicies` 1, president Bob: `["voteCast", "voteFailed", "trackerAdvance", "policyFascist"]`.
  - `POST_LEGISLATIVE`, tracker 1, advanced → nomination, tracker 1, advanced, president Bob: `[]` (the flag alone does not fire, Finding 4).
  - `LEGISLATIVE_PRESIDENT` → `LEGISLATIVE_CHANCELLOR` (chancellor Cat): `["cardDiscard"]`; with chancellor Ann, `["cardDiscard", "yourTurn"]`.
  - `LEGISLATIVE_CHANCELLOR` → `POST_LEGISLATIVE` with `liberalPolicies` 1, president Bob: `["policyLiberal"]`.
  - `LEGISLATIVE_CHANCELLOR`, 1 fascist → `PRESIDENTIAL_POWER_INVESTIGATE`, 2 fascist: `["policyFascist", "power"]` with president Bob, and with president Ann `[..., "yourTurn"]`.
  - investigate → `POST_LEGISLATIVE` (lastState investigate, target Cat, president Bob): `["investigate"]` for Ann, and `["yourTurn"]` (END TERM, no `investigate`) for Bob.
  - execution → `POST_LEGISLATIVE` (target Cat, Cat dead, president Bob): `["execution"]`, for Cat too.
  - `LEGISLATIVE_CHANCELLOR`, 5 fascist → `LEGISLATIVE_PRESIDENT_VETO`: `["veto"]`; with president Ann, `["veto", "yourTurn"]`.
  - veto → `POST_LEGISLATIVE`, tracker 0 → 1, advanced, president Bob: `["trackerAdvance"]`.
  - END TERM: `LEGISLATIVE_CHANCELLOR` → `POST_LEGISLATIVE` with `liberalPolicies` 1 and president Ann: `["policyLiberal", "yourTurn"]`. A second `POST_LEGISLATIVE` packet gives `[]`.
  - veto → `LEGISLATIVE_CHANCELLOR` (`vetoOccurred` true), chancellor Ann: `["yourTurn"]`.
  - `LEGISLATIVE_CHANCELLOR`, 5 fascist → `FASCIST_VICTORY_POLICY`, 6 fascist: `["policyFascist", "victory"]` when Ann is `FASCIST` or `HITLER`, and `["policyFascist", "defeat"]` when she is `LIBERAL`.
  - execution → `LIBERAL_VICTORY_EXECUTION` (Bob is Hitler, dead), Ann liberal: `["execution", "victory"]`.
  - voting → `FASCIST_VICTORY_ELECTION`, Ann liberal: `["voteCast", "votePassed", "defeat"]` when the closing vote arrives with it.
  - voting is not your turn: nomination → voting gives Ann no `yourTurn`, whether or not she is president.
  - an onlooker (`"Zed"`, not in `playerOrder`): lobby to game gives `["gameStart"]`; nomination → voting gives `["nominate"]`; the fascist policy victory gives `["policyFascist", "victory"]`; none of the cases above give Zed `yourTurn`; and no case throws.
  - `a first packet plays nothing` (`test.each` over every `LobbyState`): `soundEvents(undefined, makeGameState(NAMES, { state }), "Ann")` is `[]`.
  - `a packet in the same state plays nothing` (`test.each` over every `LobbyState`, with Ann as president and chancellor): `soundEvents(s, s, "Ann")` is `[]`, and so is the same state sent again as a fresh copy.
  - `lobbySounds`: `undefined` → any list gives `[]`. `["Ann"]` → `["Ann", "Bob"]` gives `["playerJoined"]`. `["Ann"]` → `["Ann", "Bob", "Cat"]` gives a single `["playerJoined"]`. The same list gives `[]`, a shorter one gives `[]`, and `["Ann", "Bob"]` → `["Ann", "Cat"]` gives `["playerJoined"]`.
  - `every sound has a cue`: `SOUND_NAMES.every((name) => SOUND_CUES[name])`. The values equal D5's last column; spell out the expected object.

- [ ] **Step 2: Run them to verify they fail.** `cd frontend && npm test -- --run src/sound/soundEvents`. Expected: FAIL, `./soundEvents` cannot be resolved.

- [ ] **Step 3: Implement `soundEvents.ts`** to D5, D6, D8 and D9: one predicate per row, and names pushed in the play order of D5. `POLICY_STATES`, `POWER_STATES` and `VICTORY_STATES` are local constants. A comment on `POLICY_STATES` names `App.tsx`'s copy, which must stay the same.

- [ ] **Step 4: Run the unit tests.** `cd frontend && npm test -- --run`. Expected: all pass.

- [ ] **Step 5: Commit.** Ticks the three Task 6.3 boxes. The third is reworded to D9: "a user who is not in `playerOrder` (Phase 7's spectators) hears the public sounds and `victory`, never `yourTurn`".

```bash
git add frontend/src/sound/soundEvents.ts frontend/src/sound/soundEvents.test.ts docs/PLAN.md
git commit -m "feat(frontend): map game state changes to sounds"
```

### Task 4 (PLAN 6.4): Wire up

**Files:**
- Modify: `frontend/src/App.tsx` (`tryOpenWebSocket` 276, `onWebSocketMessage` 405 and 437, `onGameStateChanged` 968-1443, `clearAnimationQueue` 1469, `showVotes` 1493)
- Create: `frontend/e2e/sounds.spec.ts` (the first two tests)

**Interfaces:**
- Consumes: `sounds`, `SoundName`, `SOUND_EVENT`, `SoundRecord` (Task 2); `soundEvents`, `lobbySounds`, `SOUND_CUES`, `Cue` (Task 3); `openFakeGame`, `gamePacket`, `TEN` (`e2e/fakeGame.ts`).
- Produces, in `sounds.spec.ts`: `recordSounds(page): Promise<void>`, an init script that collects `{ name, played, reason, t, alert, eventBar, status }` into `window.__sounds` and counts `AudioContext` constructions in `window.__audioContexts`; and `soundLog(page)`, which reads them back. Task 5 reuses both.

- [ ] **Step 1: Write the failing browser tests** in `e2e/sounds.spec.ts`. They run in Chromium projects only (`test.skip(browserName !== "chromium")`), and the wiring test in `desktop` only.
  - `no sound plays and no AudioContext exists before the first gesture`: `recordSounds`; route `/new-lobby` and the `/game` socket as `fakeGame.ts` does; set the `name` cookie to `"Host Player"`; `goto("/")`. Press CREATE LOBBY with `page.evaluate(() => button.click())`, an untrusted click. Send lobby packets of nine names, then all ten (`playerJoined`), then a game start with the user as president (`gameStart`). Expect `__audioContexts` to be 0, every record so far to have `played: false, reason: "locked"`, and no console message of type `warning` or `error`. Then `page.mouse.click` OKAY on the role reveal, a trusted click. Expect `__audioContexts` to be 1, and the next record (`yourTurn` as the nomination prompt opens) to have `played: true`.
  - `each sound waits for its animation` (desktop): `openFakeGame` (its trusted click unlocks), then this sequence, answering prompts as a player would (OKAY clicks, `{ type: "ok" }` packets for prompts that close on the server's `ok`):
    1. lobby of nine, then ten: `playerJoined` on the lobby page;
    2. nomination, president `TEN[0]`: `gameStart` with the role reveal's heading, then `yourTurn` with "NOMINATION";
    3. voting (chancellor `TEN[1]`): `nominate` with the VOTING event bar;
    4. voting with one vote from `TEN[2]`: `voteCast` with the "VOTING" prompt still open;
    5. `POST_LEGISLATIVE` with tracker 1, advanced, and every vote (majority NEIN): `voteCast`, then `voteFailed` with status text ending "Vote failed", then `trackerAdvance` with the election tracker alert, then `yourTurn` with the status "Waiting for the president to end their term.";
    6. `LEGISLATIVE_CHANCELLOR`, then `PRESIDENTIAL_POWER_EXECUTION` with one fascist policy: `policyFascist` with "POLICY ENACTED", then `power` with the PRESIDENTIAL POWER bar, then `yourTurn` with "EXECUTION";
    7. `LIBERAL_VICTORY_EXECUTION`, target `TEN[1]` (Hitler, dead), with every role: `execution` with "EXECUTION RESULTS", then `defeat` with the victory prompt (the user is fascist).

    Expect the names in exactly this order, with no others, and each with its context.

- [ ] **Step 2: Run them to verify they fail.** `cd frontend && JAVA_HOME=<Java 17> npm run e2e -- --project=desktop e2e/sounds.spec.ts`. Expected: both FAIL; the first on `yourTurn` never being recorded, the second on an empty record.

- [ ] **Step 3: Sound state** (D7). Add the fields `soundState?: GameState`, `lobbyUsers?: string[]` and `soundTimers: ReturnType<typeof setTimeout>[] = []`. Clear the first two in `tryOpenWebSocket`. In the lobby case of `onWebSocketMessage`, call `this.queueSounds(lobbySounds(this.lobbyUsers, message[PARAM_USERNAMES]), "now")`, then set `lobbyUsers` and `soundState = DEFAULT_GAME_STATE`. In the investigation case, call `this.queueSounds(["investigate"], "result")` before `queueAlert(<InvestigationAlert …/>)`.

- [ ] **Step 4: Cue steps in `onGameStateChanged`.** At the top: `const sounds = soundEvents(this.soundState, newState, name); this.soundState = newState; this.queueSounds(sounds, "now");`. Then add `this.queueSounds(sounds, cue)` immediately before these steps:
  - `tracker`: the `ElectionTrackerAlert` `queueAlert` (1018), after the failed vote's `showVotes`, which gets `sounds` (1010);
  - `policy`: the `PolicyEnactedAlert` block (1032);
  - `start`: the `RoleAlert` (1064), first in `CHANCELLOR_NOMINATION`;
  - `phase`: the first step of `CHANCELLOR_VOTING` (1093), `LEGISLATIVE_CHANCELLOR` (1138), `LEGISLATIVE_PRESIDENT_VETO` (1163) and the four power cases (1178, 1198, 1211, 1225); in `LEGISLATIVE_PRESIDENT`, after `showVotes(newState, sounds)` (1114) and before its event bar;
  - `prompt`: each prompt only the local player answers (nomination 1084, president's and chancellor's legislative prompts 1127 and 1145, veto 1167, the four power prompts), and the `POST_LEGISLATIVE` status line for END TERM (1306), after the results;
  - `result`: the `POST_LEGISLATIVE` results switch (1239), and `showExecutionResults` in the `LIBERAL_VICTORY_EXECUTION` case (1317);
  - `end`: the victory `addAnimationToQueue` (1373), with `showVotes(newState, sounds)` for `FASCIST_VICTORY_ELECTION` (1320).

  Each prompt placement goes inside the existing `if (isPresident)` or `if (isChancellor)`.

- [ ] **Step 5: Helpers.** `playSounds(names: SoundName[]): void`; `queueSounds(names: SoundName[], cue: Cue): void` (D8); `showVotes(newState: GameState, names: SoundName[] = [])` plays the `votes` names inside its 2000 ms timeout and keeps that timeout in `soundTimers`; `clearAnimationQueue` clears `soundTimers`. No other line of `showVotes` or of the queue changes.

- [ ] **Step 6: Run the browser tests.** `cd frontend && JAVA_HOME=<Java 17> npm run e2e`. Expected: every project passes, including the two new tests.

- [ ] **Step 7: Whole frontend check.** `cd frontend && npm test -- --run && npm run build`. Expected: all pass.

- [ ] **Step 8: Commit.** Ticks the two Task 6.4 boxes and the new "the first packet after a socket opens plays nothing" box.

```bash
git add frontend/src/App.tsx frontend/e2e/sounds.spec.ts docs/PLAN.md
git commit -m "feat(frontend): play sounds with their animations"
```

### Task 5 (PLAN 6.5): Controls, docs and acceptance

**Files:**
- Create: `frontend/src/sound/SoundControl.tsx`, `SoundControl.css`, `SoundControl.test.tsx`
- Modify: `frontend/src/App.tsx` (632, 823), `frontend/src/game/GameScreen.tsx` (40), `frontend/src/App.css` (`header`), `frontend/e2e/sounds.spec.ts`, `frontend/playwright.config.ts`, `frontend/package.json` and `package-lock.json` (`lucide-react`), `CLAUDE.md`, `docs/PLAN.md`

**Interfaces:**
- Consumes: `sounds`, `SoundManager` (Task 2); `recordSounds`, `soundLog` (Task 4); `DESKTOP_SIZES`, `NARROW_WINDOWS`, `overflowX`, `smallTargets` (`e2e/layout.ts`).
- Produces: `export default function SoundControl(props: { manager?: SoundManager }): JSX.Element`, whose `manager` defaults to `sounds`, so tests pass their own.

- [ ] **Step 1: "Before" screenshots.** Already taken during planning, in the scratchpad: `shots/before-{login,lobby,game}-{360x740,412x915,1920x1080,1280x720,960x1080}.png`, each the top of the page down to 120px below the header, from the scripted socket with ten players. Header sizes at every size are in `shots/before-headers-*.json`.

- [ ] **Step 2: Unit tests** in `SoundControl.test.tsx`, with a `SoundManager` built on fakes (as in Task 2):
  - `shows the speaker unpressed at 70%`: the button "Mute sounds" has `aria-pressed="false"`, and the slider "Volume" has the value 70 and `aria-valuetext` "70%".
  - `the button toggles mute`: a click gives `aria-pressed="true"`, `manager.getSettings().muted` true and the `.lucide-volume-x` icon; a second click undoes it.
  - `the slider sets the volume and unmutes`: muted, then changing the slider to 40 gives `{ volume: 0.4, muted: false }` and the `.lucide-volume-1` icon; 70 shows `.lucide-volume-2`.
  - `follows changes made elsewhere`: `manager.setMuted(true)` outside the component updates `aria-pressed`.
  - `a tap opens the slider and a tap outside closes it`: `pointerup` with `pointerType: "touch"` on the button adds `open`, and `pointerdown` on `document.body` removes it.

- [ ] **Step 3: Browser tests**, appended to `sounds.spec.ts`:
  - `the control fits every header` (every project; desktop and Firefox loop over `DESKTOP_SIZES` and `NARROW_WINDOWS`, phones use their own size). On the login page, the scripted lobby and the scripted ten-player game, check:
    - the control's box lies inside the header horizontally, and the glyph lies inside it vertically;
    - it does not overlap the title text (a `Range` around the header's text node);
    - the header's height equals its height with `.sound-control { display: none }` added;
    - on phones, `smallTargets(page, "header")` is `[]`;
    - with the slider shown (hover on desktop, a tap on phones), `overflowX(page).offscreen` is `[]`, and on phones `smallTargets(page, ".sound-control")` is `[]`.
  - `mute and volume survive a reload` (desktop): click the button, focus the slider, press `ArrowLeft` twice (60), reload, and expect `aria-pressed="true"` and value 60. Then, after a click, a sound records `reason: "muted"`.
  - `hover and keyboard show the slider on desktop` (desktop): the slider is at opacity 0, then 1 on hover, then 0 after moving away. Tab to the button, then Tab: the slider is focused and showing, and `ArrowRight` raises the value by 5. Space on the button toggles `aria-pressed`.
  - `a tap shows the slider on phones` (phone projects): a tap toggles mute and shows the slider, and a tap on the page body hides it.
  - `the control stays usable over a prompt` (desktop): with the role reveal open, clicking the button toggles mute.

  In `playwright.config.ts`, `firefox`'s `testMatch` becomes `/(no-scroll|sounds)\.spec/`. The tests that need audio, or that already run in Chromium, skip in Firefox.

- [ ] **Step 4: Run them to verify they fail.** `cd frontend && npm test -- --run src/sound && JAVA_HOME=<Java 17> npm run e2e -- e2e/sounds.spec.ts`. Expected: the unit tests FAIL because `./SoundControl` cannot be resolved, and the new browser tests FAIL because `.sound-control` is not found.

- [ ] **Step 5: Implement D10.** First `cd frontend && npx npm@11.21.1 install lucide-react@1.63.0 --save-exact`, and check that `Volume1`, `Volume2` and `VolumeX` are exported. Then `SoundControl.tsx` and `.css`; `<SoundControl />` inside the three headers, after the title text; `header { position: relative }` in `App.css`. Values other than the 44px target, `z-index: 80` and the 5% step may be tuned while the tests are red.

- [ ] **Step 6: Run everything.** `cd frontend && npm test -- --run && npm run build && JAVA_HOME=<Java 17> npm run e2e`. Expected: every project passes; the existing no-scroll, phone and prompt tests are unchanged and green with the control in place.

- [ ] **Step 7: "After" screenshots and diffs.** Retake `shots/after-*` with the Step 1 script (`SHOTS=after`) and look at each one. Mask the control's box (from `after-headers-*.json`) in both images and diff them with `compare -metric AE`. Expected: 0 pixels changed outside the control at all 15 shots.

- [ ] **Step 8: `CLAUDE.md`.** In Layout, add `src/sound/`: `SoundManager` (Web Audio, unlocks on the first trusted gesture, settings in `localStorage` under `sounds`, every `play()` dispatches a `sound-play` event that tests record), `soundEvents` (pure, with `SOUND_CUES` naming the animation each sound waits for) and `SoundControl` (in all three headers, above the prompt overlay, with Lucide icons from `lucide-react`). Add clips in `src/assets/sounds/` as Ogg Opus and MP3, one row each in `docs/SOUND-CREDITS.md`. Name `sounds.spec.ts` among the browser tests, and note that Firefox runs it too. The Constraints line on CC0 clips stays as it is.

- [ ] **Step 9: Full suite.** `cd frontend && npm test -- --run && npm run build && JAVA_HOME=<Java 17> npm run e2e`, and `cd backend && JAVA_HOME=<Java 17> ./gradlew test`. Expected: all green.

- [ ] **Step 10: Drive a 7-player game at 1920x1080** (D12), in the scratchpad. Show the user the record by event, with any mismatch the checker found, and the console findings from all seven pages. The persistence test from Step 3 covers mute and volume surviving a reload; repeat it by hand once in the dev server.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/sound frontend/src/App.tsx frontend/src/App.css frontend/src/game/GameScreen.tsx frontend/e2e/sounds.spec.ts frontend/playwright.config.ts frontend/package.json frontend/package-lock.json docs/PLAN.md
git commit -m "feat(frontend): add a mute button and volume slider to every header"
git add CLAUDE.md
git commit -m "docs(claude): describe the sound modules and their browser test"
```

This ticks the three Task 6.5 boxes and the acceptance boxes the drive and the suite prove. "Heard in a real game" is the user's to tick. Then the final review, the fix pass, push, and `gh pr create --repo jussaw/Secret-Hitler-Online --base development`. Ask before merging.
