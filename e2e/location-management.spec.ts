import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const fixtureNow = Math.floor(Date.now() / 3600e3) * 3600;

function forecastFixture(timezone: string): Record<string, unknown> {
  return {
    timezone,
    current: {
      time: fixtureNow,
      interval: 900,
      temperature_2m: 67,
      apparent_temperature: 63,
      relative_humidity_2m: 84,
      weather_code: 1,
      is_day: 1,
      wind_speed_10m: 6,
      surface_pressure: 1013,
      precipitation: 0,
      rain: 0,
      showers: 0,
      snowfall: 0,
      cloud_cover: 10,
    },
    hourly: {
      time: Array.from({ length: 48 }, (_, index) => fixtureNow + (index - 2) * 3600),
      temperature_2m: Array.from({ length: 48 }, (_, index) => 60 + (index % 12)),
      weather_code: Array.from({ length: 48 }, () => 1),
      precipitation_probability: Array.from({ length: 48 }, () => 10),
      precipitation: Array.from({ length: 48 }, () => 0),
      is_day: Array.from({ length: 48 }, (_, index) => index % 24 < 12 ? 1 : 0),
      visibility: Array.from({ length: 48 }, () => 16_000),
    },
    minutely_15: {
      time: Array.from({ length: 105 }, (_, index) => fixtureNow - (104 - index) * 900),
      rain: Array.from({ length: 105 }, () => 0),
      showers: Array.from({ length: 105 }, () => 0),
    },
    daily: {
      time: Array.from({ length: 10 }, (_, index) => fixtureNow - (fixtureNow % 86_400) + index * 86_400),
      weather_code: Array.from({ length: 10 }, () => 1),
      temperature_2m_max: Array.from({ length: 10 }, (_, index) => 72 + index),
      temperature_2m_min: Array.from({ length: 10 }, (_, index) => 54 + index),
      sunrise: Array.from({ length: 10 }, (_, index) => fixtureNow - (fixtureNow % 86_400) + index * 86_400 + 14 * 3600),
      sunset: Array.from({ length: 10 }, (_, index) => fixtureNow - (fixtureNow % 86_400) + (index + 1) * 86_400 + 2 * 3600),
      uv_index_max: Array.from({ length: 10 }, () => 3),
    },
  };
}

function comparisonFixture(timezone: string): Record<string, unknown> {
  return {
    timezone,
    current_units: {
      time: "unixtime",
      temperature_2m: "°F",
      apparent_temperature: "°F",
      relative_humidity_2m: "%",
      weather_code: "wmo code",
      is_day: "",
    },
    current: {
      time: fixtureNow,
      temperature_2m: 67,
      apparent_temperature: 63,
      relative_humidity_2m: 84,
      weather_code: 1,
      is_day: 1,
    },
    hourly_units: {
      time: "unixtime",
      temperature_2m: "°F",
      weather_code: "wmo code",
      precipitation_probability: "%",
      precipitation: "inch",
      is_day: "",
    },
    hourly: {
      time: Array.from({ length: 6 }, (_, index) => fixtureNow + index * 3600),
      temperature_2m: [67, 68, 69, 68, 66, 64],
      weather_code: [1, 1, 2, 2, 3, 3],
      precipitation_probability: [0, 0, 10, 20, 30, 20],
      precipitation: [0, 0, 0, 0.01, 0.02, 0],
      is_day: [1, 1, 1, 1, 1, 0],
    },
    minutely_15_units: { time: "unixtime", rain: "inch", showers: "inch" },
    minutely_15: {
      time: Array.from({ length: 105 }, (_, index) => fixtureNow - (104 - index) * 900),
      rain: Array.from({ length: 105 }, (_, index) => index >= 101 ? 0.01 : 0),
      showers: Array.from({ length: 105 }, () => 0),
    },
    daily_units: {
      time: "unixtime",
      weather_code: "wmo code",
      temperature_2m_max: "°F",
      temperature_2m_min: "°F",
      uv_index_max: "",
    },
    daily: {
      time: Array.from({ length: 3 }, (_, index) => fixtureNow - (fixtureNow % 86_400) + index * 86_400),
      weather_code: [1, 2, 3],
      temperature_2m_max: [72, 73, 74],
      temperature_2m_min: [54, 55, 56],
      uv_index_max: [3, 4, 5],
    },
  };
}

function ensembleFixture(): { hourly: Record<string, unknown> } {
  const times = Array.from({ length: 48 }, (_, index) => fixtureNow + (index - 2) * 3600);
  const hourly: Record<string, unknown> = { time: times };
  for (let member = 0; member < 12; member += 1) {
    hourly[`precipitation_member${member}`] = times.map(() => member / 100);
    hourly[`temperature_2m_member${member}`] = times.map((_, hour) => 60 + hour % 12 + member / 10);
  }
  return { hourly };
}

async function stubProviders(page: Page): Promise<void> {
  await page.route("**/api.open-meteo.com/**", (route) => {
    const url = new URL(route.request().url());
    const lon = Number(url.searchParams.get("longitude"));
    const timezone = lon > -100 ? "America/New_York" : "America/Los_Angeles";
    return route.fulfill({
      json: url.searchParams.get("forecast_hours") === "6"
        ? comparisonFixture(timezone)
        : forecastFixture(timezone),
    });
  });
  await page.route("**/air-quality-api.open-meteo.com/**", (route) =>
    route.fulfill({ json: { current: { us_aqi: 28 } } })
  );
  await page.route("**/ensemble-api.open-meteo.com/**", (route) =>
    route.fulfill({ json: ensembleFixture() })
  );
  await page.route("**/api.bigdatacloud.net/**", (route) =>
    {
      const url = new URL(route.request().url());
      const tokyo = Number(url.searchParams.get("longitude")) > 139;
      return route.fulfill({
        json: tokyo
          ? {
              city: "Tokyo",
              principalSubdivision: "Tokyo",
              countryName: "Japan",
              countryCode: "JP",
            }
          : {
              city: "New York",
              principalSubdivision: "New York",
              countryName: "United States",
              countryCode: "US",
            },
      });
    }
  );
}

async function grantTokyo(context: BrowserContext): Promise<void> {
  await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
  await context.setGeolocation({ latitude: 35.68, longitude: 139.69 });
}

async function dismissOnboarding(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText(/Live data from Open-Meteo/)).toBeVisible();
}

function installLocationFailure(page: Page, code: number): Promise<void> {
  return page.addInitScript((failureCode) => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_resolve: PositionCallback, reject: PositionErrorCallback) => {
          reject({ code: failureCode } as GeolocationPositionError);
        },
      },
    });
  }, code);
}

test.beforeEach(async ({ page }) => {
  await stubProviders(page);
});

test("first visit waits for explicit consent and remembers Not now", async ({ page }) => {
  let reverseRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("reverse-geocode-client")) reverseRequests += 1;
  });

  await page.goto("/");

  await expect(page.getByRole("dialog", { name: "Use your local weather" })).toBeVisible();
  expect(reverseRequests).toBe(0);
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Live data from Open-Meteo/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Escape dismisses onboarding and restores focus to search", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Use your local weather" });
  await expect(dialog.getByRole("button", { name: "Use my location", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toBeFocused();
});

test("Use my location loads the browser position without silently saving it", async ({ context, page }) => {
  await grantTokyo(context);
  let reverseRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("reverse-geocode-client")) reverseRequests += 1;
  });
  await page.goto("/");

  await page.getByRole("dialog").getByRole("button", { name: "Use my location", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tokyo");
  expect(reverseRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("wx.saved-locations.v1");
    if (!raw) return false;
    const document = JSON.parse(raw) as { locations?: Array<{ lat?: number; lon?: number }> };
    return (document.locations ?? []).some((place) =>
      place.lat?.toFixed(4) === "35.6800" && place.lon?.toFixed(4) === "139.6900"
    );
  })).toBe(false);
});

for (const failure of [
  { code: 1, copy: "Location access is off" },
  { code: 2, copy: "Your location is unavailable" },
  { code: 3, copy: "Location timed out" },
]) {
  test(`location failure ${failure.code} closes onboarding and preserves a live fallback`, async ({ page }) => {
    await installLocationFailure(page, failure.code);
    await page.goto("/");

    await page.getByRole("dialog").getByRole("button", { name: "Use my location", exact: true }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(failure.copy);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Palo Alto");
    await expect(page.getByText(/Live data from Open-Meteo/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("unsupported geolocation keeps search and the live fallback usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  });
  await page.goto("/");

  await page.getByRole("dialog").getByRole("button", { name: "Use my location", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("does not support automatic location");
  await expect(page.getByRole("combobox")).toBeEnabled();
  await expect(page.getByText(/Live data from Open-Meteo/)).toBeVisible();
});

test("toolbar location control remains a deliberate retry after denial", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (resolve: PositionCallback, reject: PositionErrorCallback) => {
          calls += 1;
          if (calls === 1) {
            reject({ code: 1 } as GeolocationPositionError);
            return;
          }
          resolve({
            coords: { latitude: 40.7128, longitude: -74.006 },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("dialog").getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Location access is off");

  await page.getByRole("button", { name: "Use my location" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("New York");
});

test("seeds removable examples and marks a quick switch active only after success", async ({ page }) => {
  await dismissOnboarding(page);

  await expect(page.getByRole("button", { name: "Open Palo Alto forecast" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Open New York forecast" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open London forecast" })).toBeVisible();

  await page.getByRole("button", { name: "Open New York forecast" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("New York");
  await expect(page.getByRole("button", { name: "Open New York forecast" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Open Palo Alto forecast" })).not.toHaveAttribute("aria-current", "true");
});

test("keeps the current dashboard visible while a saved location is pending", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api.open-meteo.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (Number(url.searchParams.get("latitude")) === 40.7128) {
      await gate;
    }
    await route.fallback();
  });
  await dismissOnboarding(page);

  await page.getByRole("button", { name: "Open New York forecast" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Palo Alto");
  await expect(page.getByRole("button", { name: "Open New York forecast" })).toHaveAttribute("aria-busy", "true");
  release();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("New York");
});

test("retains the prior active card when a saved-location forecast fails", async ({ page }) => {
  await page.route("**/api.open-meteo.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (Number(url.searchParams.get("latitude")) === 51.5072) {
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
  await dismissOnboarding(page);

  await page.getByRole("button", { name: "Open London forecast" }).click();

  await expect(page.getByRole("status")).toContainText("Couldn't reach the forecast service");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Palo Alto");
  await expect(page.getByRole("button", { name: "Open Palo Alto forecast" })).toHaveAttribute("aria-current", "true");
});

test("device location is saved only after Save current location", async ({ context, page }) => {
  await context.grantPermissions(["geolocation"], { origin: "http://localhost:4173" });
  await context.setGeolocation({ latitude: 35.68, longitude: 139.69 });
  await page.goto("/");
  await page.getByRole("dialog").getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tokyo");
  await expect(page.getByRole("button", { name: "Open Tokyo forecast" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save current location" }).click();

  await expect(page.getByRole("button", { name: "Open Tokyo forecast" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Open Tokyo forecast" })).toBeVisible();
});

test("removing a starter location persists and a valid empty list stays empty", async ({ page }) => {
  await dismissOnboarding(page);

  await page.getByRole("button", { name: "Remove London from saved locations" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Open London forecast" })).toHaveCount(0);

  await page.evaluate(() => {
    localStorage.setItem("wx.saved-locations.v1", JSON.stringify({ version: 1, locations: [] }));
  });
  await page.reload();
  await expect(page.getByTestId("saved-location-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save current location" })).toBeEnabled();
});

test("a full six-place list reports the limit without dropping data", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("wx.location-onboarding.v1", JSON.stringify({ version: 1, complete: true }));
    localStorage.setItem("wx.saved-locations.v1", JSON.stringify({
      version: 1,
      locations: Array.from({ length: 6 }, (_, index) => ({
        lat: index + 1,
        lon: index + 1,
        name: `Saved ${index + 1}`,
        admin: "",
        country: "Test Country",
        cc: "tc",
      })),
    }));
  });
  await page.goto("/");
  await expect(page.getByText(/Live data from Open-Meteo/)).toBeVisible();

  await page.getByRole("button", { name: "Save current location" }).click();

  await expect(page.getByRole("status")).toContainText("Remove a saved location before adding another");
  await expect(page.getByTestId("saved-location-card")).toHaveCount(6);
});

test("phone quick-switch strip scrolls without overflowing the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dismissOnboarding(page);

  const strip = page.getByTestId("saved-locations-strip");
  await expect(strip).toBeVisible();
  expect(await strip.evaluate((element) => element.scrollWidth >= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Compare shows complete curated summaries and follows the global temperature unit", async ({ page }) => {
  await dismissOnboarding(page);

  const compareButton = page.getByRole("button", { name: "Compare saved locations" });
  await expect(page.getByText("Compare is best on tablet or desktop")).toBeVisible();
  await compareButton.click();

  await expect(compareButton).toHaveAttribute("aria-pressed", "true");
  const cards = page.getByTestId("comparison-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByText("Local time", { exact: true })).toBeVisible();
  await expect(cards.first().getByText("Humidity", { exact: true })).toBeVisible();
  await expect(cards.first().getByText("UV", { exact: true })).toBeVisible();
  await expect(cards.first().getByText("Rain today", { exact: true })).toBeVisible();
  await expect(cards.first().getByTestId("comparison-hour")).toHaveCount(6);
  await expect(cards.first().getByTestId("comparison-day")).toHaveCount(3);
  await expect(cards.first().getByTestId("comparison-hour").nth(3)).toContainText("0.01 in");
  await expect(cards.first().getByTestId("comparison-hour").nth(3)).toHaveAttribute("aria-label", /Partly Cloudy.*20%/);
  await expect(cards.first().getByTestId("comparison-day").nth(2)).toContainText("Overcast");
  await expect(cards.first().getByTestId("comparison-temperature")).toContainText("67°");

  await page.getByRole("button", { name: "Switch to Celsius" }).click();
  await expect(cards.first().getByTestId("comparison-temperature")).toContainText("19°");
});

test("comparison uses only bounded point-summary requests with two active at once", async ({ page }) => {
  let active = 0;
  let maximum = 0;
  const requested: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api.open-meteo.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("forecast_hours") !== "6") {
      await route.fallback();
      return;
    }
    requested.push(url.toString());
    active += 1;
    maximum = Math.max(maximum, active);
    await gate;
    active -= 1;
    const timezone = Number(url.searchParams.get("longitude")) > -100
      ? "America/New_York"
      : "America/Los_Angeles";
    await route.fulfill({ json: comparisonFixture(timezone) });
  });
  await dismissOnboarding(page);

  await page.getByRole("button", { name: "Compare saved locations" }).click();

  await expect.poll(() => maximum).toBe(2);
  expect(requested).toHaveLength(2);
  release();
  await expect(page.getByTestId("comparison-card")).toHaveCount(3);
  await expect.poll(() => requested.length).toBe(3);
  expect(requested.every((raw) => {
    const url = new URL(raw);
    return url.hostname === "api.open-meteo.com"
      && url.searchParams.get("forecast_hours") === "6"
      && !url.searchParams.has("models")
      && !url.searchParams.has("us_aqi");
  })).toBe(true);
});

test("a comparison failure stays local and Retry recovers that card", async ({ page }) => {
  let failLondon = true;
  await page.route("**/api.open-meteo.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("forecast_hours") === "6"
      && Number(url.searchParams.get("latitude")) === 51.5072
      && failLondon) {
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "Compare saved locations" }).click();

  const london = page.getByTestId("comparison-card").filter({ hasText: "London" });
  await expect(london).toContainText("Comparison data is unavailable");
  await expect(page.getByTestId("comparison-card").filter({ hasText: "Palo Alto" })).toContainText("Humidity");

  failLondon = false;
  await london.getByRole("button", { name: "Retry London comparison" }).click();
  await expect(london).toContainText("Local time");
});

test("reopening Compare renders cached cards while revalidating", async ({ page }) => {
  let summaryRequests = 0;
  await page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "api.open-meteo.com" && url.searchParams.get("forecast_hours") === "6") {
      summaryRequests += 1;
    }
  });
  await dismissOnboarding(page);
  const button = page.getByRole("button", { name: "Compare saved locations" });
  await button.click();
  await expect(page.getByTestId("comparison-card")).toHaveCount(3);
  await expect.poll(() => summaryRequests).toBe(3);
  await button.click();
  await expect(page.getByTestId("forecast-summary")).toBeVisible();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api.open-meteo.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("forecast_hours") === "6") await gate;
    await route.fallback();
  });
  await button.click();

  await expect(page.getByTestId("comparison-card")).toHaveCount(3);
  await expect(page.getByTestId("comparison-card").first()).toHaveAttribute("data-status", "refreshing");
  release();
  await expect.poll(() => summaryRequests).toBe(6);
});

test("Open full forecast exits comparison and loads the selected dashboard", async ({ page }) => {
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "Compare saved locations" }).click();
  await expect(page.getByTestId("comparison-card")).toHaveCount(3);

  await page.getByRole("button", { name: "Open New York full forecast" }).click();

  await expect(page.getByTestId("comparison-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("New York");
  await expect(page.getByRole("button", { name: "Compare saved locations" })).toHaveAttribute("aria-pressed", "false");
});

test("comparison grid adapts from phone to tablet and desktop without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "Compare saved locations" }).click();
  const grid = page.getByTestId("comparison-grid");
  await expect(page.getByTestId("comparison-card")).toHaveCount(3);
  const columns = () => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(await columns()).toBe(1);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect.poll(columns).toBe(2);
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect.poll(columns).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a lazy comparison chunk failure offers a focus-restoring exit", async ({ page }) => {
  await page.route("**/assets/ComparisonView-*.js", (route) => route.abort("failed"));
  await dismissOnboarding(page);

  await page.getByRole("button", { name: "Compare saved locations" }).click();
  const exit = page.getByRole("button", { name: "Return to full dashboard" });
  await expect(exit).toBeVisible();
  await exit.click();

  await expect(page.getByTestId("forecast-summary")).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare saved locations" })).toBeFocused();
});
