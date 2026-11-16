import { defineConfig, devices } from "@playwright/test";

// The jar serves the built frontend and the game server on one port, as in production. E2E_PORT
// moves it, so runs in two worktrees at once each get their own: while a run builds, it waits for
// any jar on its port to answer /ping, and would test another worktree's.
export const PORT = Number(process.env.E2E_PORT ?? 4545);

// Three digits for this run, the second it started modulo 1000, set once here and handed to the
// workers, which inherit the runner's environment: e2e/accounts.ts puts them in every account's
// name, so a run against a server an earlier run used (DEVELOPMENT.md, "Browser tests on Linux")
// takes none of that run's names, which are unique ignoring case across every account (two runs
// share the digits only when they start a multiple of 1000 s apart, to the second). Set E2E_RUN to
// three digits to make a run's names again; e2e/accounts.ts refuses any other value.
process.env.E2E_RUN ??= String(Math.floor(Date.now() / 1000) % 1000).padStart(3, "0");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // On CI a test that fails once is run again, and a pass on the retry is reported as flaky.
  retries: process.env.CI ? 1 : 0,
  // CI also writes an HTML report, which ci.yml keeps (with the traces) when a run fails.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    // The game page at the five desktop sizes and in the narrow windows.
    { name: "desktop", use: devices["Desktop Chrome"], testIgnore: /phone\.spec/ },
    // Firefox lays out the game page and the header control with its own rounding, could leave
    // a closed prompt's box on screen, and hit-tests a held press itself. It checks every stats
    // page too (stats-*.spec).
    {
      name: "firefox",
      use: devices["Desktop Firefox"],
      testMatch: /(no-scroll|sounds|spectator|prompt-close|button-press|stats-[a-z-]+)\.spec/,
    },
    // Phones in portrait, emulated with touch and their own pixel ratio. Held mouse presses
    // (button-press) are a desktop matter.
    { name: "phone-360", use: devices["Galaxy S8"], testIgnore: /(no-scroll|button-press)\.spec/ },
    {
      name: "phone-412",
      use: { ...devices["Pixel 7"], viewport: { width: 412, height: 915 } },
      testIgnore: /(no-scroll|lobby-switch|accounts|button-press)\.spec/,
    },
  ],
  webServer: {
    // Needs Java 17 for the Gradle wrapper.
    command:
      "npm run build && cd ../backend && ./gradlew jar && java -jar build/libs/secret-hitler-online.jar",
    url: `http://localhost:${PORT}/ping`,
    // Playing needs a signed-in account: the tests sign in through the test sign-in (e2e/accounts.ts).
    env: { PORT: String(PORT), TEST_SIGN_IN: "true" },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
