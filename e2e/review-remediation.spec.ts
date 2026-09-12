import { expect, test, type Page } from "@playwright/test";

const NOW = new Date("2026-09-12T12:30:00Z");
const BASE = Date.UTC(2026, 8, 12, 12) / 1000;
const times = Array.from({ length: 96 }, (_, index) => BASE + (index - 26) * 3600);
const values = (value: number): number[] => times.map(() => value);
const days = Array.from({ length: 10 }, (_, index) => Date.UTC(2026, 8, 12 + index) / 1000);
const forecast = {
  timezone: "UTC", utc_offset_seconds: 0,
  current: { temperature_2m: 67, apparent_temperature: 63, relative_humidity_2m: 84,
    weather_code: 61, is_day: 1, wind_speed_10m: 6, surface_pressure: 1013,
    time: BASE, interval: 900, precipitation: 0.04, rain: 0.04, showers: 0, snowfall: 0, cloud_cover: 92 },
  hourly: { time: times, temperature_2m: values(67), weather_code: values(61),
    precipitation_probability: values(30), is_day: values(1), visibility: values(16000), precipitation: values(0.03) },
  minutely_15: { time: Array.from({ length: 105 }, (_, i) => BASE - (104 - i) * 900),
    rain: Array.from({ length: 105 }, () => 0.01), showers: Array.from({ length: 105 }, () => 0) },
  daily: { time: days, weather_code: days.map(() => 61), temperature_2m_max: days.map(() => 72),
    temperature_2m_min: days.map(() => 54), sunrise: days.map((day) => day + 6 * 3600),
    sunset: days.map((day) => day + 18 * 3600), uv_index_max: days.map(() => 3) },
};

async function boot(page: Page, onboarding = false): Promise<void> {
  await page.clock.install({ time: NOW });
  if (!onboarding) await page.addInitScript(() => localStorage.setItem("wx.location-onboarding.v1", '{"version":1,"complete":true}'));
  await page.route("**/api.open-meteo.com/**", (route) => route.fulfill({ json: forecast }));
  await page.route("**/air-quality-api.open-meteo.com/**", (route) => route.fulfill({ json: { current: { us_aqi: 28 } } }));
  await page.route("**/ensemble-api.open-meteo.com/**", (route) => {
    const hourly: Record<string, unknown> = { time: times };
    for (let member = 0; member < 12; member++) {
      hourly[`precipitation_member${String(member).padStart(2, "0")}`] = values(member * 0.001);
      hourly[`temperature_2m_member${String(member).padStart(2, "0")}`] = values(60 + member);
    }
    return route.fulfill({ json: { hourly } });
  });
  await page.route("**/geocoding-api.open-meteo.com/**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("name") ?? "";
    const results = query.startsWith("London")
      ? [{ latitude: 51.5072, longitude: -0.1276, name: "London", country_code: "GB", country: "United Kingdom" }]
      : [{ latitude: 35.68, longitude: 139.69, name: "Tokyo", country_code: "JP", country: "Japan", population: 9000000 },
        { latitude: 34.69, longitude: 135.5, name: "Osaka", country_code: "JP", country: "Japan", population: 2000000 }];
    return route.fulfill({ json: { results } });
  });
  await page.route("**/photon.komoot.io/**", (route) => route.fulfill({ json: { features: [] } }));
  await page.route("**/tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/");
  if (!onboarding) await expect(page.getByText(/GFS ensemble \(12\)/)).toBeVisible();
}

async function pickTokyo(page: Page): Promise<void> {
  await page.getByRole("combobox").fill("Tokyo");
  await page.getByRole("option").filter({ hasText: "Tokyo" }).click();
  await expect(page.getByRole("heading", { name: "Tokyo", exact: true })).toBeVisible();
}

test("review: hour cells and ensemble band share a horizontal time scale", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const cells = page.getByRole("button", { name: /^Inspect / });
  await cells.last().click();
  const cell = (await cells.last().boundingBox())!;
  const band = page.getByRole("img", { name: /Ensemble temperature range/ });
  const marker = (await band.locator("line").boundingBox())!;
  expect(Math.abs(cell.x + cell.width / 2 - (marker.x + marker.width / 2))).toBeLessThan(1);
});

test("review: changing query prevents Enter from selecting the preceding result", async ({ page }) => {
  await boot(page);
  const input = page.getByRole("combobox");
  await input.fill("Tokyo");
  await expect(page.getByRole("option").filter({ hasText: "Tokyo" })).toBeVisible();
  await input.fill("London");
  await input.press("Enter");
  await expect(input).toHaveValue("London");
  await expect(page.getByRole("heading", { name: "Palo Alto", exact: true })).toBeVisible();
});

test("review: combobox arrows announce and select the active option", async ({ page }) => {
  await boot(page);
  const input = page.getByRole("combobox");
  await input.fill("Tokyo");
  await expect(page.getByRole("option")).toHaveCount(2);
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(page.getByRole("option").filter({ hasText: "Osaka" })).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Osaka", exact: true })).toBeVisible();
});

test("review: failed persistence retains the place with session-only feedback", async ({ page }) => {
  await boot(page);
  await pickTokyo(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "wx.saved-locations.v1") throw new DOMException("quota", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save current location", exact: true }).click();
  await expect(page.getByText("Saved locations are available for this session only.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Tokyo forecast", exact: true })).toBeVisible();
});

test("review: a save notice does not hide a new refresh failure", async ({ page }) => {
  await boot(page);
  await pickTokyo(page);
  await page.getByRole("button", { name: "Save current location", exact: true }).click();
  await page.route("**/api.open-meteo.com/**", (route) => route.fulfill({ status: 400, json: { error: true } }));
  await page.getByRole("button", { name: "Refresh forecast", exact: true }).click();
  await expect(page.getByText(/Couldn't reach the forecast service/)).toBeVisible();
  await expect(page.getByTestId("weather-freshness")).toContainText(/refresh failed/i);
});

test("review: busy onboarding keeps Tab focus inside its dialog", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition() { /* Remain pending to inspect busy focus. */ } }, configurable: true,
  }));
  await boot(page, true);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Use my location", exact: true }).click();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
});

test("review: Escape dismisses a focused metric tooltip", async ({ page }) => {
  await boot(page);
  const humidity = page.getByTestId("weather-metric-humidity");
  await humidity.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await humidity.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("review: stale point data refreshes only after the tab becomes visible", async ({ page }) => {
  await boot(page);
  let refreshes = 0;
  await page.route("**/api.open-meteo.com/**", (route) => {
    if (new URL(route.request().url()).searchParams.has("current")) refreshes++;
    return route.fulfill({ json: forecast });
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(11 * 60_000);
  expect(refreshes).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => refreshes).toBe(1);
  // This provider deliberately returns the same 12:00 observation. A successful
  // request must not reset the source-data age or cause an immediate retry loop.
  await expect(page.getByTestId("weather-freshness")).toContainText(/updated 41 min ago.*stale/i);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(200);
  expect(refreshes).toBe(1);
});

test("review: an older location request cannot override a later manual selection", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "geolocation", {
    configurable: true, value: { getCurrentPosition(success: PositionCallback) {
      Object.assign(window, { finishReviewLocation: () => success({
        coords: { latitude: 40.7128, longitude: -74.006 },
      } as GeolocationPosition) });
    } },
  }));
  await boot(page);
  await page.route("**/api.bigdatacloud.net/**", (route) => route.fulfill({ json: { city: "New York", countryCode: "US", countryName: "United States" } }));
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await pickTokyo(page);
  await page.evaluate(() => (window as unknown as { finishReviewLocation: () => void }).finishReviewLocation());
  await page.waitForTimeout(100);
  await expect(page.getByRole("heading", { name: "Tokyo", exact: true })).toBeVisible();
});

test("review: a failed replacement map grid stops announcing loading", async ({ page }) => {
  await boot(page);
  let requests = 0;
  await page.route((url) => url.hostname === "api.open-meteo.com" && url.pathname.endsWith("/v1/gfs"), (route) => {
    requests++;
    if (requests === 2) return route.fulfill({ status: 400, json: { error: "fixture failure" } });
    const url = new URL(route.request().url());
    const latitudes = url.searchParams.get("latitude")!.split(",").map(Number);
    const longitudes = url.searchParams.get("longitude")!.split(",").map(Number);
    const mapTimes = Array.from({ length: 48 }, (_, hour) => new Date((BASE + hour * 3600) * 1000).toISOString().slice(0, 16));
    return route.fulfill({ json: latitudes.map((latitude, index) => ({
      latitude, longitude: longitudes[index],
      hourly_units: { temperature_2m: "°C", pressure_msl: "hPa", precipitation: "mm", wind_speed_10m: "km/h", wind_direction_10m: "°" },
      hourly: { time: mapTimes, temperature_2m: mapTimes.map(() => 15),
        pressure_msl: mapTimes.map(() => 996 + index * 0.18), precipitation: mapTimes.map(() => 0),
        wind_speed_10m: mapTimes.map(() => 12), wind_direction_10m: mapTimes.map(() => 180) },
    })) });
  });
  await page.getByTestId("forecast-map-shell").scrollIntoViewIfNeeded();
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible();
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.focus();
  await viewport.press("ArrowRight");
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByText("Loading forecast field…", { exact: true })).toHaveCount(0);
  await retry.click();
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible();
  await expect(retry).toHaveCount(0);
  expect(requests).toBe(3);
});
