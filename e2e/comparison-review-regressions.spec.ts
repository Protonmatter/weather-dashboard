import { expect, test, type Page } from "@playwright/test";

const FIXTURE_NOW_SECONDS = Date.UTC(2026, 7, 13, 7, 0, 0) / 1000;

interface ProviderState {
  failComparison: boolean;
  comparisonDelayMs?: number;
}

function timezoneForLongitude(longitude: number): string {
  if (longitude > 100) return "Asia/Tokyo";
  if (longitude > -20) return "Europe/London";
  if (longitude > -100) return "America/New_York";
  return "America/Los_Angeles";
}

function forecastFixture(timezone: string): Record<string, unknown> {
  return {
    timezone,
    current: {
      time: FIXTURE_NOW_SECONDS,
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
      time: Array.from(
        { length: 48 },
        (_, index) => FIXTURE_NOW_SECONDS + (index - 2) * 3600
      ),
      temperature_2m: Array.from(
        { length: 48 },
        (_, index) => 60 + (index % 12)
      ),
      weather_code: Array.from({ length: 48 }, () => 1),
      precipitation_probability: Array.from({ length: 48 }, () => 10),
      precipitation: Array.from({ length: 48 }, () => 0),
      is_day: Array.from({ length: 48 }, (_, index) =>
        index % 24 < 12 ? 1 : 0
      ),
      visibility: Array.from({ length: 48 }, () => 16_000),
    },
    minutely_15: {
      time: Array.from(
        { length: 105 },
        (_, index) => FIXTURE_NOW_SECONDS - (104 - index) * 900
      ),
      rain: Array.from({ length: 105 }, () => 0),
      showers: Array.from({ length: 105 }, () => 0),
    },
    daily: {
      time: Array.from(
        { length: 10 },
        (_, index) =>
          FIXTURE_NOW_SECONDS -
          (FIXTURE_NOW_SECONDS % 86_400) +
          index * 86_400
      ),
      weather_code: Array.from({ length: 10 }, () => 1),
      temperature_2m_max: Array.from(
        { length: 10 },
        (_, index) => 72 + index
      ),
      temperature_2m_min: Array.from(
        { length: 10 },
        (_, index) => 54 + index
      ),
      sunrise: Array.from(
        { length: 10 },
        (_, index) =>
          FIXTURE_NOW_SECONDS -
          (FIXTURE_NOW_SECONDS % 86_400) +
          index * 86_400 +
          14 * 3600
      ),
      sunset: Array.from(
        { length: 10 },
        (_, index) =>
          FIXTURE_NOW_SECONDS -
          (FIXTURE_NOW_SECONDS % 86_400) +
          (index + 1) * 86_400 +
          2 * 3600
      ),
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
      time: FIXTURE_NOW_SECONDS,
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
      time: Array.from(
        { length: 6 },
        (_, index) => FIXTURE_NOW_SECONDS + index * 3600
      ),
      temperature_2m: [67, 68, 69, 68, 66, 64],
      weather_code: [1, 1, 2, 2, 3, 3],
      precipitation_probability: [0, 0, 10, 20, 30, 20],
      precipitation: [0, 0, 0, 0.01, 0.02, 0],
      is_day: [1, 1, 1, 1, 1, 0],
    },
    minutely_15_units: {
      time: "unixtime",
      rain: "inch",
      showers: "inch",
    },
    minutely_15: {
      time: Array.from(
        { length: 105 },
        (_, index) => FIXTURE_NOW_SECONDS - (104 - index) * 900
      ),
      rain: Array.from({ length: 105 }, (_, index) =>
        index >= 101 ? 0.01 : 0
      ),
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
      time: Array.from(
        { length: 3 },
        (_, index) =>
          FIXTURE_NOW_SECONDS -
          (FIXTURE_NOW_SECONDS % 86_400) +
          index * 86_400
      ),
      weather_code: [1, 2, 3],
      temperature_2m_max: [72, 73, 74],
      temperature_2m_min: [54, 55, 56],
      uv_index_max: [3, 4, 5],
    },
  };
}

function ensembleFixture(): { hourly: Record<string, unknown> } {
  const times = Array.from(
    { length: 48 },
    (_, index) => FIXTURE_NOW_SECONDS + (index - 2) * 3600
  );
  const hourly: Record<string, unknown> = { time: times };
  for (let member = 0; member < 12; member += 1) {
    hourly[`precipitation_member${member}`] = times.map(() => member / 100);
    hourly[`temperature_2m_member${member}`] = times.map(
      (_, hour) => 60 + (hour % 12) + member / 10
    );
  }
  return { hourly };
}

async function stubProviders(
  page: Page,
  state: ProviderState
): Promise<void> {
  await page.route("**/api.open-meteo.com/**", async (route) => {
    const url = new URL(route.request().url());
    const comparison = url.searchParams.get("forecast_hours") === "6";

    if (comparison && state.failComparison) {
      await route.abort("failed");
      return;
    }
    if (comparison && state.comparisonDelayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, state.comparisonDelayMs)
      );
    }

    const timezone = timezoneForLongitude(
      Number(url.searchParams.get("longitude"))
    );
    await route.fulfill({
      json: comparison
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
}

async function dismissOnboarding(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText(/Live data from Open-Meteo/)).toBeVisible();
}

async function openComparison(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Compare saved locations" }).click();
  await expect(page.getByTestId("comparison-card")).toHaveCount(3);
  await expect(
    page.locator('[data-testid="comparison-card"][data-status="ready"]')
  ).toHaveCount(3);
}

test("comparison cards preserve condition, rainfall, and update provenance", async ({
  page,
}) => {
  const state: ProviderState = { failComparison: false };
  await stubProviders(page, state);
  await dismissOnboarding(page);
  await openComparison(page);

  const paloAlto = page
    .getByTestId("comparison-card")
    .filter({ hasText: "Palo Alto" });

  await expect(
    paloAlto.locator(".text-right.text-sm > p").first()
  ).toHaveText("Mostly Clear");
  await expect(paloAlto.getByText("Feels 63°", { exact: true })).toBeVisible();
  await expect(paloAlto.getByTestId("comparison-hour").first()).toContainText(
    "Mostly Clear"
  );
  await expect(paloAlto.getByText("Rain today", { exact: true })).toBeVisible();
  await expect(paloAlto.getByText("Modeled", { exact: true })).toBeVisible();
  await expect(paloAlto.getByText(/^Open-Meteo · Updated /)).toBeVisible();
});

test("comparison local clocks retain timezone context and continue updating", async ({
  page,
}) => {
  await page.clock.install({
    time: new Date("2026-08-13T07:00:45.000Z"),
  });

  const state: ProviderState = { failComparison: false };
  await stubProviders(page, state);
  await dismissOnboarding(page);
  await openComparison(page);

  const localTime = page
    .getByTestId("comparison-card")
    .filter({ hasText: "Palo Alto" })
    .locator("time")
    .first();

  await expect(localTime).toHaveText(/^12:00 AM \S+$/);
  await page.clock.fastForward(30_000);
  await expect(localTime).toHaveText(/^12:01 AM \S+$/);
});

test("cached comparison cards expose successful revalidation as refreshing", async ({
  page,
}) => {
  const state: ProviderState = { failComparison: false };
  await stubProviders(page, state);
  await dismissOnboarding(page);

  const compare = page.getByRole("button", {
    name: "Compare saved locations",
  });
  await openComparison(page);

  state.comparisonDelayMs = 1_000;
  await compare.click();
  await expect(page.getByTestId("forecast-summary")).toBeVisible();
  await compare.click();

  const paloAlto = page
    .getByTestId("comparison-card")
    .filter({ hasText: "Palo Alto" });
  await expect(paloAlto).toHaveAttribute("data-status", "refreshing");
  await expect(paloAlto.getByRole("status")).toHaveText(
    "Refreshing cached summary…"
  );
  await expect(paloAlto).toHaveAttribute("data-status", "ready", {
    timeout: 5_000,
  });
});

test("cached comparison cards expose failed revalidation as stale", async ({
  page,
}) => {
  const state: ProviderState = { failComparison: false };
  await stubProviders(page, state);
  await dismissOnboarding(page);

  const compare = page.getByRole("button", {
    name: "Compare saved locations",
  });
  await openComparison(page);

  state.failComparison = true;
  await compare.click();
  await expect(page.getByTestId("forecast-summary")).toBeVisible();
  await compare.click();

  const paloAlto = page
    .getByTestId("comparison-card")
    .filter({ hasText: "Palo Alto" });

  await expect(paloAlto).toHaveAttribute("data-status", "stale");
  await expect(paloAlto.getByRole("status")).toHaveText(
    "Comparison data is unavailable. Try again."
  );
  await expect(paloAlto.getByText(/^Open-Meteo · Updated /)).toBeVisible();
  await expect(
    paloAlto.getByRole("button", {
      name: "Retry Palo Alto comparison",
    })
  ).toBeVisible();
});
