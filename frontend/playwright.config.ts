import { defineConfig, devices } from "@playwright/test";

// The jar serves the built frontend and the game server on one port, as in production.
const PORT = 4545;

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
    // a closed prompt's box on screen, and hit-tests a held press itself.
    {
      name: "firefox",
      use: devices["Desktop Firefox"],
      testMatch: /(no-scroll|sounds|spectator|prompt-close|button-press)\.spec/,
    },
    // Phones in portrait, emulated with touch and their own pixel ratio. Held mouse presses
    // (button-press) are a desktop matter.
    { name: "phone-360", use: devices["Galaxy S8"], testIgnore: /(no-scroll|button-press)\.spec/ },
    {
      name: "phone-412",
      use: { ...devices["Pixel 7"], viewport: { width: 412, height: 915 } },
      testIgnore: /(no-scroll|lobby-switch|button-press)\.spec/,
    },
  ],
  webServer: {
    // Needs Java 17 for the Gradle wrapper.
    command:
      "npm run build && cd ../backend && ./gradlew jar && java -jar build/libs/secret-hitler-online.jar",
    url: `http://localhost:${PORT}/ping`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
