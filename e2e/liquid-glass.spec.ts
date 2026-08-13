import { expect, test, type Page } from "@playwright/test";

async function bootFallbackDashboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("wx.location-onboarding.v1", JSON.stringify({ version: 1, complete: true }));
  });
  for (const pattern of ["**/api.open-meteo.com/**", "**/air-quality-api.open-meteo.com/**", "**/ensemble-api.open-meteo.com/**"]) {
    await page.route(pattern, (route) => route.abort());
  }
  await page.goto("/");
  await page.getByTestId("forecast-summary").waitFor();
}

test("exposes scene and glass-mode presentation hooks", async ({ page }) => {
  await bootFallbackDashboard(page);
  const app = page.getByTestId("weather-app");
  await expect(app).toHaveAttribute("data-glass-mode", "auto");
  await expect(app).toHaveAttribute("data-scene", /.+/);
});

test("uses the approved responsive forecast overview", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await bootFallbackDashboard(page);
  await expect(page.getByTestId("forecast-overview")).toHaveAttribute("data-layout", "responsive-matrix");
  await expect(page.getByTestId("current-conditions-hero")).toHaveAttribute("data-glass-level", "hero");
  await expect(page.getByTestId("temperature-trend-card")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-target="phone"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("renders procedural atmospheric depth behind the glass surfaces", async ({ page }) => {
  await bootFallbackDashboard(page);
  await expect(page.getByTestId("weather-backdrop")).toHaveAttribute("data-day", /day|night/);
  await expect(page.getByTestId("scene-city")).toBeVisible();
  await expect(page.getByTestId("scene-reflections")).toBeVisible();
  await expect(page.getByTestId("scene-haze")).toBeVisible();
});

test("reduced motion keeps weather context but disables particle animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bootFallbackDashboard(page);
  const particle = page.locator(".weather-particles > *").first();
  await expect(particle).toBeVisible();
  expect(await particle.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
});
