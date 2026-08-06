import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the production build, not the dev server: the artefact under test
 * should be the artefact that ships.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
