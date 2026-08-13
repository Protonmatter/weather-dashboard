import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-02-18T07:00:00.000Z");

async function bootVisualDashboard(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem(
      "wx.location-onboarding.v1",
      JSON.stringify({ version: 1, complete: true })
    );
  });
  for (const pattern of [
    "**/api.open-meteo.com/**",
    "**/air-quality-api.open-meteo.com/**",
    "**/ensemble-api.open-meteo.com/**",
    "**/mapservices.weather.noaa.gov/**",
    "**/api.rainviewer.com/**",
    "**/tile.openstreetmap.org/**",
  ]) {
    await page.route(pattern, (route) => route.abort());
  }
  await page.goto("/");
  await page.getByTestId("forecast-overview").waitFor();
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      .weather-particles, .scene-storm-flash { display: none !important; }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

const scenarios = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 1180, height: 820 },
  { name: "cinema", width: 1920, height: 1080 },
] as const;

for (const scenario of scenarios) {
  test(`${scenario.name} Liquid Glass dashboard`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await bootVisualDashboard(page);
    await expect(page.getByTestId("forecast-overview")).toHaveScreenshot(
      `liquid-glass-${scenario.name}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
      }
    );
  });
}
