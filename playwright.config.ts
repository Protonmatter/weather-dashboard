import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the production build, not the dev server: the artefact under test
 * should be the artefact that ships.
 */
const visualSpec = /liquid-glass\.visual\.spec\.ts/;
const desktopResizeJourneys =
  /keeps NOAA radar aligned on a wide zoomed-out map|updates responsive map height without resetting interaction state/;

export default defineConfig({
  testDir: "./e2e",
  // WebKit map journeys can exceed 30 s when the full matrix contends for browser/GPU
  // resources. Keep a bounded margin while retaining zero local retries.
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: visualSpec, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testIgnore: visualSpec, use: { ...devices["Desktop Safari"] } },
    {
      name: "iphone",
      testIgnore: visualSpec,
      // These journeys deliberately resize through tablet/cinema and exercise desktop map
      // actionability. Desktop WebKit covers them; iPhone remains scoped to real phone flows.
      grepInvert: desktopResizeJourneys,
      use: { ...devices["iPhone 15"] },
    },
    { name: "android", testIgnore: visualSpec, use: { ...devices["Pixel 7"] } },
    {
      name: "visual",
      testMatch: visualSpec,
      // Full-page perceptual captures contend for browser/GPU resources when every case
      // runs concurrently, which can produce a transient hash from a partially painted frame.
      fullyParallel: false,
      use: {
        ...devices["Desktop Chrome"],
        colorScheme: "dark",
        locale: "en-US",
        timezoneId: "America/Los_Angeles",
      },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
