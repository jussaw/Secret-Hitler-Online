# Phase 2: Frontend Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The same app, with the same behaviour, built with Vite instead of Create React App, on React 18, TypeScript 5 and Vitest.

**Architecture:** Swap the toolchain under an unchanged component tree. `react-scripts` is replaced by Vite with `@vitejs/plugin-react`; the entry moves to `src/main.tsx` and `index.html` moves to the `frontend/` root. Two libraries that block React 18 (`react-textfit`, `react-helmet`) are replaced with plain CSS and static tags first. Then React is upgraded, and the two places that relied on React 16's synchronous `setState` outside event handlers are made explicit. Vitest replaces Jest last, with a real test in place of the CRA boilerplate.

**Tech Stack:** Vite 8.3.5, @vitejs/plugin-react 6.1.2, React 18.3.1, TypeScript 5.9.3, Vitest 5.0.5, jsdom 30.1.3, Testing Library (react 16.3.3, dom 10.4.2, jest-dom 7.0.1), Node 24.

Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 2. Spec: [`docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`](../specs/2026-11-11-self-hosted-fork-design.md).

## Global Constraints

- No behaviour changes. Done when the app plays a full game identically.
- No new art.
- The WebSocket protocol stays backward compatible for players (this phase does not touch it).
- Commits follow Conventional Commits with a scope: `type(scope): summary`.
- Tick a box in `docs/PLAN.md` in the same commit as the work it describes.
- Exact versions are pinned (all published at least two weeks before 2026-11-11):

| Package | Version | Package | Version |
|---|---|---|---|
| `vite` | 8.3.5 | `react`, `react-dom` | 18.3.1 |
| `@vitejs/plugin-react` | 6.1.2 | `@types/react` | 18.3.31 |
| `typescript` | 5.9.3 | `@types/react-dom` | 18.3.7 |
| `vitest` | 5.0.5 | `@testing-library/react` | 16.3.3 |
| `jsdom` | 30.1.3 | `@testing-library/dom` | 10.4.2 |
| `@types/node` | 24.19.2 | `@testing-library/jest-dom` | 7.0.1 |

- Node 22.12 or newer is required (Vitest 5, jsdom 30 and jest-dom 7 all declare it). Local development uses Node 24.18.

## Findings from the re-read

These change the order of work from the first draft of `docs/PLAN.md`; the parent plan has been updated to match.

1. **TypeScript 5 moves into Task 2.2.** `react-scripts` peer-pins `typescript` to `^3.2.1 || ^4`, and Vite's type declarations need TypeScript 5 (`moduleResolution: "bundler"`). TS 3.9 cannot even parse the current `node_modules` typings. So TS 5 is installed in the same step that removes `react-scripts`.
2. **`react-textfit` must go before React 18.** It peer-pins `react` to `^15 || ^16`, so npm refuses the React 18 install while it is present. The same applies to `@testing-library/react@12` (`react <18`), which goes with Jest in Task 2.2.
3. **React 18 automatic batching changes two code paths in `App.tsx`.** React 16 applies `setState` synchronously inside WebSocket, promise and timer callbacks; React 18 batches it. The animation queue is safe because its ordering lives in instance fields (`this.animationQueue`, `this.allAnimationsFinished`), not in state. Two places read `this.state` straight after a `setState` in such a callback:
   - `onWebSocketMessage`, lobby packet (`App.tsx:410-418`): `updateChangeIconAlert()` rebuilds the icon dialog from `this.state.icons`. Under React 18 it would see the previous packet's icons, so a picked portrait would not highlight until the next packet.
   - `onClickJoin` and `onClickCreateLobby` (`App.tsx:576` and `:606`): `Cookies.set(COOKIE_NAME, this.state.name)` runs right after `tryOpenWebSocket` sets `name`. Under React 18 it would store the old name.
4. **A dry run in a scratch copy validated this plan's configs**: `tsc --noEmit && vite build` passed with no warnings, `vitest --run` passed 2/2, and the acceptance grep returned nothing. TypeScript 5 with `@types/react` 18 reported exactly two kinds of error: `process.env` (removed by the env rename) and `NodeJS.Timeout` field types in six files.
5. **`CustomAliceCarousel.css` is still imported** by `LoginPageContent.js`, but every rule targets `.alice-carousel`, which is commented out. The import and the file go with the package. `@testing-library/user-event` is also unused. `prop-types` is used by nine files and stays.
6. **The dev compose image must be `node:24`**, not `node:20`: `npm install` of Vitest 5 and jsdom 30 needs Node 22 or newer. (Phase 3's Dockerfile stage has the same constraint; fix it when Phase 3 starts.)

## File map

| File | Change | Task |
|---|---|---|
| `frontend/package.json`, `package-lock.json` | dependencies, scripts, `"type": "module"`, drop CRA fields | all |
| `frontend/src/LoginPageContent.js` → `.jsx` | drop dead carousel CSS import | 1, 2 |
| `frontend/src/util/CustomAliceCarousel.css` | delete | 1 |
| `frontend/vite.config.ts` | new; gains a `test` block in Task 4 | 2, 4 |
| `frontend/index.html` | moved from `public/index.html`; module script; Helmet's tags in Task 3 | 2, 3 |
| `frontend/src/main.tsx` | new entry, replaces `src/index.js`; `createRoot` in Task 3 | 2, 3 |
| `frontend/src/serviceWorker.js`, `src/index.d.ts` | delete | 2 |
| `frontend/src/vite-env.d.ts` | new: Vite client types and `VITE_*` env typing | 2 |
| `frontend/tsconfig.json` | TS 5 / Vite settings | 2 |
| `frontend/.env.local`, `frontend/.env.dev` | `REACT_APP_*` → `VITE_*` | 2 |
| `frontend/src/constants/index.ts` | `process.env.REACT_APP_*` → `import.meta.env.VITE_*` | 2 |
| 18 component `.js` files | rename to `.jsx` | 2 |
| `App.tsx`, `IconSelection.tsx`, `PeekPrompt.tsx`, `SelectPlayerPrompt.tsx`, `VotingPrompt.tsx`, `PlayerDisplay.tsx` | `NodeJS.Timeout` → `ReturnType<typeof setTimeout>` | 2 |
| `frontend/.gitignore` | add `/dist` | 2 |
| `frontend/src/player/Player.jsx`, `Player.css` | Textfit → plain `div` with `clamp()` font size | 3 |
| `frontend/src/util/HelmetMetaData.jsx` | delete | 3 |
| `frontend/src/App.tsx` | drop Helmet; batching fixes | 3 |
| `frontend/src/setupTests.ts`, `src/App.test.tsx` | replace the `.js` versions | 4 |
| `docker-compose.yml` | frontend service on `node:24` and `npm run dev -- --host` | 5 |
| `DEVELOPMENT.md`, `README.md`, `frontend/README.md`, `CLAUDE.md` | new script names and commands | 5 |

## Before starting

- [ ] Stop the CRA dev server if it is running (it holds port 3000; Vite is configured with `strictPort`). Keep `./gradlew runLocal` running on port 4040 for the manual checks.
- [ ] `cd frontend && npm install` on a clean checkout of `phase-2-vite`.

---

### Task 1 (PLAN 2.1): Dependency audit

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/LoginPageContent.js:3`
- Delete: `frontend/src/util/CustomAliceCarousel.css`

**Interfaces:** none; no code that later tasks use changes.

- [ ] **Step 1: Confirm the packages have no imports**

Run from `frontend/`:

```bash
grep -rnE "from ['\"](react-router|react-router-dom|react-router-config|react-alice-carousel|query-string|@testing-library/user-event)['\"]" src
grep -rn "alice-carousel" src --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx'
```

Expected: the first prints nothing. The second prints only the commented-out `<AliceCarousel ... />` block in `src/LoginPageContent.js`.

- [ ] **Step 2: Remove the dead carousel stylesheet**

In `frontend/src/LoginPageContent.js` delete line 3:

```js
import "./util/CustomAliceCarousel.css";
```

Then `git rm frontend/src/util/CustomAliceCarousel.css`.

- [ ] **Step 3: Uninstall**

```bash
npm uninstall react-router react-router-dom react-router-config react-alice-carousel query-string @testing-library/user-event
```

Expected: `removed N packages`, no `ERESOLVE`. `prop-types` stays (imported by nine files).

- [ ] **Step 4: CRA build still succeeds**

Run: `npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 5: Commit**

Tick both Task 2.1 boxes in `docs/PLAN.md`, then:

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/LoginPageContent.js docs/PLAN.md
git commit -m "build(frontend): remove unused dependencies"
```

---

### Task 2 (PLAN 2.2): CRA to Vite, with TypeScript 5

**Files:**
- Create: `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/vite-env.d.ts`
- Modify: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/.env.local`, `frontend/.env.dev`, `frontend/src/constants/index.ts:11-17`, `frontend/.gitignore`, the six `NodeJS.Timeout` sites
- Rename: 18 `.js` files containing JSX → `.jsx`
- Delete: `frontend/public/index.html`, `frontend/src/index.js`, `frontend/src/serviceWorker.js`, `frontend/src/index.d.ts`

**Interfaces:**
- Produces: `npm run dev` (Vite on port 3000, mode `local`), `npm run dev:server` (mode `dev`), `npm run build` (`tsc --noEmit && vite build` into `frontend/dist`), `npm run preview`. `import.meta.env.VITE_DEBUG`, `VITE_SERVER_ADDRESS`, `VITE_SERVER_ADDRESS_HTTP`, `VITE_WEBSOCKET_HEADER` (all `string | undefined`).

- [ ] **Step 1: Swap the toolchain packages**

From `frontend/`:

```bash
npm uninstall react-scripts env-cmd @babel/plugin-proposal-private-property-in-object @testing-library/react @testing-library/jest-dom typescript
npm install -D vite@8.3.5 @vitejs/plugin-react@6.1.2 typescript@5.9.3
```

Expected: no `ERESOLVE`. The Jest-era Testing Library packages leave with Jest; Task 4 installs the React 18 versions. `typescript` moves from `dependencies` to `devDependencies`.

- [ ] **Step 2: Rewrite the `package.json` fields**

Remove `"homepage"`, `"eslintConfig"` and `"browserslist"`. Add `"type": "module"` after `"private"`. Replace `"scripts"` with:

```json
"scripts": {
	"dev": "vite --mode local",
	"dev:server": "vite --mode dev",
	"build": "tsc --noEmit && vite build",
	"preview": "vite preview"
},
```

(`test` is added in Task 4, once Vitest is installed.)

- [ ] **Step 3: Create `frontend/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
});
```

- [ ] **Step 4: Move `index.html` to the Vite entry**

`git mv frontend/public/index.html frontend/index.html`, then replace its contents with:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#e05b2b" />
    <meta name="title" content="Secret Hitler Online"/>
    <meta name="description" content="A free online hidden identity game for up to 10 players, based on the original Secret Hitler board game."/>
    <meta property="og:description" content="A free online hidden identity game for up to 10 players, based on the original Secret Hitler board game."/>
    <meta property="og:image" content="live.staticflickr.com/65535/49904192417_3bf847b3f9_w.jpg"/>
    <meta property="og:url" content="https://secret-hitler.online"/>
    <meta property="og:image:alt" content="Secret Hitler Online"/>
    <meta property="og:title" content="Secret Hitler Online"/>
    <link rel="apple-touch-icon" href="/logo192.png" />
    <link rel="manifest" href="/manifest.json" />
    <title>Secret Hitler Online: A free online board game for up to 10 players.</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

This keeps the existing tags unchanged apart from root-absolute asset paths (Vite serves `public/` at `/`) and the dropped CRA template comments. Task 3 replaces the meta tags with Helmet's.

- [ ] **Step 5: New entry `frontend/src/main.tsx`; delete the CRA entry and service worker**

```tsx
import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
```

`git rm frontend/src/index.js frontend/src/serviceWorker.js`. The only registration call was `serviceWorker.unregister()` in `index.js`, so nothing else references the worker.

- [ ] **Step 6: Vite type declarations**

Create `frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG?: string;
  readonly VITE_SERVER_ADDRESS?: string;
  readonly VITE_SERVER_ADDRESS_HTTP?: string;
  readonly VITE_WEBSOCKET_HEADER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

`git rm frontend/src/index.d.ts`. After Phase 1 it only declares `*.png` and `*.svg`, which `vite/client` already types as default-exported URL strings, matching the existing `import x from "./x.svg"` usage.

- [ ] **Step 7: Rename the environment variables**

`frontend/.env.local`:

```
VITE_DEBUG=DEBUG
VITE_SERVER_ADDRESS=localhost:4040
VITE_SERVER_ADDRESS_HTTP=http://localhost:4040
VITE_WEBSOCKET_HEADER=ws://
```

`frontend/.env.dev`:

```
VITE_DEBUG=DEBUG
VITE_SERVER_ADDRESS=secret-hitler-online-dev.fly.dev
VITE_SERVER_ADDRESS_HTTP=https://secret-hitler-online-dev.fly.dev
VITE_WEBSOCKET_HEADER=wss://
```

In `frontend/src/constants/index.ts`, lines 11-17 become:

```ts
export const DEBUG = import.meta.env.VITE_DEBUG !== undefined;
export const SERVER_ADDRESS =
  import.meta.env.VITE_SERVER_ADDRESS || "secret-hitler-online.fly.dev";
export const SERVER_ADDRESS_HTTP =
  import.meta.env.VITE_SERVER_ADDRESS_HTTP || "https://" + SERVER_ADDRESS;
export const WEBSOCKET_HEADER =
  import.meta.env.VITE_WEBSOCKET_HEADER || "wss://";
```

Mode loading matches CRA's: `--mode local` reads `.env.local`, and `--mode dev` reads `.env.dev`, which takes priority over `.env.local`. `vite build` (mode `production`) reads `.env.local`, as `react-scripts build` did.

- [ ] **Step 8: Replace `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitAny": true,
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 9: Rename `.js` files that contain JSX**

Vite only parses JSX in `.jsx`/`.tsx`. From `frontend/`:

```bash
for f in src/App.test.js src/board/Board.js src/board/Deck.js src/custom-alert/ButtonPrompt.js \
  src/custom-alert/CustomAlert.js src/custom-alert/ElectionTrackerAlert.js src/custom-alert/InvestigationAlert.js \
  src/custom-alert/PlayerDisplayPrompt.js src/custom-alert/PolicyEnactedAlert.js src/event-bar/EventBar.js \
  src/LoginPageContent.js src/player/Player.js src/status-bar/StatusBar.js src/util/AnnouncementBox.js \
  src/util/HelmetMetaData.js src/util/MaxLengthTextField.js src/util/PlayerPolicyStatus.js src/util/PolicyDisplay.js; do
  git mv "$f" "${f%.js}.jsx"
done
grep -rlE '<[A-Za-z/>]' src --include='*.js'
```

Expected: the final grep prints nothing (only `src/setupTests.js` is left as `.js`, and it has no JSX). No import names a `.js` extension, so no import lines change.

- [ ] **Step 10: Fix the TypeScript 5 errors**

Run: `npx tsc --noEmit`
Expected before the fix: six `TS2503 Cannot find namespace 'NodeJS'` errors (the `process` errors are gone after Step 7). In a browser, `setTimeout` and `setInterval` return numbers, so type the fields from the functions themselves:

- `src/App.tsx:199`: `pingInterval?: NodeJS.Timeout = undefined;` → `pingInterval?: ReturnType<typeof setInterval> = undefined;`
- `src/custom-alert/IconSelection.tsx:19`, `src/custom-alert/PeekPrompt.tsx:18`, `src/custom-alert/SelectPlayerPrompt.tsx:45`, `src/custom-alert/VotingPrompt.tsx:29`, `src/player/PlayerDisplay.tsx:140`: replace `NodeJS.Timeout` with `ReturnType<typeof setTimeout>`.

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 11: Ignore the new build output; clear the old one**

Add `/dist` under `# production` in `frontend/.gitignore` (next to `/build`), then `rm -rf frontend/build`.

- [ ] **Step 12: Build**

Run: `npm run build`
Expected: `tsc` silent, then `✓ built in …`, with `dist/index.html` and `dist/assets/*`; no warnings.

- [ ] **Step 13: Dev server against the local backend**

Run `npm run dev` in the background, then:

```bash
curl -s localhost:3000 | grep -c 'src="/src/main.tsx"'
```

Expected: `1`. Then open `http://localhost:3000` in a browser: the login page loads, and CREATE LOBBY with any name reaches the lobby and opens the PLAYER LOOK dialog. The console shows no errors except the known baseline warnings (#2 to #5).

- [ ] **Step 14: Commit**

Tick the Task 2.2 boxes in `docs/PLAN.md`, then:

```bash
git add -A frontend docs/PLAN.md
git commit -m "build(frontend): migrate from create react app to vite"
```

---

### Task 3 (PLAN 2.3): React 18

**Files:**
- Modify: `frontend/src/player/Player.jsx:6,197-205`, `frontend/src/player/Player.css:48-59`, `frontend/index.html`, `frontend/src/App.tsx` (Helmet import and `render`, lines 410-418, 538-587, 592-622), `frontend/src/main.tsx`
- Delete: `frontend/src/util/HelmetMetaData.jsx`

**Interfaces:**
- Consumes: `npm run build` and `npm run dev` from Task 2.
- Produces: React 18 root via `createRoot` from `react-dom/client`; `@types/react` 18 (needed by `@testing-library/react@16` in Task 4).

- [ ] **Step 1: Replace Textfit with CSS sizing**

In `frontend/src/player/Player.jsx`, delete `import {Textfit} from 'react-textfit';` and replace the `<Textfit …>{this.props.name}</Textfit>` block with:

```jsx
                <div id={"player-name"}
                     className={this.getClassName() + " force-update"}
                >
                    {this.props.name}
                </div>
```

In `frontend/src/player/Player.css`, the `#player-name` rule becomes:

```css
#player-name {
    position:absolute;
    color: var(--backgroundDark);
    font-family: var(--textFont);
    top: 64%;
    left: 10%;
    width: 80%;
    height: 16%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 1.1;
    overflow-wrap: anywhere;
    /* The tile is as wide as #player-image: min(20vmin, 16vh). */
    font-size: clamp(8px, calc(min(20vmin, 16vh) * 0.1), 20px);
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none
}
```

Then `npm uninstall react-textfit`.

- [ ] **Step 2: Check that names fit**

With `npm run dev` and the backend running, create a lobby as `WWWWWWWWWWWW` (12 characters, the name limit), and join it from a second browser as `Al`. At 1920x1080 and 1280x720, evaluate in the console:

```js
[...document.querySelectorAll("#player-name")].map(e => [e.textContent, e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight])
```

Expected: `true` for both names at both sizes. If the 12-character name overflows, lower the `0.1` factor until it fits, and record the value here.

- [ ] **Step 3: Commit**

Tick the `react-textfit` box, then:

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/player/Player.jsx frontend/src/player/Player.css docs/PLAN.md
git commit -m "refactor(frontend): size player names with css instead of react-textfit"
```

- [ ] **Step 4: Replace Helmet with static tags**

Replace the `<head>` of `frontend/index.html` with the tags `HelmetMetaData` used to inject at runtime (Helmet's values won over the static ones). Leave out the empty `csrf_token`/`_token` placeholders, the share-only `quote`/`hashtag` properties, and the `url`/`og:url` tags, which pointed at upstream's hosted site:

```html
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <meta name="theme-color" content="#e05b2b" />
    <meta name="msapplication-TileColor" content="#e05b2b" />
    <meta name="msapplication-TileImage" content="/favicon.ico" />
    <title>Secret Hitler Online</title>
    <meta name="title" content="Secret Hitler Online" />
    <meta name="description" content="Secret Hitler Online is a free hidden-identity game for up to 10 players, elegantly adapted from the original Secret Hitler. Play for free in your browser with no ads ever. Can you find and stop the Secret Hitler?" />
    <meta name="keywords" content="Secret Hitler, party game, play, free, online, tabletop simulator, board game" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Secret Hitler Online" />
    <meta property="og:title" content="Secret Hitler Online" />
    <meta property="og:description" content="Secret Hitler Online is a free hidden-identity game for up to 10 players, elegantly adapted from the original Secret Hitler. Play for free in your browser with no ads ever. Can you find and stop the Secret Hitler?" />
    <meta property="og:image" content="https://live.staticflickr.com/65535/49904192417_3bf847b3f9_w.jpg" />
    <meta property="og:image:type" content="image/*" />
    <meta property="og:image:alt" content="Secret Hitler Online" />
    <link rel="apple-touch-icon" href="/logo192.png" />
    <link rel="manifest" href="/manifest.json" />
  </head>
```

In `frontend/src/App.tsx` delete `import HelmetMetaData from "./util/HelmetMetaData";` and the `<HelmetMetaData />` line in `render()` (line 1735). `git rm frontend/src/util/HelmetMetaData.jsx`, then `npm uninstall react-helmet`.

Run: `npm run build`
Expected: passes. `grep -c '<title>Secret Hitler Online</title>' dist/index.html` prints `1`.

- [ ] **Step 5: Commit**

Tick the `react-helmet` box, then:

```bash
git add -A frontend docs/PLAN.md
git commit -m "refactor(frontend): replace react-helmet with static meta tags"
```

- [ ] **Step 6: Upgrade React and switch to `createRoot`**

```bash
npm install react@18.3.1 react-dom@18.3.1
npm install -D @types/react@18.3.31 @types/react-dom@18.3.7
```

Expected: no `ERESOLVE` (`react-textfit` and the old Testing Library are gone). `frontend/src/main.tsx` becomes:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Run: `npm run build`
Expected: passes with no type errors (the dry run showed none from `@types/react` 18).

- [ ] **Step 7: Make the two read-after-`setState` paths explicit**

In `onWebSocketMessage` (`App.tsx:409-419`), run the icon dialog update after the lobby state is applied:

```tsx
      case PACKET_LOBBY:
        this.setState(
          {
            usernames: message[PARAM_USERNAMES],
            icons: message[PARAM_ICON],
            page: PAGE.LOBBY,
          },
          () => {
            if (message[PARAM_ICON][this.state.name] === defaultPortrait) {
              this.showChangeIconAlert();
            }
            this.updateChangeIconAlert();
          }
        );
        break;
```

In `onClickJoin`, capture the submitted values before any state changes, and use them for the socket and the cookies:

```tsx
  onClickJoin = () => {
    const name = this.state.joinName;
    const lobby = this.state.joinLobby;
    this.setState({ joinError: "Connecting..." });
    this.tryLogin(name, lobby)
```

In the same method, `this.state.joinName` in the 403 message becomes `name`, `this.tryOpenWebSocket(this.state.joinName, this.state.joinLobby)` becomes `this.tryOpenWebSocket(name, lobby)`, and the two cookie lines become:

```tsx
            Cookies.set(COOKIE_NAME, name, { expires: 7 });
            Cookies.set(COOKIE_LOBBY, lobby);
```

In `onClickCreateLobby`, capture `const name = this.state.createLobbyName;` as the first line. Use `this.tryOpenWebSocket(name, lobbyCode)`, and `Cookies.set(COOKIE_NAME, name, { expires: 7 });`.

Note: under React 16, the join path stored an empty lobby cookie, because `tryOpenWebSocket` had already cleared `joinLobby`. Storing the joined lobby is what the code intends, and it is what the create path already does.

- [ ] **Step 8: Verify ordering and the icon dialog**

Run: `npm run build` (passes). Then, with `npm run dev`:

1. Create a lobby. In the PLAYER LOOK dialog, click a portrait: it is highlighted at once (`#icon.selected` appears on the clicked portrait). Then click a second portrait: the highlight moves.
2. Leave the lobby and join it again by code. `document.cookie` contains the name and the lobby code.
3. Play one 5-player CPU game to the end. Alerts appear one at a time in game order (role, nomination, voting, legislative, policy enacted, …). The console has no errors from #2 or #3. React 18 no longer prints the #5 warning, so only #4 (missing `key`) should remain.

- [ ] **Step 9: Commit**

Tick the React 18 and automatic-batching boxes, then:

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/main.tsx frontend/src/App.tsx docs/PLAN.md
git commit -m "feat(frontend): upgrade to react 18"
```

---

### Task 4 (PLAN 2.4): Vitest

**Files:**
- Modify: `frontend/vite.config.ts`, `frontend/package.json`
- Create: `frontend/src/setupTests.ts`, `frontend/src/App.test.tsx`
- Delete: `frontend/src/setupTests.js`, `frontend/src/App.test.jsx`

**Interfaces:**
- Consumes: React 18 from Task 3.
- Produces: `npm test` (Vitest, watch mode) and `npm test -- --run` (single run).

- [ ] **Step 1: Install**

```bash
npm install -D vitest@5.0.5 jsdom@30.1.3 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/jest-dom@7.0.1 @types/node@24.19.2
```

Expected: no `ERESOLVE`. `@types/node` moves to 24, because Vitest 5's optional peer range is `^22 || >=24`.

- [ ] **Step 2: Test config**

`frontend/vite.config.ts` becomes:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
  },
});
```

Add `"test": "vitest"` to `"scripts"` in `frontend/package.json`.

- [ ] **Step 3: Port the setup file**

`git rm frontend/src/setupTests.js` and create `frontend/src/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest does not expose globals here, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Port the test, with real assertions (#6)**

`git rm frontend/src/App.test.jsx` and create `frontend/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  // App pings the server from its constructor; keep that off the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(null, { status: 200 })))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders the login page with join and create forms", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "JOIN A GAME" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeInTheDocument();
});

test("pings the server once when it starts", () => {
  render(<App />);
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/ping$/));
});
```

The CRA test looked for "learn react", which this app never rendered. These two assertions check what the login page actually shows, and the constructor's wake-up ping.

- [ ] **Step 5: Check the test can fail, then run it**

Temporarily change `"CREATE LOBBY"` to `"CREATE LOBBIES"` and run `npm test -- --run`.
Expected: FAIL, `Unable to find an accessible element with the role "button" and name "CREATE LOBBIES"`. Revert the change.

Run: `npm test -- --run`
Expected: `Test Files  1 passed (1)`, `Tests  2 passed (2)`, with no unhandled errors.

- [ ] **Step 6: Commit**

Tick both Task 2.4 boxes, then:

```bash
git add -A frontend docs/PLAN.md
git commit -m "test(frontend): run tests with vitest"
```

---

### Task 5 (PLAN 2.5): Dev Docker and docs

**Files:**
- Modify: `docker-compose.yml` (frontend service), `DEVELOPMENT.md`, `README.md`, `frontend/README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the script names from Tasks 2 and 4.

- [ ] **Step 1: Compose frontend service**

The `frontend` service in `docker-compose.yml` becomes:

```yaml
  frontend:
    image: node:24
    container_name: sh-frontend
    working_dir: /app/frontend
    volumes:
      - ./frontend:/app/frontend
    command: bash -lc "npm install && npm run dev -- --host"
    depends_on:
      - backend
    ports:
      - "3000:3000"
```

`HOST` and `CHOKIDAR_USEPOLLING` were CRA settings; `--host` replaces the first, and Vite's watcher works on Linux bind mounts without polling.

- [ ] **Step 2: Verify the compose stack in a throwaway worktree**

The container runs `npm install` as root into the bind-mounted `frontend/`, so run it from a scratch worktree rather than the working checkout. Stop the local backend and dev server first (ports 4040 and 3000).

```bash
SCRATCH=$(mktemp -d)   # or the session scratchpad
git worktree add --detach "$SCRATCH/compose-check" HEAD
cd "$SCRATCH/compose-check" && docker compose config -q && docker compose up -d
until curl -sf localhost:3000 >/dev/null; do sleep 2; done
curl -s localhost:3000 | grep -c 'src="/src/main.tsx"'
curl -s localhost:4040/ping
docker compose down -v
```

Expected: `docker compose config -q` silent, `1` from the grep, and `/ping` answers. Afterwards, remove the worktree. Its `node_modules` is root-owned, so delete it with `docker run --rm -v "$SCRATCH/compose-check":/w node:24 rm -rf /w/frontend/node_modules` before `git worktree remove "$SCRATCH/compose-check"`.

- [ ] **Step 3: Commit the compose change**

Tick the compose box, then:

```bash
git add docker-compose.yml docs/PLAN.md
git commit -m "build(docker): run the vite dev server in the compose frontend"
```

- [ ] **Step 4: Script names in the docs**

- `DEVELOPMENT.md`: `npm run devLocal` → `npm run dev`; `npm run devServer` → `npm run dev:server`. Add `npm test` (watch) and `npm test -- --run`. State that Node 22.12 or newer is needed. Remove "The webpage should open automatically in your browser"; Vite does not open a browser.
- `README.md` (Running locally): `npm run devLocal` → `npm run dev`; change "tested with Node 24" to "Node 22.12 or newer (tested with 24)"; add `cd frontend && npm test -- --run` next to the backend tests line.
- `frontend/README.md`: replace the CRA boilerplate with:

```markdown
# Frontend

React 18 + TypeScript, built with Vite. From this directory:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 against the local backend (`.env.local`) |
| `npm run dev:server` | Dev server against the hosted dev backend (`.env.dev`) |
| `npm test` | Vitest in watch mode (`npm test -- --run` for a single run) |
| `npm run build` | Type-check, then build into `dist/` |
| `npm run preview` | Serve the `dist/` build on port 3000 |

See [../DEVELOPMENT.md](../DEVELOPMENT.md) for the full setup.
```

Run: `grep -rn "devLocal\|devServer\|react-scripts\|REACT_APP_" README.md DEVELOPMENT.md frontend/README.md CLAUDE.md docker-compose.yml`
Expected: only the `CLAUDE.md` lines that Step 6 rewrites.

- [ ] **Step 5: Commit the docs**

Tick the `DEVELOPMENT.md` box, then:

```bash
git add DEVELOPMENT.md README.md frontend/README.md docs/PLAN.md
git commit -m "docs(development): document the vite scripts"
```

- [ ] **Step 6: Update `CLAUDE.md`**

- Layout: `frontend/` is React 18 and TypeScript 5 on Vite, with Vitest. The entry is `src/main.tsx` and `index.html` is at the `frontend/` root. `VITE_*` variables live in `.env.local` / `.env.dev`, typed in `src/vite-env.d.ts`.
- Commands table: frontend dev server `cd frontend && npm install && npm run dev`, frontend tests `cd frontend && npm test -- --run`, frontend production build `npm run build` into `frontend/dist/`. Add that Node 22.12 or newer is needed.
- Known baseline failures: remove the `App.test.js` line (#6, fixed), and drop #2 and #3 (their libraries are gone). Keep #4. Rewrite #5 as: "prompts set state from uncleared timers after unmount; React 18 no longer warns, but the timers still fire".
- Replace the `npm run devServer` note with `npm run dev:server`.

Run every command in the table once; each must succeed.

- [ ] **Step 7: Commit**

Tick the `CLAUDE.md` box, then:

```bash
git add CLAUDE.md docs/PLAN.md
git commit -m "docs(claude): update frontend commands for vite and vitest"
```

---

### Task 6: Phase 2 acceptance

- [ ] **Step 1: Build and tests**

Run: `cd frontend && npm run build && npm test -- --run`
Expected: build passes; `Tests  2 passed (2)`.

- [ ] **Step 2: Leftover CRA references**

Run from the repo root: `grep -rn "REACT_APP_\|react-scripts" frontend --include='*' --exclude-dir=node_modules`
Expected: no output.

- [ ] **Step 3: Manual regression**

With `./gradlew runLocal` and `npm run dev` running, use two separate browser profiles (host H and guest G). Record each item's result in the PR:

1. H creates a lobby and picks a portrait. G joins with the lobby code and picks a different portrait; both see each other in the lobby.
2. H starts the game (3 CPU players fill the lobby to 5). Both players act on every prompt addressed to them.
3. Mid-game, G reloads the page. The login page shows G's name and the lobby code filled in. G presses JOIN and is back in the game in the right state.
4. Play to the end. Repeat games until there has been at least one liberal win and one fascist win. On each victory screen, RETURN TO LOBBY works for both.
5. Throughout, the console shows no errors other than #4.

- [ ] **Step 4: Tick, push, PR**

Tick the first three Phase 2 acceptance boxes in `docs/PLAN.md` and commit (`docs(plan): record phase 2 acceptance checks`). Push `phase-2-vite` and open a PR into `development` with `--repo jussaw/Secret-Hitler-Online`. In the PR body, list the regression results and `Closes #2, closes #3, closes #6`. "PR merged" is ticked in the first commit on `phase-3-deploy`.
