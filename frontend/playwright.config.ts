import { defineConfig, devices } from "@playwright/test";

// The jar serves the built frontend and the game server on one port, as in production.
const PORT = 4545;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}` },
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
