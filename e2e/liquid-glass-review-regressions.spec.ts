import { expect, test, type Page } from "@playwright/test";

const PROVIDER_PATTERNS = [
  "**/api.open-meteo.com/**",
  "**/air-quality-api.open-meteo.com/**",
  "**/ensemble-api.open-meteo.com/**",
  "**/geocoding-api.open-meteo.com/**",
  "**/api.weather.gov/**",
  "**/mapservices.weather.noaa.gov/**",
  "**/basemap.nationalmap.gov/**",
  "**/tile.openstreetmap.org/**",
] as const;

async function abortProviders(page: Page): Promise<void> {
  for (const pattern of PROVIDER_PATTERNS) {
    await page.route(pattern, (route) => route.abort());
  }
}

async function bootFallbackDashboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "wx.location-onboarding.v1",
      JSON.stringify({ version: 1, complete: true })
    );
  });
  await abortProviders(page);
  await page.goto("/");
  await expect(page.getByTestId("forecast-overview")).toBeVisible({
    timeout: 15_000,
  });
}

test("primary onboarding action keeps dark text on an opaque hover surface", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Computed hover contract is covered once in desktop Chromium"
  );
  await abortProviders(page);
  await page.goto("/");

  const button = page
    .getByRole("dialog", { name: "Use your local weather" })
    .getByRole("button", { name: "Use my location", exact: true });
  await button.hover();

  await expect
    .poll(() =>
      button.evaluate((element) => getComputedStyle(element).backgroundColor)
    )
    .toBe("rgb(255, 255, 255)");
  await expect
    .poll(() =>
      button.evaluate((element) => getComputedStyle(element).color)
    )
    .toBe("rgb(15, 23, 42)");
});

test("solid-mode controls stay opaque while hovered", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Computed hover contract is covered once in desktop Chromium"
  );
  await bootFallbackDashboard(page);
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-glass-mode", "solid")
  );

  const surface = page.getByRole("combobox").locator("..");
  await expect
    .poll(() =>
      surface.evaluate((element) => getComputedStyle(element).backgroundColor)
    )
    .toBe("rgb(10, 27, 45)");

  await surface.hover();
  await expect
    .poll(() =>
      surface.evaluate((element) => getComputedStyle(element).backgroundColor)
    )
    .toBe("rgb(10, 27, 45)");
});
