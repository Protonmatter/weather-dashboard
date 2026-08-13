import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-02-18T07:00:00.000Z");

const BASELINES = {
  phone: "25b8dee11fdd7e7f8a0b961eef2330317b7cb6d944c233734150fcac37c7165e",
  tablet: "63669e475daf3b593c5d1fba9810d90af00f5c617f5945680d70654c53ceaddb",
  cinema: "8f23aa6efd1ac288bcdf5d10077dec87ef3f9fef749d0b89c6068f670b20830d",
} as const;

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
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}

const scenarios = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 1180, height: 820 },
  { name: "cinema", width: 1920, height: 1080 },
] as const;

for (const scenario of scenarios) {
  test(`${scenario.name} Liquid Glass dashboard`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await bootVisualDashboard(page);

    const screenshot = await page.getByTestId("forecast-overview").screenshot({
      animations: "disabled",
      caret: "hide",
    });
    const actual = createHash("sha256").update(screenshot).digest("hex");

    if (actual !== BASELINES[scenario.name]) {
      await testInfo.attach(`liquid-glass-${scenario.name}.png`, {
        body: screenshot,
        contentType: "image/png",
      });
    }

    expect(actual).toBe(BASELINES[scenario.name]);
  });
}
