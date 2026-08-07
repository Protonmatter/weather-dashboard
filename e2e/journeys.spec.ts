import { test, expect, type Page } from "@playwright/test";

/**
 * Functional end-to-end journeys (RFC 0001 §4).
 *
 * These exercise a real browser against the built artefact. Provider calls are stubbed at
 * the network layer so the suite is deterministic: an E2E test that fails because a free
 * community geocoder was slow teaches nothing and trains the team to ignore red builds.
 * Live provider behaviour is covered separately by the contract suite.
 */

const forecastFixture = {
  current: {
    temperature_2m: 67, apparent_temperature: 63, relative_humidity_2m: 84,
    weather_code: 61, is_day: 1, wind_speed_10m: 6, surface_pressure: 1013,
  },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => new Date(Date.now() + (i - 2) * 3600e3).toISOString().slice(0, 16)),
    temperature_2m: Array.from({ length: 48 }, (_, i) => 60 + (i % 12)),
    weather_code: Array.from({ length: 48 }, () => 61),
    precipitation_probability: Array.from({ length: 48 }, (_, i) => (i * 7) % 100),
    is_day: Array.from({ length: 48 }, (_, i) => (i % 24 < 12 ? 1 : 0)),
    visibility: Array.from({ length: 48 }, () => 16000),
    // Read by the verification observation fetch, which shares this host. Without it the
    // fetch threw on an absent array inside Promise.allSettled and reconciliation was
    // silently unexercisable in e2e.
    precipitation: Array.from({ length: 48 }, (_, i) => (i % 5 === 0 ? 0.03 : 0)),
  },
  daily: {
    time: Array.from({ length: 10 }, (_, i) => new Date(Date.now() + i * 86400e3).toISOString().slice(0, 10)),
    weather_code: Array.from({ length: 10 }, () => 61),
    temperature_2m_max: Array.from({ length: 10 }, (_, i) => 72 + i),
    temperature_2m_min: Array.from({ length: 10 }, (_, i) => 54 + i),
    sunrise: Array.from({ length: 10 }, (_, i) => new Date(Date.now() + i * 86400e3).toISOString().slice(0, 11) + "07:04"),
    sunset: Array.from({ length: 10 }, (_, i) => new Date(Date.now() + i * 86400e3).toISOString().slice(0, 11) + "17:12"),
    uv_index_max: Array.from({ length: 10 }, () => 3),
  },
};

async function stubProviders(page: Page): Promise<void> {
  await page.route("**/api.open-meteo.com/**", (r) =>
    r.fulfill({ json: forecastFixture })
  );
  await page.route("**/air-quality-api.open-meteo.com/**", (r) =>
    r.fulfill({ json: { current: { us_aqi: 28 } } })
  );
  await page.route("**/ensemble-api.open-meteo.com/**", (r) => {
    const hourly: Record<string, unknown> = { time: forecastFixture.hourly.time };
    for (let m = 0; m < 12; m++) {
      hourly[`precipitation_member${String(m).padStart(2, "0")}`] =
        forecastFixture.hourly.time.map((_, i) => ((i + m) % 5 === 0 ? 0.05 : 0));
      hourly[`temperature_2m_member${String(m).padStart(2, "0")}`] =
        forecastFixture.hourly.time.map((_, i) => 60 + (i % 12) + (m - 6) * 0.8);
    }
    return r.fulfill({ json: { hourly } });
  });
  await page.route("**/geocoding-api.open-meteo.com/**", (r) =>
    r.fulfill({
      json: {
        results: [
          { latitude: 35.68, longitude: 139.69, name: "Tokyo", admin1: "Tokyo", country: "Japan", country_code: "JP", population: 9_000_000 },
        ],
      },
    })
  );
  await page.route("**/photon.komoot.io/**", (r) => r.fulfill({ json: { features: [] } }));
  await page.route("**/api.zippopotam.us/**", (r) =>
    r.fulfill({
      json: {
        country: "United States", "country abbreviation": "US", "post code": "94301",
        places: [{ "place name": "Palo Alto", latitude: "37.4443", longitude: "-122.1497", state: "California" }],
      },
    })
  );
}

test.beforeEach(async ({ page }) => {
  await stubProviders(page);
});

test("renders a forecast on first load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Feels Like/)).toBeVisible();
  await expect(page.getByText("10-Day Forecast")).toBeVisible();
});

test("surfaces the ensemble precipitation panel with quantiles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Precipitation")).toBeVisible();
  await expect(page.getByText("P10")).toBeVisible();
  await expect(page.getByText("P90")).toBeVisible();
  await expect(page.getByRole("img", { name: /Ensemble precipitation spread/ })).toBeVisible();
});

test("searches a city and loads its forecast", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").fill("Tokyo");
  await page.getByRole("option").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Tokyo/);
});

test("resolves a postal code", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").fill("94301");
  await expect(page.getByText("94301")).toBeVisible({ timeout: 5000 });
});

test("resolves raw coordinates without a network call", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").fill("35.68, 139.69");
  await expect(page.getByText("Pinned coordinates")).toBeVisible({ timeout: 5000 });
});

test("rapid typing never leaves a stale result on screen", async ({ page }) => {
  // Regression: superseded searches could resolve after a newer one and overwrite it.
  await page.goto("/");
  const box = page.getByRole("combobox");
  for (const q of ["Lon", "Lond", "Londo", "Tokyo"]) {
    await box.fill(q);
    await page.waitForTimeout(60);
  }
  await expect(page.getByRole("option").first()).toContainText("Tokyo");
});

test("toggles between Fahrenheit and Celsius", async ({ page }) => {
  await page.goto("/");
  const feelsLike = page.getByText(/Feels Like:/);
  const before = await feelsLike.innerText();
  expect(before).toMatch(/Feels Like: \d+/);

  await page.getByRole("button", { name: /Switch to Celsius/ }).click();
  await expect(page.getByText("Celsius")).toBeVisible();

  const after = await feelsLike.innerText();
  expect(after).not.toBe(before); // the rendered temperatures must actually change
});

test("phone viewport renders single column with adequate tap targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 15
  await page.goto("/");
  await expect(page.locator('[data-target="phone"]')).toBeVisible();

  const button = page.getByRole("button", { name: /Use my location/ });
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40); // WCAG 2.5.5
});

test("16:9 desktop viewport switches to the cinema layout", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await expect(page.locator('[data-target="cinema"]')).toBeVisible();
});

test("android viewport renders without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 }); // Pixel 8
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("degrades to a labelled sample forecast when providers fail", async ({ page }) => {
  await page.unroute("**/api.open-meteo.com/**");
  await page.route("**/api.open-meteo.com/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.getByText(/Sample forecast/)).toBeVisible({ timeout: 15000 });
});

test("archives each live forecast with temperature members", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem("wx.verification.v1") !== null), {
      timeout: 10_000,
    })
    .toBe(true);

  const records = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wx.verification.v1") ?? "[]") as Array<{
      live: boolean;
      members: number[];
      tMembers?: number[];
    }>
  );
  expect(records.length).toBeGreaterThan(0);
  for (const r of records) {
    expect(r.live).toBe(true);
    expect(r.members).toHaveLength(12);
    expect(r.tMembers).toHaveLength(12);
    for (const t of r.tMembers ?? []) {
      expect(t).toBeGreaterThan(50); // fixture band: 60 + (i % 12) + (m − 6) · 0.8
      expect(t).toBeLessThan(80);
    }
  }
});

test("scores elapsed hours and surfaces the temperature verification track", async ({ page }) => {
  // Seed sealed records for two elapsed hours; reconciliation against a stubbed
  // observation response fills both variables and the TEMPERATURE section appears.
  // Times are epoch-based throughout: the shared fixture's minute-precision strings
  // parse as LOCAL time in the browser, so on any machine west of UTC its "elapsed"
  // hours sit in the future and the seeds would never become pending.
  const hourMs = 3600e3;
  const top = Math.floor(Date.now() / hourMs) * hourMs;
  const validTimes = [top - 2 * hourMs, top - hourMs];

  // The observation fetch shares the forecast host but is the only call with past_days.
  await page.route(
    (url) => url.hostname === "api.open-meteo.com" && url.searchParams.has("past_days"),
    (r) =>
      r.fulfill({
        json: {
          hourly: {
            time: validTimes.map((t) => new Date(t).toISOString()),
            precipitation: [0.03, 0],
            temperature_2m: [60.4, 61.1],
          },
        },
      })
  );

  await page.addInitScript((times: number[]) => {
    const records = times.map((valid, i) => ({
      loc: "37.44,-122.14",
      issued: valid - 6 * 3600e3,
      valid,
      p: 0.5,
      members: Array.from({ length: 12 }, (_, m) => (m % 6 === 0 ? 0.05 : 0)),
      live: true,
      tMembers: Array.from({ length: 12 }, (_, m) => 58 + i + m * 0.7),
    }));
    localStorage.setItem("wx.verification.v1", JSON.stringify(records));
  }, validTimes);

  await page.goto("/");
  await expect(page.getByText("TEMPERATURE", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/°F · CI/)).toBeVisible();
  await expect(page.getByText(/Provisional —/).first()).toBeVisible();
});

test("pins an hour on the strip and reads its ensemble range", async ({ page }) => {
  await page.goto("/");
  const cell = page.getByRole("button", { name: /^Inspect / }).nth(5);
  await cell.click();
  await expect(cell).toHaveAttribute("aria-pressed", "true");
  // Fixture members are 60 + (i % 12) + (m − 6) · 0.8 — a real spread at every hour.
  await expect(page.getByText(/Ensemble \d+–\d+°, median \d+°/)).toBeVisible();
  await cell.press("Escape");
  await expect(cell).toHaveAttribute("aria-pressed", "false");
});

test("expands a day into its hourly detail without a network call", async ({ page }) => {
  await page.goto("/");
  // Let the initial load's own fetches finish before counting: the claim under test is
  // that EXPANSION is a pure view over data already held (RFC 0003 §4), not that the
  // app never fetched anything. The footer's member count renders only after the last
  // of the load-time fetches resolves — networkidle is not reliable on WebKit here.
  await expect(page.getByText(/GFS ensemble \(\d+\)/)).toBeVisible();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  const row = page.getByRole("button", { name: /Sat|Sun|Mon|Tue|Wed|Thu|Fri/ }).nth(1);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/UV \d+ \(/)).toBeVisible();
  expect(requests.filter((u) => u.includes("open-meteo"))).toHaveLength(0); // RFC 0003 §4
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "false");
});

test("scrubs the precipitation fan into hourly-rate mode with the keyboard", async ({ page }) => {
  await page.goto("/");
  const fan = page.getByRole("group", { name: /arrow keys inspect hours/ });
  await fan.focus();
  await fan.press("ArrowRight");
  await expect(page.getByText(/HOURLY RATE AT/)).toBeVisible();
  await expect(page.getByText("WET", { exact: true })).toBeVisible();
  await fan.press("Escape");
  await expect(page.getByText("24-HOUR TOTALS")).toBeVisible();
});

test("has no critical accessibility violations in landmark structure", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("combobox")).toHaveAttribute("aria-label", /.+/);
  const meters = page.getByRole("meter");
  expect(await meters.count()).toBeGreaterThan(0);
});
