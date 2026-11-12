# Phase 3: Persistence, Packaging, First Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The unmodified-looking game runs on the home server at its public subdomain and survives restarts.

**Architecture:** The lobby backup keeps its single serialized-map row, but the row moves from Postgres to a SQLite file at `DATABASE_PATH`. The Javalin server serves the built frontend from its classpath (`/public`), and the frontend derives its API and WebSocket URLs from `window.location`, so one image on one port serves everything. In development, Vite proxies the backend paths. A three-stage Dockerfile builds the frontend and the jar on the build platform and runs the jar on a JRE for each target platform. CI publishes `ghcr.io/jussaw/secret-hitler-online` for arm64 and amd64 on every push to `development`. The home server runs it behind a TLS-terminating proxy and pulls new `:latest` images.

**Tech Stack:** Java 17, Javalin 5.6.1, `org.xerial:sqlite-jdbc` 3.53.4.0, JUnit 4.12 · Vite 8 dev proxy, Vitest · Docker (`node:24`, `eclipse-temurin:17-jdk`, `eclipse-temurin:17-jre`), GitHub Actions (`checkout@v7`, `setup-java@v6`, `gradle/actions/setup-gradle@v6`, `setup-node@v7`, `setup-qemu-action@v4`, `setup-buildx-action@v4`, `login-action@v4`, `metadata-action@v6`, `build-push-action@v7`), GHCR.

Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 3. Spec: [`docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`](../specs/2026-11-11-self-hosted-fork-design.md).

## Global Constraints

- The WebSocket protocol stays backward compatible for players; this phase changes where the client connects, not what it sends.
- SQLite unavailable or unwritable: log and continue without persistence, as the Postgres path does today. Keep the existing serialize-everything backup behaviour.
- Deploys go through the host's deploy tooling, never `docker compose up` from a checkout.
- Ask the user before: changing the host's stack, deploying, DNS or proxy changes, monitoring changes, making the GHCR package public, and merging any PR.
- Commits follow Conventional Commits with a scope; tick each `docs/PLAN.md` box in the same commit as its work.
- Versions are pinned to releases at least two weeks old (`sqlite-jdbc` 3.54.1.0 was exactly two weeks old, so 3.53.4.0 from 2026-08-26).

## Findings from the re-read

1. **Server address constants live in `frontend/src/constants/index.ts`**, not `App.tsx`. `App.tsx:858` hard-codes upstream's invite link (`https://secret-hitler.online/?lobby=`), which is wrong for any self-hosted copy, so it switches to the page's own origin.
2. **`.env.local` is loaded in every Vite mode, including `vite build`.** So the production bundle currently bakes in `localhost:4040` and debug logging. With same-origin URLs, the address variables go, and `VITE_DEBUG` moves to `.env.development` (dev server only).
3. **Javalin 5 fails at startup if the static directory is missing from the classpath.** `runLocal` without a built frontend would crash, so static files are registered only when `/public/index.html` is on the classpath.
4. **The image's Gradle stage uses the wrapper (7.4.2) on `eclipse-temurin:17-jdk`, not `gradle:8-jdk17`.** The build is only known-good on the wrapper, and `build.gradle` still uses the long-deprecated `mainClassName`. The Node stage is `node:24` (Phase 2 needs Node 22+). Both build stages run on `$BUILDPLATFORM`, because their output is platform-independent; only the JRE stage is per-platform, which keeps the arm64 build out of QEMU emulation.
5. **The container runs as uid 1000**, matching the owner of the host's data directory, so the bind-mounted `/data` is writable.
6. **TLS ends at a proxy in front of the host.** A public hostname on it terminates TLS and passes WebSockets. The host runs an uptime monitor and an image updater; the updater is how "the host picks up" new `:latest` images.
7. **Public GHCR packages allow anonymous pulls**, so the host needs no registry credentials as long as this package is public.
8. **The image job only runs on pushes to `development`, so the first image needs a merge.** Proposed sequence (confirm with the user at the gate before Task 6): PR 1 carries Tasks 1-5 and is merged, which publishes the first image. Tasks 6-7 and the acceptance checks follow on a fresh `phase-3-deploy` branch with PR 2.
10. **The production CORS rule blocks the same-origin page.** Outside debug mode, the CORS plugin allowed only upstream's `https://secret-hitler.online`, and Javalin answers any other `Origin` with 400. Vite's `<script type="module" crossorigin>` and stylesheet tags make the browser send `Origin` even for same-origin assets, so the served page stayed blank (curl without `Origin` got 200, which hid it). Same-origin serving needs no CORS, so the plugin is now enabled only in debug mode.
9. **The service gets a free published port on the host.**

## File map

| File | Change | Task |
|---|---|---|
| `backend/build.gradle` | `postgresql` → `sqlite-jdbc`; bundle `frontend/dist` into `public/` | 1, 2 |
| `backend/src/main/java/server/ApplicationConfig.java` | `DATABASE_URL` → `DATABASE_PATH` | 1 |
| `backend/src/main/java/server/SecretHitlerServer.java` | database section (lines 211-359) rewritten around testable helpers; static files | 1, 2 |
| `backend/src/test/java/server/DatabaseBackupTest.java` | new | 1 |
| `frontend/src/constants/serverUrls.ts`, `serverUrls.test.ts` | new: URL derivation | 2 |
| `frontend/src/constants/index.ts` | use `serverUrls` | 2 |
| `frontend/src/App.tsx:858` | invite link from `window.location.origin` | 2 |
| `frontend/vite.config.ts` | dev proxy, target from `BACKEND_URL` | 2 |
| `frontend/.env.local` → `frontend/.env.development` | only `VITE_DEBUG` | 2 |
| `Dockerfile`, `.dockerignore` (repo root) | new | 3 |
| `backend/Dockerfile`, `backend/config/Dockerfile.dev` | delete (unused since Phase 1 removed Fly) | 3 |
| `docker-compose.yml` | drop `db`; `DATABASE_PATH` on a named volume; `BACKEND_URL` for the frontend | 4 |
| `DEVELOPMENT.md`, `CLAUDE.md` | SQLite, same-origin, image and deploy path | 4 |
| `.github/workflows/ci.yml` | new | 5 |
| Host stack (outside this repo) | new service (gated) | 6 |

---

### Task 1 (PLAN 3.1): SQLite backup

**Files:**
- Modify: `backend/build.gradle`, `backend/src/main/java/server/ApplicationConfig.java`, `backend/src/main/java/server/SecretHitlerServer.java:211-359` (and its `java.net.URI` import)
- Test: `backend/src/test/java/server/DatabaseBackupTest.java`

**Interfaces:**
- Produces (package-private, in `server.SecretHitlerServer`):
  - `static Connection getDatabaseConnection(String path)`: opens `jdbc:sqlite:<path>` and creates the `backup` table. Returns `null` (after logging) when `path` is null/blank or cannot be opened.
  - `static void storeLobbies(Connection c, Map<String, Lobby> lobbies) throws SQLException, IOException`: upserts row `id = 0`.
  - `static ConcurrentHashMap<String, Lobby> loadLobbies(Connection c) throws SQLException, IOException, ClassNotFoundException`: returns `null` when there is no row, and increments `attempts`.
- `ApplicationConfig.DATABASE_PATH` (`String`, from env `DATABASE_PATH`; unset disables persistence).

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/server/DatabaseBackupTest.java`:

```java
package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import game.datastructures.Player;
import java.io.File;
import java.sql.Connection;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import server.util.Lobby;

public class DatabaseBackupTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private String dbPath() {
        return new File(tmp.getRoot(), "backup.db").getAbsolutePath();
    }

    private static List<String> playerNames(Lobby lobby) {
        return lobby.game().getPlayerList().stream().map(Player::getUsername).collect(Collectors.toList());
    }

    private void store(ConcurrentHashMap<String, Lobby> lobbies) throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            SecretHitlerServer.storeLobbies(c, lobbies);
        }
    }

    private ConcurrentHashMap<String, Lobby> load() throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            return SecretHitlerServer.loadLobbies(c);
        }
    }

    @Test
    public void lobbiesSurviveARoundTripThroughTheSqliteFile() throws Exception {
        ConcurrentHashMap<String, Lobby> lobbies = new ConcurrentHashMap<>();
        Lobby inGame = new Lobby();
        inGame.startNewGame(); // no humans: five CPU players take the seats
        lobbies.put("ABCD", inGame);
        lobbies.put("WXYZ", new Lobby());

        store(lobbies);
        ConcurrentHashMap<String, Lobby> loaded = load();

        assertEquals(lobbies.keySet(), loaded.keySet());
        assertTrue(loaded.get("ABCD").isInGame());
        assertEquals(playerNames(inGame), playerNames(loaded.get("ABCD")));
        assertFalse(loaded.get("WXYZ").isInGame());
    }

    @Test
    public void storingAgainReplacesThePreviousBackup() throws Exception {
        ConcurrentHashMap<String, Lobby> first = new ConcurrentHashMap<>();
        first.put("AAAA", new Lobby());
        ConcurrentHashMap<String, Lobby> second = new ConcurrentHashMap<>();
        second.put("BBBB", new Lobby());

        store(first);
        store(second);

        assertEquals(second.keySet(), load().keySet());
    }

    @Test
    public void anEmptyDatabaseLoadsNothing() throws Exception {
        assertNull(load());
    }

    @Test
    public void unsetOrUnwritablePathDisablesPersistence() {
        assertNull(SecretHitlerServer.getDatabaseConnection(null));
        assertNull(SecretHitlerServer.getDatabaseConnection(" "));
        assertNull(SecretHitlerServer.getDatabaseConnection(
                new File(tmp.getRoot(), "missing/dir/backup.db").getAbsolutePath()));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend && ./gradlew test --tests server.DatabaseBackupTest`
Expected: compilation fails, because `getDatabaseConnection(String)`, `storeLobbies` and `loadLobbies` do not exist.

- [ ] **Step 3: Swap the driver and the config**

In `backend/build.gradle`, replace

```groovy
    // PostgresSQL driver
    implementation 'org.postgresql:postgresql:42.7.1'
```

with

```groovy
    // SQLite driver for the lobby backup file (DATABASE_PATH)
    implementation 'org.xerial:sqlite-jdbc:3.53.4.0'
```

`backend/src/main/java/server/ApplicationConfig.java` becomes:

```java
package server;

public class ApplicationConfig {
    private static final String ENV_DEBUG = "DEBUG_MODE";
    private static final String ENV_DATABASE_PATH = "DATABASE_PATH";

    public static boolean DEBUG = System.getenv(ENV_DEBUG) != null;
    /** Path of the SQLite backup file. Unset or blank disables persistence. */
    public static String DATABASE_PATH = System.getenv(ENV_DATABASE_PATH);
}
```

- [ ] **Step 4: Rewrite the database section**

In `SecretHitlerServer.java`, delete `import java.net.URI;`. Replace everything from `/////// Database Handling` to its closing `// </editor-fold>` (lines 211-359) with:

```java
    /////// Database Handling
    // <editor-fold desc="Database Handling">

    /**
     * Opens the SQLite backup database at {@code path}, creating the file and the
     * backup table if needed.
     *
     * @return null if {@code path} is null or blank, or the database cannot be
     *         opened; otherwise an open connection.
     */
    static Connection getDatabaseConnection(String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        try {
            Connection c = DriverManager.getConnection("jdbc:sqlite:" + path);
            initializeDatabase(c);
            return c;
        } catch (SQLException e) {
            logger.error("Could not open the backup database at " + path + ".", e);
            return null;
        }
    }

    /**
     * Stores {@code lobbies} as the single backup row, replacing any earlier one.
     */
    static void storeLobbies(Connection c, Map<String, Lobby> lobbies) throws SQLException, IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(lobbies);
        }
        String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
                .format(new Timestamp(System.currentTimeMillis()));
        String query = "INSERT INTO backup (id, timestamp, attempts, lobby_bytes) VALUES (0, ?, 0, ?) "
                + "ON CONFLICT (id) DO UPDATE SET timestamp = excluded.timestamp, "
                + "attempts = excluded.attempts, lobby_bytes = excluded.lobby_bytes;";
        try (PreparedStatement stmt = c.prepareStatement(query)) {
            stmt.setString(1, timestamp);
            stmt.setBytes(2, bytes.toByteArray());
            stmt.executeUpdate();
        }
    }

    /**
     * Loads the backup row and counts the load in its {@code attempts} column.
     *
     * @return the stored lobbies, or null if nothing has been stored.
     */
    @SuppressWarnings("unchecked")
    static ConcurrentHashMap<String, Lobby> loadLobbies(Connection c)
            throws SQLException, IOException, ClassNotFoundException {
        byte[] lobbyBytes;
        try (Statement stmt = c.createStatement();
                ResultSet rs = stmt.executeQuery("SELECT timestamp, lobby_bytes FROM backup WHERE id = 0;")) {
            if (!rs.next()) {
                return null;
            }
            logger.info("Loaded backup from " + rs.getString("timestamp") + ".");
            lobbyBytes = rs.getBytes("lobby_bytes");
        }
        try (Statement stmt = c.createStatement()) {
            stmt.executeUpdate("UPDATE backup SET attempts = attempts + 1 WHERE id = 0;");
        }
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(lobbyBytes))) {
            return (ConcurrentHashMap<String, Lobby>) in.readObject();
        }
    }

    /**
     * Loads lobby data stored in the database (intended to be run on server wake).
     *
     * @effects {@code codeToLobby} is set to the stored lobbies, if there are any.
     */
    private static void loadDatabaseBackup() {
        try (Connection c = getDatabaseConnection(ApplicationConfig.DATABASE_PATH)) {
            if (c != null) {
                ConcurrentHashMap<String, Lobby> stored = loadLobbies(c);
                if (stored != null) {
                    codeToLobby = stored;
                }
            }
        } catch (Exception e) {
            logger.error("Failed to load the lobby backup.", e);
        }
        printLobbyStatus();
    }

    private static void storeDatabaseBackup() {
        try (Connection c = getDatabaseConnection(ApplicationConfig.DATABASE_PATH)) {
            if (c != null) {
                storeLobbies(c, codeToLobby);
                logger.debug("Successfully saved Lobby state to the database.");
            }
        } catch (Exception e) {
            logger.error("Failed to store the Lobby data in the database.", e);
        }
    }

    /**
     * Creates the backup table if it does not exist yet.
     */
    private static void initializeDatabase(Connection c) throws SQLException {
        try (Statement stmt = c.createStatement()) {
            stmt.executeUpdate("CREATE TABLE IF NOT EXISTS backup "
                    + "(id INT UNIQUE, timestamp TEXT, attempts INT, lobby_bytes BLOB);");
        }
    }

    // </editor-fold>
```

In `main()`, before `loadDatabaseBackup();`, add the single message for the unset case:

```java
        if (ApplicationConfig.DATABASE_PATH == null || ApplicationConfig.DATABASE_PATH.isBlank()) {
            logger.error("Persistence disabled: no DATABASE_PATH environment variable provided.");
        }
```

(An unwritable path logs one error per load or store attempt, from `getDatabaseConnection`, and the server keeps running. SQLite accepts the `ON CONFLICT … DO UPDATE` upsert because `id` is `UNIQUE`.)

- [ ] **Step 5: Run the tests**

Run: `cd backend && ./gradlew test`
Expected: `BUILD SUCCESSFUL`. The XML reports total 11 tests (7 baseline + 4 new), 0 failures.

- [ ] **Step 6: Commit**

Tick the Task 3.1 boxes, then `git commit -m "feat(backend): back up lobbies to a sqlite file"`.

---

### Task 2 (PLAN 3.2): Same-origin serving

**Files:**
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (`Javalin.create`, line 123), `backend/build.gradle`, `frontend/src/constants/index.ts:11-17`, `frontend/src/App.tsx:858`, `frontend/vite.config.ts`
- Create: `frontend/src/constants/serverUrls.ts`, `frontend/src/constants/serverUrls.test.ts`
- Rename: `frontend/.env.local` → `frontend/.env.development`

**Interfaces:**
- Produces: `serverUrls(location: PageLocation, env: AddressEnv): { address: string; http: string; websocketHeader: string }`. Dev-server env var `BACKEND_URL` (default `http://localhost:4040`).

- [ ] **Step 1: Failing test for URL derivation**

`frontend/src/constants/serverUrls.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { serverUrls } from "./serverUrls";

const https = { protocol: "https:", host: "sh.example.com", origin: "https://sh.example.com" };
const http = { protocol: "http:", host: "localhost:3000", origin: "http://localhost:3000" };

describe("serverUrls", () => {
  test("uses the page's own host over wss on an https page", () => {
    expect(serverUrls(https, {})).toEqual({
      address: "sh.example.com",
      http: "https://sh.example.com",
      websocketHeader: "wss://",
    });
  });

  test("uses ws on an http page", () => {
    expect(serverUrls(http, {})).toEqual({
      address: "localhost:3000",
      http: "http://localhost:3000",
      websocketHeader: "ws://",
    });
  });

  test("VITE_SERVER_ADDRESS overrides the page, defaulting to https and wss", () => {
    expect(serverUrls(http, { VITE_SERVER_ADDRESS: "api.example.com" })).toEqual({
      address: "api.example.com",
      http: "https://api.example.com",
      websocketHeader: "wss://",
    });
  });

  test("every override is honoured", () => {
    expect(
      serverUrls(https, {
        VITE_SERVER_ADDRESS: "dev.example.com",
        VITE_SERVER_ADDRESS_HTTP: "http://dev.example.com",
        VITE_WEBSOCKET_HEADER: "ws://",
      })
    ).toEqual({ address: "dev.example.com", http: "http://dev.example.com", websocketHeader: "ws://" });
  });
});
```

Run: `cd frontend && npm test -- --run src/constants/serverUrls.test.ts`
Expected: FAIL, because `./serverUrls` cannot be resolved.

- [ ] **Step 2: Implement `serverUrls` and use it**

`frontend/src/constants/serverUrls.ts`:

```ts
export type PageLocation = Pick<Location, "protocol" | "host" | "origin">;
export type AddressEnv = Pick<
  ImportMetaEnv,
  "VITE_SERVER_ADDRESS" | "VITE_SERVER_ADDRESS_HTTP" | "VITE_WEBSOCKET_HEADER"
>;

/**
 * Where the client finds the server: the page's own origin, unless
 * VITE_SERVER_ADDRESS points at a separate backend.
 */
export function serverUrls(location: PageLocation, env: AddressEnv) {
  if (env.VITE_SERVER_ADDRESS) {
    return {
      address: env.VITE_SERVER_ADDRESS,
      http: env.VITE_SERVER_ADDRESS_HTTP || "https://" + env.VITE_SERVER_ADDRESS,
      websocketHeader: env.VITE_WEBSOCKET_HEADER || "wss://",
    };
  }
  return {
    address: location.host,
    http: location.origin,
    websocketHeader: location.protocol === "https:" ? "wss://" : "ws://",
  };
}
```

In `frontend/src/constants/index.ts`, add `import { serverUrls } from "./serverUrls";` at the top. Replace the `SERVER_ADDRESS`, `SERVER_ADDRESS_HTTP` and `WEBSOCKET_HEADER` declarations (lines 12-17; `DEBUG` on line 11 stays) with:

```ts
const urls = serverUrls(window.location, import.meta.env);
export const SERVER_ADDRESS = urls.address;
export const SERVER_ADDRESS_HTTP = urls.http;
export const WEBSOCKET_HEADER = urls.websocketHeader;
```

In `frontend/src/App.tsx:858`, the invite link becomes:

```tsx
              value={window.location.origin + "/?lobby=" + this.state.lobby}
```

Run: `npm test -- --run`
Expected: `Tests  6 passed (6)`.

- [ ] **Step 3: Dev env and proxy**

`git mv frontend/.env.local frontend/.env.development` and make its contents:

```
VITE_DEBUG=DEBUG
```

(`.env.development` is read only by the dev server, mode `development`. The build no longer bakes in debug logging, and with no address set, the dev page talks to its own origin through the proxy.)

`frontend/vite.config.ts` becomes:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Where the dev server forwards API and WebSocket traffic; compose sets it to the backend service.
const backend = process.env.BACKEND_URL ?? "http://localhost:4040";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/check-login": backend,
      "/new-lobby": backend,
      "/ping": backend,
      "/game": { target: backend, ws: true },
    },
  },
  preview: { port: 3000, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
  },
});
```

- [ ] **Step 4: Serve the frontend from the backend**

In `SecretHitlerServer.java`, add `import io.javalin.http.staticfiles.Location;`. Make the first statement inside `Javalin.create(config -> {`:

```java
            // Serve the built frontend when it was bundled into the jar (see build.gradle).
            // Javalin refuses to start if a classpath static directory is missing.
            if (SecretHitlerServer.class.getResource("/public/index.html") != null) {
                config.staticFiles.add("/public", Location.CLASSPATH);
            }
```

Replace the `config.plugins.enableCors(...)` block (which allowed only `https://secret-hitler.online` outside debug mode) with:

```java
            // The frontend is served from this same origin, so CORS is only needed when a
            // separately hosted dev frontend calls the server directly (debug mode). Outside
            // debug mode the CORS plugin would reject same-origin module scripts, which
            // browsers fetch with an Origin header.
            if (ApplicationConfig.DEBUG) {
                config.plugins.enableCors(cors -> {
                    cors.add(it -> {
                        it.anyHost();
                    });
                });
            }
```

At the end of `backend/build.gradle`, add:

```groovy
// Bundle the built frontend (frontend/dist, from `npm run build`) into the jar's public/.
processResources {
    from('../frontend/dist') {
        into 'public'
    }
}
```

- [ ] **Step 5: Verify both setups**

Dev setup: with `./gradlew runLocal` (no `frontend/dist` yet, so no static files) and `npm run dev`, create a lobby at `http://localhost:3000`, pick a portrait, and start a CPU game. Requests go to `localhost:3000/...` and the WebSocket to `ws://localhost:3000/game`, all through the proxy. The invite link reads `http://localhost:3000/?lobby=XXXX`.

One port:

```bash
cd frontend && npm run build && cd ../backend && ./gradlew jar
PORT=4041 java -jar build/libs/secret-hitler-online.jar &
curl -s localhost:4041/ | grep -c 'id="root"'
curl -s localhost:4041/ping
```

Expected: `1` and `OK`. Also `curl -s -o /dev/null -w '%{http_code}' -H 'Origin: http://localhost:4041' localhost:4041/assets/<index js>` → `200` (this was `400` under the old CORS rule). Then open `http://localhost:4041`: create a lobby, play a CPU game to the end, and check the WebSocket goes to `ws://localhost:4041/game`. The production build shows no console errors at all. Stop the jar afterwards.

- [ ] **Step 6: Commit**

Tick the Task 3.2 boxes, then `git commit -m "feat(backend): serve the frontend from the same origin"`.

---

### Task 3 (PLAN 3.3): Image

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Delete: `backend/Dockerfile`, `backend/config/Dockerfile.dev`

- [ ] **Step 1: `.dockerignore`**

```
.git
docs
**/node_modules
frontend/dist
backend/build
backend/.gradle
```

- [ ] **Step 2: `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# Frontend and jar are platform-independent, so both build on the build machine.
FROM --platform=$BUILDPLATFORM node:24 AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM eclipse-temurin:17-jdk AS backend
WORKDIR /app/backend
COPY backend/gradlew backend/build.gradle backend/settings.gradle ./
COPY backend/gradle ./gradle
RUN ./gradlew --no-daemon dependencies > /dev/null
COPY backend/src ./src
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN ./gradlew --no-daemon jar && mkdir -p /out/data

FROM eclipse-temurin:17-jre
ENV PORT=8080 DATABASE_PATH=/data/backup.db
COPY --from=backend --chown=1000:1000 /out/data /data
COPY --from=backend /app/backend/build/libs/secret-hitler-online.jar /app/secret-hitler-online.jar
VOLUME /data
EXPOSE 8080
# uid 1000 is the usual owner of a host data directory, so a bind-mounted /data stays writable.
USER 1000:1000
CMD ["java", "-jar", "/app/secret-hitler-online.jar"]
```

`git rm backend/Dockerfile backend/config/Dockerfile.dev`. Nothing references them since the Fly config went in Phase 1.

- [ ] **Step 3: Build and play**

```bash
docker build -t secret-hitler-online:local .
docker run -d --name sh-local -p 8080:8080 -v sh-data:/data secret-hitler-online:local
curl -s localhost:8080/ping
docker exec sh-local id -u
```

Expected: `OK`, then `1000`. Play a CPU game at `http://localhost:8080` to the end.

- [ ] **Step 4: Restart mid-game**

Start a game with two players (host and guest) and three CPU players. After a few prompts, run `docker restart sh-local`. The shutdown hook stores the backup, and the logs show `Loaded backup from …` on start. Both clients reconnect on their own (the WebSocket retry), or by pressing JOIN on the prefilled form after a reload. The lobby and game are still there, and the game continues to a victory screen.

Clean up: `docker rm -f sh-local && docker volume rm sh-data`.

- [ ] **Step 5: Commit**

Tick the Task 3.3 boxes, then `git commit -m "build(docker): add a multi-stage image serving the whole app"`.

---

### Task 4 (PLAN 3.4): Dev compose and docs

**Files:**
- Modify: `docker-compose.yml`, `DEVELOPMENT.md`, `CLAUDE.md`

- [ ] **Step 1: Compose**

Remove the `db` service, and the backend's `DATABASE_URL` and `depends_on`. The backend gets `DATABASE_PATH: /data/backup.db` and a `sh-data:/data` volume; the frontend gets `BACKEND_URL: http://backend:4040`. Add `sh-data: {}` under `volumes`. The resulting file:

```yaml
services:
  backend:
    image: gradle:8.6.0-jdk17
    container_name: sh-backend
    working_dir: /app/backend
    volumes:
      - ./backend:/app/backend
      - gradle-cache:/home/gradle/.gradle
      - sh-data:/data
    environment:
      DEBUG_MODE: "true"
      DATABASE_PATH: /data/backup.db
      PORT: "4040"
    command: ["bash", "-lc", "./gradlew runLocal"]
    ports:
      - "4040:4040"

  frontend:
    image: node:24
    container_name: sh-frontend
    working_dir: /app/frontend
    volumes:
      - ./frontend:/app/frontend
    environment:
      BACKEND_URL: http://backend:4040
    command: bash -lc "npm install && npm run dev -- --host"
    depends_on:
      - backend
    ports:
      - "3000:3000"

volumes:
  gradle-cache: {}
  sh-data: {}
```

Verify in a scratch worktree, as in Phase 2 (`docker compose config -q`, `up -d`, a lobby through `:3000`, `/ping`, `down -v`). Removing the worktree afterwards needs root.

- [ ] **Step 2: Docs**

- `DEVELOPMENT.md`: drop the Postgres "only DB in Docker" path. Persistence is `DATABASE_PATH=<file>` (unset = no persistence). The dev server proxies the backend paths to `BACKEND_URL` (default `localhost:4040`). `java -jar` after `npm run build` serves everything on one port. The image is `docker build .`.
- `CLAUDE.md`: layout and commands gain `DATABASE_PATH`, same-origin serving (`/public` on the classpath), the Vite proxy and `BACKEND_URL`, `.env.development`, the root `Dockerfile`, and the deploy path (CI publishes `ghcr.io/jussaw/secret-hitler-online` for the host to run).

- [ ] **Step 3: Commits**

`build(docker): use sqlite in the dev compose stack` (ticks the compose box), `docs(development): document sqlite and same-origin serving` (ticks `DEVELOPMENT.md`), `docs(claude): describe persistence, packaging and deploy` (ticks `CLAUDE.md`).

---

### Task 5 (PLAN 3.5): CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [development]
  push:
    branches: [development]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-java@v6
        with:
          distribution: temurin
          java-version: "17"
      - uses: gradle/actions/setup-gradle@v6
      - name: Backend tests
        working-directory: backend
        run: ./gradlew test
      - uses: actions/setup-node@v7
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Frontend tests and build
        working-directory: frontend
        run: npm ci && npm test -- --run && npm run build

  image:
    if: github.event_name == 'push' && github.ref == 'refs/heads/development'
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-qemu-action@v4
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ghcr.io/jussaw/secret-hitler-online
          tags: |
            type=raw,value=latest
            type=sha,prefix=sha-
      - uses: docker/build-push-action@v7
        with:
          context: .
          platforms: linux/arm64,linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Commit, push, open PR 1**

`git commit -m "ci(ci): test every pull request and publish images from development"` (no box yet; the first green run on `development` is the box). Push and open PR 1 into `development`. The `test` job must pass on the PR.

- [ ] **Step 3: Gate (ask the user)**

Ask in one multiple-choice prompt:
1. Merge PR 1 now, so the image job publishes the first image? (Recommended; Tasks 6-7 continue on a fresh `phase-3-deploy` branch with PR 2.)
2. Which subdomain?
3. Approve the host stack change and the deploy. Who adds the public hostname, the GHCR visibility switch and the uptime monitor? All three are dashboard actions with no credentials in this session.
4. Does the merge approval stand for later phase PRs once their checks pass?

- [ ] **Step 4: After the merge**

Watch the `development` run. Both jobs must be green, and `ghcr.io/jussaw/secret-hitler-online:latest` and `:sha-<short>` must exist. Check whether an anonymous pull works:

```bash
curl -s "https://ghcr.io/token?scope=repository:jussaw/secret-hitler-online:pull"
```

If the package is private, the user switches it to public (package settings) to match the sibling images. Then branch `phase-3-deploy` again from `development`, and tick the Task 3.5 boxes and the Phase 3 "PR 1 merged" note in its first commit.

---

### Task 6 (PLAN 3.6): Host stack (gated)

- [ ] **Step 1: Service**

Add to the host's compose file, in key order (`container_name` → `image` → `environment` → `volumes` → `ports` → `restart`):

```yaml
  secret-hitler-online:
    container_name: secret-hitler-online
    image: ghcr.io/jussaw/secret-hitler-online:latest
    environment:
      - TZ=${TZ}
    volumes:
      - ./data:/data
    ports:
      - 8080:8080
    restart: unless-stopped
```

The host data directory must exist, owned by uid 1000.

- [ ] **Step 2: Validate, commit, deploy**

Validate with `docker compose config -q`, commit the stack change where the host's stacks live, and redeploy the stack on the host. Check: `curl -s http://<host>:<port>/ping` → `OK`.

---

### Task 7 (PLAN 3.7): Public hostname and monitoring (gated)

- [ ] Add a public hostname `<subdomain>` → the published port on the host's TLS-terminating proxy, with WebSockets passed through.
- [ ] Add an uptime monitor for `https://<subdomain>/ping`.

---

### Task 8: Phase 3 acceptance

- [ ] `curl -s https://<subdomain>/ping` → `OK`.
- [ ] Two real browsers plus CPU players finish a game over `wss://<subdomain>/game`.
- [ ] Restart the container mid-game (redeploy, or `docker restart secret-hitler-online` on the host). Players rejoin and continue.
- [ ] A push to `development` produces a new `:sha-…` image, and the host's image updater replaces the running container (`docker inspect` image digest changes).
- [ ] Push, PR 2 into `development`, then merge after the user's OK. "PR merged" is ticked in the first commit on `phase-4-round-table`.
