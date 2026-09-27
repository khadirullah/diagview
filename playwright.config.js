import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT, SITE } from "./tests/e2e/helpers.mjs";

// Browser suites. Build first (npm run build), then npm run test:e2e.
// Each spec drives one shared page through a sequence of steps, so the
// tests inside a file run in order and files run one per worker.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The checks wait fixed times for animations, like a person would, so
  // keep the machine lightly loaded
  workers: 2,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node tests/e2e/serve.mjs ${E2E_PORT}`,
    url: `${SITE}/tests/e2e/repro.html`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
  },
  projects: [
    {
      name: "chromium",
      // Use the installed Chrome locally, Playwright's Chromium in CI
      use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" }) },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
