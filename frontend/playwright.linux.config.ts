import { defineConfig } from "@playwright/test";
import base, { PORT } from "./playwright.config";

// The browser tests in Playwright's Linux image (DEVELOPMENT.md, "Browser tests on Linux"), as CI
// runs them: Linux fonts, and a Firefox that launches. They drive the jar already serving on the
// host (on E2E_PORT, as the base config), so this config starts no server of its own.
export default defineConfig({
  ...base,
  webServer: undefined,
  use: { ...base.use, baseURL: `http://host.docker.internal:${PORT}` },
});
