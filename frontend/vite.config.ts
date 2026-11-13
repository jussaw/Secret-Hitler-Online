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
    // Playwright owns e2e/*.spec.ts.
    include: ["src/**/*.test.{ts,tsx}"],
    // One jsdom per worker, with each file still isolated in its own vm context.
    pool: "vmThreads",
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
  },
});
