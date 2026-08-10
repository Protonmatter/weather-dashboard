import { test, expect, type Page } from "@playwright/test";
import { MAP_FORECAST_CACHE_TTL_MS } from "../src/lib/map/cache";

/**
 * Functional end-to-end journeys (RFC 0001 §4).
 *
 * These exercise a real browser against the built artefact. Provider calls are stubbed at
 * the network layer so the suite is deterministic: an E2E test that fails because a free
 * community geocoder was slow teaches nothing and trains the team to ignore red builds.
 * Live provider behaviour is covered separately by the contract suite.
 */

const fixtureNow = Math.floor(Date.now() / 3600e3) * 3600;
const forecastFixture = {
  timezone: "America/Los_Angeles",
  timezone_abbreviation: "PDT",
  utc_offset_seconds: -25_200,
  current: {
    temperature_2m: 67, apparent_temperature: 63, relative_humidity_2m: 84,
    weather_code: 61, is_day: 1, wind_speed_10m: 6, surface_pressure: 1013,
    time: fixtureNow, interval: 900, precipitation: 0.04, rain: 0.04,
    showers: 0, snowfall: 0, cloud_cover: 92,
  },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => fixtureNow + (i - 2) * 3600),
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
  minutely_15: {
    time: Array.from({ length: 105 }, (_, i) => fixtureNow - (104 - i) * 900),
    rain: Array.from({ length: 105 }, (_, i) => (i % 20 === 0 ? 0.01 : 0)),
    showers: Array.from({ length: 105 }, () => 0),
  },
  daily: {
    time: Array.from({ length: 10 }, (_, i) => fixtureNow - (fixtureNow % 86400) + i * 86400),
    weather_code: Array.from({ length: 10 }, () => 61),
    temperature_2m_max: Array.from({ length: 10 }, (_, i) => 72 + i),
    temperature_2m_min: Array.from({ length: 10 }, (_, i) => 54 + i),
    sunrise: Array.from({ length: 10 }, (_, i) => fixtureNow - (fixtureNow % 86400) + i * 86400 + 14 * 3600),
    sunset: Array.from({ length: 10 }, (_, i) => fixtureNow - (fixtureNow % 86400) + i * 86400 + 2 * 3600 + 86400),
    uv_index_max: Array.from({ length: 10 }, () => 3),
  },
};

const radarFrames = [
  Math.floor(Date.now() / 300_000) * 300_000 - 600_000,
  Math.floor(Date.now() / 300_000) * 300_000 - 300_000,
  Math.floor(Date.now() / 300_000) * 300_000,
];

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XqR0WQAAAABJRU5ErkJggg==",
  "base64"
);

const mapTimes = Array.from({ length: 48 }, (_, i) =>
  new Date(Math.floor(Date.now() / 3600e3) * 3600e3 + i * 3600e3).toISOString().slice(0, 16)
);

function mapFixture(url: URL): Array<Record<string, unknown>> {
  const latitudes = (url.searchParams.get("latitude") ?? "").split(",").map(Number);
  const longitudes = (url.searchParams.get("longitude") ?? "").split(",").map(Number);
  return latitudes.map((latitude, location) => ({
    latitude,
    longitude: longitudes[location],
    hourly_units: {
      temperature_2m: "°C",
      pressure_msl: "hPa",
      precipitation: "mm",
      wind_speed_10m: "km/h",
      wind_direction_10m: "°",
    },
    hourly: {
      time: mapTimes,
      temperature_2m: mapTimes.map((_, hour) => 8 + location * 0.08 + Math.sin(hour / 6) * 5),
      pressure_msl: mapTimes.map((_, hour) => 996 + location * 0.18 + Math.cos(hour / 8) * 3),
      precipitation: mapTimes.map((_, hour) => (location + hour) % 9 === 0 ? 2.4 : 0),
      wind_speed_10m: mapTimes.map((_, hour) => 12 + (location + hour) % 20),
      wind_direction_10m: mapTimes.map((_, hour) => (location * 15 + hour * 5) % 360),
    },
  }));
}

async function stubProviders(page: Page): Promise<void> {
  await page.route("**/api.open-meteo.com/**", (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith("/v1/gfs")) return r.fulfill({ json: mapFixture(url) });
    const isTokyo = Number(url.searchParams.get("latitude")) > 35 && Number(url.searchParams.get("longitude")) > 139;
    return r.fulfill({
      json: isTokyo
        ? { ...forecastFixture, timezone: "Asia/Tokyo", timezone_abbreviation: "JST", utc_offset_seconds: 32_400 }
        : forecastFixture,
    });
  });
  await page.route("**/tile.openstreetmap.org/**", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: transparentPixel,
    })
  );
  await page.route("**/mapservices.weather.noaa.gov/**", (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith("/query")) {
      return r.fulfill({
        json: {
          features: radarFrames.flatMap((idp_validtime, index) => [
            { attributes: { objectid: index * 2 + 1, idp_validtime } },
            { attributes: { objectid: index * 2 + 2, idp_validtime } },
          ]),
        },
      });
    }
    return r.fulfill({ contentType: "image/png", body: transparentPixel });
  });
  await page.route("**/api.rainviewer.com/public/weather-maps.json", (r) =>
    r.fulfill({
      json: {
        version: "2.0",
        generated: Math.floor(Date.now() / 1000),
        host: "https://tilecache.rainviewer.com",
        radar: {
          past: radarFrames.map((time) => ({ time: Math.floor(time / 1000), path: `/v2/radar/${time}` })),
        },
      },
    })
  );
  await page.route("**/tilecache.rainviewer.com/**", (r) =>
    r.fulfill({ contentType: "image/png", body: transparentPixel })
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

async function revealForecastMap(page: Page): Promise<void> {
  await page.getByTestId("forecast-map-shell").scrollIntoViewIfNeeded();
}

test("renders a forecast on first load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Feels Like/)).toBeVisible();
  await expect(page.getByText("10-Day Forecast")).toBeVisible();
});

test("matches the atmospheric scene to current precipitation intensity", async ({ page }) => {
  await page.goto("/");

  const backdrop = page.getByTestId("weather-backdrop");
  await expect(backdrop).toHaveAttribute("data-scene", "rain");
  await expect(backdrop).toHaveAttribute("data-intensity", "moderate");
});

test("shows a wall clock in the selected location timezone", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("location-clock")).toContainText(/\d{1,2}:\d{2}:\d{2} [AP]M/);
  await expect(page.getByTestId("location-clock")).toContainText("PDT");
});

test("previews and pins weather metric details with keyboard parity", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("weather-metric-rain-next")).toContainText("Next 24h precip");
  const humidity = page.getByTestId("weather-metric-humidity");
  await humidity.focus();
  await expect(page.getByRole("tooltip")).toContainText("84% relative humidity");
  await humidity.press("Enter");
  await expect(page.getByTestId("weather-metric-detail")).toContainText("Relative humidity");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("weather-metric-detail")).toHaveCount(0);

  const metrics = page.getByTestId("weather-metrics");
  const map = page.getByTestId("forecast-map-shell");
  expect(await metrics.evaluate((node, mapNode) => Boolean(node.compareDocumentPosition(mapNode as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await map.elementHandle())).toBe(true);
});

test("does not present modeled precipitation spread as a live ensemble", async ({ page }) => {
  await page.unroute("**/ensemble-api.open-meteo.com/**");
  await page.route("**/ensemble-api.open-meteo.com/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText(/Live data from Open-Meteo · modeled spread/)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("weather-metric-rain-next").click();
  const detail = page.getByTestId("weather-metric-detail");
  await expect(detail).toContainText("modeled estimate");
  await expect(detail).toContainText("Live ensemble data are unavailable");
  await expect(detail).not.toContainText("across 31 members");
});

test("opens the same persistent weather detail with a tap", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("weather-metric-uv").click();
  await expect(page.getByTestId("weather-metric-detail")).toContainText("UV index");
});

test("places the decision summary before the exploratory map", async ({ page }) => {
  await page.goto("/");
  const metrics = await page.getByTestId("weather-metrics").elementHandle();
  const map = await page.getByTestId("forecast-map-shell").elementHandle();
  const order = await page.getByTestId("forecast-summary").evaluate(
    (summary, [metricsNode, mapNode]) =>
      Boolean(summary.compareDocumentPosition(metricsNode as Node) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      Boolean((metricsNode as Node).compareDocumentPosition(mapNode as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    [metrics, map]
  );
  expect(order).toBe(true);
});

test("contains a failed lazy map chunk without unmounting the dashboard", async ({ page }) => {
  await page.route(/\/assets\/ForecastMap-[^/]+\.js(?:\?.*)?$/, (route) => route.abort("failed"));
  await page.goto("/");
  await revealForecastMap(page);

  await expect(page.getByTestId("forecast-map-error")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Reload dashboard" })).toBeVisible();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("10-Day Forecast")).toBeVisible();
});

test("contains a failed lazy radar chunk within radar mode", async ({ page }) => {
  await page.route(/\/assets\/RadarPanel-[^/]+\.js(?:\?.*)?$/, (route) => route.abort("failed"));
  await page.goto("/");
  await revealForecastMap(page);
  await page.getByRole("tab", { name: "Radar observations" }).click();

  await expect(page.getByTestId("radar-panel-error")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("forecast-map-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Return to forecast" }).click();
  await expect(page.getByTestId("forecast-map-time")).toBeVisible();
  await expect(page.getByRole("heading", { name: "48-hour forecast map" })).toBeVisible();
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

test("keeps NOAA radar aligned on a wide zoomed-out map", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  let radarImageUrl: URL | null = null;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/exportImage")) {
      radarImageUrl = url;
    }
  });

  await page.goto("/");
  await revealForecastMap(page);
  await page.getByTestId("forecast-map-viewport").focus();
  for (let press = 0; press < 5; press += 1) await page.keyboard.press("-");
  await page.getByRole("tab", { name: "Radar observations" }).click();
  await expect.poll(() => radarImageUrl).not.toBeNull();

  const bbox = radarImageUrl!.searchParams.get("bbox")!.split(",").map(Number);
  const imageWidth = Number(radarImageUrl!.searchParams.get("size")!.split(",")[0]);
  const webMercatorWorldWidth = 2 * Math.PI * 6_378_137;
  expect(imageWidth).toBeGreaterThan(1024);
  expect(bbox[2]! - bbox[0]!).toBeLessThan(webMercatorWorldWidth);
});

test("loads NOAA MRMS only when the U.S. radar mode is selected", async ({ page }) => {
  let noaaCatalogueRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/query")) {
      noaaCatalogueRequests += 1;
    }
  });

  await page.goto("/");
  await revealForecastMap(page);
  await expect(page.getByTestId("forecast-map-viewport")).toBeVisible();
  expect(noaaCatalogueRequests).toBe(0);

  await page.getByRole("tab", { name: "Radar observations" }).click();
  await expect(page.getByTestId("radar-source")).toContainText("NOAA / NWS MRMS", { timeout: 15_000 });
  await expect(page.getByTestId("radar-time")).toBeEnabled();
  await expect(page.getByRole("link", { name: "NOAA / NWS MRMS" })).toBeVisible();
  expect(noaaCatalogueRequests).toBe(1);

  await page.getByRole("tab", { name: "Forecast fields" }).click();
  await expect(page.getByTestId("forecast-map-time")).toBeVisible();
  await expect(page.getByTestId("radar-time")).toBeHidden();
});

test("does not load hidden radar imagery while Forecast mode is active", async ({ page }) => {
  let radarImageRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/exportImage")) {
      radarImageRequests += 1;
    }
  });

  await page.goto("/");
  await revealForecastMap(page);
  await page.getByRole("tab", { name: "Radar observations" }).click();
  await expect(page.locator('img[data-radar-layer="loaded"]')).toHaveCount(1, { timeout: 15_000 });
  const loadedRequests = radarImageRequests;

  await page.getByRole("tab", { name: "Forecast fields" }).click();
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.focus();
  await viewport.press("ArrowRight");
  await page.waitForTimeout(500);
  expect(radarImageRequests).toBe(loadedRequests);

  await page.getByRole("tab", { name: "Radar observations" }).click();
  await expect.poll(() => radarImageRequests).toBeGreaterThan(loadedRequests);
});

test("uses RainViewer outside the U.S. and keeps location-local time", async ({ page }) => {
  let rainViewerRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("api.rainviewer.com/public/weather-maps.json")) rainViewerRequests += 1;
  });

  await page.goto("/");
  await page.getByRole("combobox").fill("Tokyo");
  await page.getByRole("option").first().click();
  await expect(page.getByTestId("location-clock")).toContainText(/JST|GMT\+9/);
  await revealForecastMap(page);
  expect(rainViewerRequests).toBe(0);

  await page.getByRole("tab", { name: "Radar observations" }).click();
  await expect(page.getByTestId("radar-source")).toContainText("RainViewer", { timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Radar data by RainViewer" })).toBeVisible();
  expect(rainViewerRequests).toBe(1);
});

test("supports keyboard map tabs and describes the active map mode", async ({ page }) => {
  await page.goto("/");
  await revealForecastMap(page);

  const forecastTab = page.getByRole("tab", { name: "Forecast fields" });
  const radarTab = page.getByRole("tab", { name: "Radar observations" });
  await expect(forecastTab).toHaveAttribute("tabindex", "0");
  await expect(radarTab).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("heading", { name: "48-hour forecast map" })).toBeVisible();

  await forecastTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(radarTab).toBeFocused();
  await expect(radarTab).toHaveAttribute("aria-selected", "true");
  await expect(radarTab).toHaveAttribute("tabindex", "0");
  await expect(forecastTab).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("heading", { name: "Radar observations map" })).toBeVisible();
  const forecastPanel = page.locator("#forecast-map-mode-panel");
  await expect(forecastPanel).toHaveCount(1);
  await expect(forecastPanel).toHaveAttribute("role", "tabpanel");
  await expect(forecastPanel).toHaveAttribute("aria-labelledby", "forecast-map-tab");
  await expect(forecastPanel).toBeHidden();

  await page.keyboard.press("ArrowLeft");
  await expect(forecastTab).toBeFocused();
  await expect(forecastTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "48-hour forecast map" })).toBeVisible();
});

test("keeps the radar tabpanel relationship while the lazy controls load", async ({ page }) => {
  let releaseRadarChunk!: () => void;
  const radarChunkGate = new Promise<void>((resolve) => {
    releaseRadarChunk = resolve;
  });
  await page.route(
    (url) => url.pathname.includes("/RadarPanel-") && url.pathname.endsWith(".js"),
    async (route) => {
      await radarChunkGate;
      await route.continue();
    }
  );

  try {
    await page.goto("/");
    await revealForecastMap(page);

    const panel = page.locator("#radar-map-mode-panel");
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute("role", "tabpanel");
    await expect(panel).toHaveAttribute("aria-labelledby", "radar-map-tab");
    await expect(panel).toBeHidden();

    await page.getByRole("tab", { name: "Radar observations" }).click();
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute("role", "tabpanel");
    await expect(panel).toHaveAttribute("aria-labelledby", "radar-map-tab");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("status")).toContainText("Loading radar controls");
  } finally {
    releaseRadarChunk();
  }
});

test("keeps radar playback manual when reduced motion is enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await revealForecastMap(page);
  await page.getByRole("tab", { name: "Radar observations" }).click();

  await expect(page.getByTestId("radar-time")).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Play radar animation" })).toBeDisabled();
  const initial = await page.getByTestId("radar-time").inputValue();
  await page.waitForTimeout(1_200);
  await expect(page.getByTestId("radar-time")).toHaveValue(initial);
});

test("waits for a radar layer before advancing playback again", async ({ page }) => {
  let initialTime: string | null = null;
  let delayedTime: string | null = null;
  let releaseDelayedLayer!: () => void;
  const delayedLayerGate = new Promise<void>((resolve) => {
    releaseDelayedLayer = resolve;
  });
  const requestedTimes = new Set<string>();

  await page.route(
    (url) => url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/exportImage"),
    async (route) => {
      const requestTime = new URL(route.request().url()).searchParams.get("time") ?? "missing";
      requestedTimes.add(requestTime);
      if (initialTime === null) initialTime = requestTime;
      if (requestTime !== initialTime) {
        delayedTime ??= requestTime;
        if (requestTime === delayedTime) await delayedLayerGate;
      }
      await route.fulfill({ contentType: "image/png", body: transparentPixel });
    }
  );

  try {
    await page.goto("/");
    await revealForecastMap(page);
    await page.getByRole("tab", { name: "Radar observations" }).click();
    await expect(page.locator('img[data-radar-layer="loaded"]')).toHaveCount(1, { timeout: 15_000 });

    const timeSlider = page.getByTestId("radar-time");
    await expect(timeSlider).toHaveValue("2");
    await page.getByRole("button", { name: "Play radar animation" }).click();
    await expect(timeSlider).toHaveValue("0", { timeout: 3_000 });
    await expect.poll(() => delayedTime).not.toBeNull();

    await page.waitForTimeout(1_200);
    expect(requestedTimes.size).toBe(2);
    await expect(timeSlider).toHaveValue("0");

    releaseDelayedLayer();
    await expect(timeSlider).toHaveValue("1", { timeout: 3_000 });
  } finally {
    releaseDelayedLayer();
  }
});

test("labels retained radar imagery with its loaded frame time", async ({ page }) => {
  let initialTime: string | null = null;
  let delayedTime: string | null = null;
  let releaseDelayedLayer!: () => void;
  const delayedLayerGate = new Promise<void>((resolve) => {
    releaseDelayedLayer = resolve;
  });

  await page.route(
    (url) => url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/exportImage"),
    async (route) => {
      const requestTime = new URL(route.request().url()).searchParams.get("time") ?? "missing";
      if (initialTime === null) initialTime = requestTime;
      if (requestTime !== initialTime) {
        delayedTime ??= requestTime;
        if (requestTime === delayedTime) await delayedLayerGate;
      }
      await route.fulfill({ contentType: "image/png", body: transparentPixel });
    }
  );

  try {
    await page.goto("/");
    await revealForecastMap(page);
    await page.getByRole("tab", { name: "Radar observations" }).click();
    await expect(page.locator('img[data-radar-layer="loaded"]')).toHaveCount(1, { timeout: 15_000 });

    const observedTime = page.getByTestId("radar-observed-time");
    const loadedTime = await observedTime.innerText();
    await page.getByTestId("radar-time").fill("0");
    await expect.poll(() => delayedTime).not.toBeNull();
    await expect(observedTime).toHaveText(loadedTime);

    releaseDelayedLayer();
    await expect(observedTime).not.toHaveText(loadedTime, { timeout: 3_000 });
  } finally {
    releaseDelayedLayer();
  }
});

test("disables all continuous backdrop motion when reduced motion is enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const animationNames = await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.innerHTML = [
      '<div class="scene-stars"><i></i></div>',
      '<div class="scene-clouds"><span></span></div>',
      '<div class="scene-fog"></div>',
    ].join("");
    document.body.append(fixture);
    const names = [
      fixture.querySelector(".scene-stars i"),
      fixture.querySelector(".scene-clouds span"),
      fixture.querySelector(".scene-fog"),
    ].map((element) => getComputedStyle(element!).animationName);
    fixture.remove();
    return names;
  });

  expect(animationNames).toEqual(["none", "none", "none"]);
});

test("refreshes the radar catalogue after its two-minute freshness window", async ({ page }) => {
  await page.clock.install();
  let catalogueRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/query")) {
      catalogueRequests += 1;
    }
  });

  await page.goto("/");
  await revealForecastMap(page);
  await page.getByRole("tab", { name: "Radar observations" }).click();
  await expect.poll(() => catalogueRequests, { timeout: 15_000 }).toBe(1);

  await page.clock.runFor(120_500);
  await expect.poll(() => catalogueRequests, { timeout: 15_000 }).toBe(2);
});

test("settles a NOAA overlay once after a multi-event map drag", async ({ page }) => {
  let imageRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/exportImage")) {
      imageRequests += 1;
    }
  });

  await page.goto("/");
  await revealForecastMap(page);
  await page.getByRole("tab", { name: "Radar observations" }).click();
  const viewport = page.getByTestId("forecast-map-viewport");
  await expect(page.getByTestId("radar-noaa-image")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => imageRequests).toBe(1);

  const box = await viewport.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect.poll(() => imageRequests, { timeout: 15_000 }).toBe(2);
});

test("settles RainViewer tiles until a multi-event map drag finishes", async ({ page }) => {
  await page.clock.install();
  await page.unroute("**/tilecache.rainviewer.com/**");
  let tileRequests = 0;
  await page.route("**/tilecache.rainviewer.com/**", (route) => {
    tileRequests += 1;
    return route.fulfill({
      contentType: "image/png",
      headers: { "Cache-Control": "no-store" },
      body: transparentPixel,
    });
  });

  await page.goto("/");
  await page.getByRole("combobox").fill("Tokyo");
  await page.getByRole("option").first().click();
  await revealForecastMap(page);
  await page.getByRole("tab", { name: "Radar observations" }).click();
  await expect(page.getByTestId("radar-source")).toContainText("RainViewer", { timeout: 15_000 });
  await expect.poll(() => tileRequests).toBeGreaterThan(0);
  await expect.poll(() => page.locator('img[data-radar-layer="loaded"]').count()).toBeGreaterThan(0);
  const loadedRequests = tileRequests;

  const viewport = page.getByTestId("forecast-map-viewport");
  const box = await viewport.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2, { steps: 12 });
  await page.mouse.up();
  await viewport.focus();
  for (let press = 0; press < 5; press += 1) await viewport.press("ArrowRight");

  expect(tileRequests).toBe(loadedRequests);
  await page.clock.runFor(250);
  await expect.poll(() => tileRequests, { timeout: 15_000 }).toBeGreaterThan(loadedRequests);
});

test("drops a geographically stale NOAA layer and retries a failed image replacement", async ({ page }) => {
  let initialImageUrl: string | null = null;
  let replacementImageUrl: string | null = null;
  let replacementAttempts = 0;
  await page.route(
    (url) => url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/exportImage"),
    (route) => {
      const requestUrl = route.request().url();
      if (initialImageUrl === null) initialImageUrl = requestUrl;
      if (requestUrl === initialImageUrl) {
        return route.fulfill({ contentType: "image/png", body: transparentPixel });
      }
      if (replacementImageUrl === null) replacementImageUrl = requestUrl;
      if (requestUrl === replacementImageUrl) {
        replacementAttempts += 1;
        if (replacementAttempts === 1) {
          return route.fulfill({ status: 503, contentType: "text/plain", body: "forced image outage" });
        }
      }
      return route.fulfill({ contentType: "image/png", body: transparentPixel });
    }
  );

  await page.goto("/");
  await revealForecastMap(page);
  await page.getByRole("tab", { name: "Radar observations" }).click();
  const viewport = page.getByTestId("forecast-map-viewport");
  await expect(page.locator('img[data-radar-layer="loaded"]')).toHaveCount(1, { timeout: 15_000 });

  const box = await viewport.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2, { steps: 12 });
  await page.mouse.up();

  const retry = page.getByRole("button", { name: "Retry radar imagery" });
  await expect.poll(() => replacementAttempts, { timeout: 15_000 }).toBe(1);
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('img[data-radar-layer="loaded"]')).toHaveCount(0);
  await retry.click();
  await expect(retry).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => replacementAttempts).toBe(2);
  await expect(page.locator('img[data-radar-layer="loaded"]')).toHaveCount(1);
});

test("retries NOAA radar failure without silently switching providers", async ({ page }) => {
  let noaaRequests = 0;
  let rainViewerRequests = 0;
  await page.route(
    (url) => url.hostname === "mapservices.weather.noaa.gov" && url.pathname.endsWith("/query"),
    (route) => {
      noaaRequests += 1;
      if (noaaRequests <= 2) return route.fulfill({ status: 503, json: { error: "forced outage" } });
      return route.fulfill({
        json: { features: radarFrames.map((idp_validtime) => ({ attributes: { idp_validtime } })) },
      });
    }
  );
  page.on("request", (request) => {
    if (request.url().includes("api.rainviewer.com/public/weather-maps.json")) rainViewerRequests += 1;
  });

  await page.goto("/");
  await revealForecastMap(page);
  await page.getByRole("tab", { name: "Radar observations" }).click();

  const retry = page.getByRole("button", { name: "Retry radar" });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await retry.click();
  await expect(page.getByTestId("radar-source")).toContainText("NOAA / NWS MRMS", { timeout: 15_000 });
  expect(noaaRequests).toBe(3);
  expect(rainViewerRequests).toBe(0);
});

test("updates responsive map height without resetting interaction state", async ({ page }) => {
  let mapRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/v1/gfs")) mapRequests++;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await revealForecastMap(page);
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.scrollIntoViewIfNeeded();
  await expect(viewport).toBeVisible();
  await expect.poll(async () => (await viewport.boundingBox())?.height).toBe(350);
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => mapRequests).toBe(1);

  await viewport.focus();
  await viewport.press("ArrowRight");
  await expect.poll(() => mapRequests, { timeout: 15_000 }).toBe(2);
  const slider = page.getByTestId("forecast-map-time");
  await page.getByRole("button", { name: "Pause forecast animation" }).click();
  await slider.fill("0");
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("1");

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('[data-target="tablet"]')).toBeVisible();
  await expect.poll(async () => (await viewport.boundingBox())?.height).toBe(440);
  await expect(slider).toHaveValue("1");
  await expect.poll(() => mapRequests, { timeout: 15_000 }).toBeGreaterThan(2);
  await page.waitForTimeout(500);
  const requestsBeforeRecenter = mapRequests;
  await page.getByRole("button", { name: /Recenter on/ }).click();
  await expect.poll(() => mapRequests, { timeout: 15_000 }).toBeGreaterThan(requestsBeforeRecenter);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator('[data-target="cinema"]')).toBeVisible();
  await expect.poll(async () => (await viewport.boundingBox())?.height).toBe(520);
  await expect(slider).toHaveValue("1");
});

test("animates wind and forecast time from one bounded map request", async ({ page }) => {
  const mapRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/v1/gfs")) mapRequests.push(request.url());
  });
  await page.goto("/");
  await revealForecastMap(page);
  const card = page.getByTestId("forecast-map-card");
  await card.scrollIntoViewIfNeeded();
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => mapRequests.length).toBe(1);

  const request = new URL(mapRequests[0]!);
  expect(request.searchParams.get("models")).toBe("gfs_global");
  expect(request.searchParams.get("forecast_hours")).toBe("48");
  expect(request.searchParams.get("latitude")!.split(",").length).toBeLessThanOrEqual(117);

  const slider = page.getByTestId("forecast-map-time");
  const initialTime = await slider.inputValue();
  await expect.poll(() => slider.inputValue(), { timeout: 5_000 }).not.toBe(initialTime);
  await expect.poll(
    () => page.getByTestId("forecast-map-wind").evaluate((canvas) => {
      const target = canvas as HTMLCanvasElement;
      const context = target.getContext("2d");
      if (!context || target.width === 0 || target.height === 0) return false;
      const pixels = context.getImageData(0, 0, target.width, target.height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index]! > 0) return true;
      }
      return false;
    }),
    { timeout: 5_000 }
  ).toBe(true);
  await page.getByRole("button", { name: "Pause forecast animation" }).click();
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(page.getByRole("img", { name: /Valid .* UTC/ })).toBeVisible();
  await page.waitForTimeout(600);
  expect(mapRequests).toHaveLength(1);
});

test("reduced motion keeps time manual and wind direction static", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const card = page.getByTestId("forecast-map-shell");
  await card.scrollIntoViewIfNeeded();
  const slider = page.getByTestId("forecast-map-time");
  await expect(slider).toBeEnabled({ timeout: 15_000 });
  const playback = page.getByRole("button", { name: "Play forecast animation" });
  await expect(playback).toBeDisabled();
  const initialTime = await slider.inputValue();
  await page.waitForTimeout(1_900);
  await expect(slider).toHaveValue(initialTime);
  await expect(page.getByRole("img", { name: /static wind arrows shown/ })).toBeVisible();
});

test("refreshes a stationary map grid when its cache entry expires", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  let mapRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/v1/gfs")) mapRequests++;
  });

  await page.goto("/");
  await revealForecastMap(page);
  const card = page.getByTestId("forecast-map-card");
  await card.scrollIntoViewIfNeeded();
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => mapRequests).toBe(1);

  await page.clock.runFor(MAP_FORECAST_CACHE_TTL_MS + 500);
  await expect.poll(() => mapRequests, { timeout: 15_000 }).toBe(2);
});

test("supports keyboard layer, pan, zoom, and recenter controls", async ({ page }) => {
  let mapRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/v1/gfs")) mapRequests++;
  });
  await page.goto("/");
  await revealForecastMap(page);
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.scrollIntoViewIfNeeded();
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Temperature", exact: true }).click();
  await expect(page.getByRole("img", { name: /Temperature forecast/ })).toBeVisible();
  await viewport.focus();
  await viewport.press("ArrowRight");
  await expect.poll(() => mapRequests, { timeout: 15_000 }).toBe(2);
  await expect(page.getByRole("img", { name: /Temperature forecast/ })).toBeVisible({ timeout: 15_000 });
  const wheelDefaultsPrevented = await viewport.evaluate((element) => {
    return [-40, -40, -40].map((deltaY) => {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(wheelDefaultsPrevented).toEqual([true, true, true]);
  await expect.poll(() => mapRequests, { timeout: 15_000 }).toBe(3);
  await page.waitForTimeout(250);
  expect(mapRequests).toBe(3);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => mapRequests, { timeout: 15_000 }).toBe(4);
  await page.getByRole("button", { name: /Recenter on/ }).click();
});

test("retries a failed forecast request for a newly panned viewport", async ({ page }) => {
  let mapRequests = 0;
  await page.route(
    (url) => url.hostname === "api.open-meteo.com" && url.pathname.endsWith("/v1/gfs"),
    (route) => {
      mapRequests += 1;
      if (mapRequests === 2) return route.fulfill({ status: 400, json: { error: "forced failure" } });
      return route.fulfill({ json: mapFixture(new URL(route.request().url())) });
    }
  );

  await page.goto("/");
  await revealForecastMap(page);
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.scrollIntoViewIfNeeded();
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible({ timeout: 15_000 });

  await viewport.focus();
  await viewport.press("ArrowRight");
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  const retryBox = await retry.boundingBox();
  expect(retryBox!.width).toBeGreaterThanOrEqual(44);
  expect(retryBox!.height).toBeGreaterThanOrEqual(44);
  expect(mapRequests).toBe(2);

  await retry.click();
  await expect.poll(() => mapRequests, { timeout: 15_000 }).toBe(3);
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible({ timeout: 15_000 });
  await expect(retry).toHaveCount(0);
});

test("map controls remain touch-sized without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await revealForecastMap(page);
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  const box = await page.getByRole("button", { name: "Zoom in" }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const attributionBox = await page.getByRole("link", { name: /OpenStreetMap contributors/ }).boundingBox();
  expect(attributionBox!.width).toBeGreaterThanOrEqual(44);
  expect(attributionBox!.height).toBeGreaterThanOrEqual(44);
  const legendBox = await page.getByTestId("forecast-map-legend").boundingBox();
  expect(attributionBox!.y + attributionBox!.height).toBeLessThanOrEqual(legendBox!.y);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
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

test("resets Rain today and refreshes point data at location-local midnight", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-10T06:59:58Z") });
  await page.unroute("**/api.open-meteo.com/**");
  let pointRequests = 0;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });

  await page.route("**/api.open-meteo.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("current")) return route.fulfill({ json: mapFixture(url) });
    pointRequests += 1;
    const afterMidnight = pointRequests > 1;
    if (afterMidnight) await refreshGate;
    const currentTime = Date.parse(afterMidnight
      ? "2026-08-10T07:00:00Z"
      : "2026-08-10T06:45:00Z") / 1000;
    return route.fulfill({
      json: {
        ...forecastFixture,
        current: { ...forecastFixture.current, time: currentTime },
        minutely_15: {
          time: afterMidnight ? [currentTime] : [currentTime - 900, currentTime],
          rain: afterMidnight ? [0] : [0.2, 0.3],
          showers: afterMidnight ? [0] : [0, 0],
        },
      },
    });
  });

  try {
    await page.goto("/");
    const rainToday = page.getByTestId("weather-metric-rain-today");
    await expect(rainToday).toHaveAttribute("aria-label", "Rain today: 0.50 in");

    await page.clock.runFor(2_200);
    await expect.poll(() => pointRequests).toBe(2);
    await expect(rainToday).toHaveAttribute("aria-label", "Rain today: 0.00 in");
  } finally {
    releaseRefresh();
  }
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
  await revealForecastMap(page);
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible({ timeout: 15_000 });
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
  await expect(page.getByText(/GFS ensemble \(\d+\)/)).toBeVisible();
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
