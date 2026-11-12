import { defineConfig, devices } from "@playwright/test";

// The jar serves the built frontend and the game server on one port, as in production.
const PORT = 4545;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI also writes an HTML report, which ci.yml keeps (with the traces) when a run fails.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    // The round table at the five desktop sizes.
    { name: "desktop", use: devices["Desktop Chrome"], testIgnore: /phone\.spec/ },
    // Firefox lays out the zoomed seats of narrow windows with its own rounding.
    { name: "firefox", use: devices["Desktop Firefox"], testMatch: /no-scroll\.spec/ },
    // Phones in portrait, emulated with touch and their own pixel ratio.
    { name: "phone-360", use: devices["Galaxy S8"], testIgnore: /no-scroll\.spec/ },
    {
      name: "phone-412",
      use: { ...devices["Pixel 7"], viewport: { width: 412, height: 915 } },
      testIgnore: /no-scroll\.spec/,
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
