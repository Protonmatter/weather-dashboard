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

type MapTransportOutcome = "abort" | "success" | "error";
interface DeferredMapTransport {
  url: string;
  signal: AbortSignal | null;
  settled: boolean;
  bodyRead: boolean;
  settle: (outcome: MapTransportOutcome) => void;
}
type MapTransportWindow = Window & { reviewMapTransports: DeferredMapTransport[] };

async function bootDeferredMap(page: Page): Promise<void> {
  await page.addInitScript((base: number) => {
    const records: DeferredMapTransport[] = [];
    (window as unknown as MapTransportWindow).reviewMapTransports = records;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.hostname !== "api.open-meteo.com" || !url.pathname.endsWith("/v1/gfs")) {
        return nativeFetch(input, init);
      }
      // Deliberately retain the promise after signal.abort; the test chooses when
      // the transport settles, while HTTP/provider/hook code remains unmodified.
      return new Promise<Response>((resolve, reject) => {
        const pressure = 980 + records.length * 44;
        const record: DeferredMapTransport = {
          url: url.toString(), signal: init?.signal ?? (input instanceof Request ? input.signal : null),
          settled: false, bodyRead: false,
          settle(outcome) {
            if (record.settled) throw new Error("Map transport already settled");
            record.settled = true;
            if (outcome === "abort") return reject(new DOMException("Delayed transport abort", "AbortError"));
            const latitudes = url.searchParams.get("latitude")!.split(",").map(Number);
            const longitudes = url.searchParams.get("longitude")!.split(",").map(Number);
            const mapTimes = Array.from({ length: 48 }, (_, hour) => new Date((base + hour * 3600) * 1000).toISOString().slice(0, 16));
            const payload = latitudes.map((latitude, index) => ({
              latitude, longitude: longitudes[index],
              hourly_units: { temperature_2m: "°C", pressure_msl: "hPa", precipitation: "mm", wind_speed_10m: "km/h", wind_direction_10m: "°" },
              hourly: { time: mapTimes, temperature_2m: mapTimes.map(() => 15),
                pressure_msl: mapTimes.map(() => pressure), precipitation: mapTimes.map(() => 0),
                wind_speed_10m: mapTimes.map(() => 12), wind_direction_10m: mapTimes.map(() => 180) },
            }));
            const response = new Response(JSON.stringify(outcome === "error" ? {} : payload), {
              status: outcome === "error" ? 400 : 200, headers: { "Content-Type": "application/json" },
            });
            const readJson = response.json.bind(response);
            response.json = async () => { const value = await readJson(); record.bodyRead = true; return value; };
            resolve(response);
          },
        };
        records.push(record);
      });
    };
  }, BASE);
  await boot(page);
  await page.getByTestId("forecast-map-shell").scrollIntoViewIfNeeded();
  // The lazy shell can intersect before WebKit has laid out the mounted map.
  // A measured viewport and pending state must exist before awaiting transport.
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.scrollIntoViewIfNeeded();
  await expect(viewport).toHaveAttribute("data-viewport-width", /^[1-9]\d*$/);
  await expect(page.getByText("Loading forecast field…", { exact: true })).toBeVisible();
  await expect.poll(() => mapTransports(page)).toHaveLength(1);
  // Shift the wall clock without firing the outstanding transport's timeout.
  await page.clock.setFixedTime(new Date(NOW.getTime() + 60_000));
  await page.clock.pauseAt(new Date(NOW.getTime() + 61_000));
}

async function mapTransports(page: Page) {
  return page.evaluate(() => (window as unknown as MapTransportWindow).reviewMapTransports.map(record => ({
    url: record.url, aborted: record.signal?.aborted ?? false, settled: record.settled, bodyRead: record.bodyRead,
  })));
}

async function settleMapTransport(page: Page, index: number, outcome: MapTransportOutcome): Promise<void> {
  await page.evaluate(({ index, outcome }) => (window as unknown as MapTransportWindow).reviewMapTransports[index]!.settle(outcome), { index, outcome });
  if (outcome === "success") await expect.poll(async () => (await mapTransports(page))[index]?.bodyRead).toBe(true);
  // Drain the HTTP/provider/hook promise chain through a real browser task, without
  // advancing the paused 400 ms acquisition clock or relying on a fixed sleep.
  await page.evaluate(() => new Promise<void>(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
  }));
}

for (const phase of ["debounce", "transport"] as const) {
  test(`review: late transport abort preserves replacement ${phase}`, async ({ page }) => {
    await bootDeferredMap(page);
    const viewport = page.getByTestId("forecast-map-viewport");
    const loading = page.getByText("Loading forecast field…", { exact: true });
    await viewport.focus();
    await viewport.press("ArrowRight");
    await expect.poll(async () => (await mapTransports(page))[0]?.aborted).toBe(true);
    if (phase === "transport") {
      await page.clock.runFor(400);
      await expect.poll(() => mapTransports(page)).toHaveLength(2);
    }
    await settleMapTransport(page, 0, "abort");
    await expect(loading).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    expect(await mapTransports(page)).toHaveLength(phase === "debounce" ? 1 : 2);
    if (phase === "debounce") {
      await page.clock.runFor(399);
      expect(await mapTransports(page)).toHaveLength(1);
      await expect(loading).toBeVisible();
      await page.clock.runFor(1);
      await expect.poll(() => mapTransports(page)).toHaveLength(2);
    }
    const requests = await mapTransports(page);
    expect(requests[0]?.url).not.toBe(requests[1]?.url);
    expect(requests[1]?.aborted).toBe(false);
    await settleMapTransport(page, 1, "success");
    await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast.*1024/ })).toBeVisible();
    await expect(loading).toHaveCount(0);
    expect(await mapTransports(page)).toHaveLength(2);
  });
}

test("review: late transport abort preserves the newer failure and Retry", async ({ page }) => {
  await bootDeferredMap(page);
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.focus();
  await viewport.press("ArrowRight");
  await expect.poll(async () => (await mapTransports(page))[0]?.aborted).toBe(true);
  await page.clock.runFor(400);
  await expect.poll(() => mapTransports(page)).toHaveLength(2);
  await settleMapTransport(page, 1, "error");
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  await settleMapTransport(page, 0, "abort");
  await expect(retry).toBeVisible();
  await expect(page.getByText("The forecast field could not be loaded. Try this area again.", { exact: false })).toBeVisible();
  await expect(page.getByText("Loading forecast field…", { exact: true })).toHaveCount(0);
  expect(await mapTransports(page)).toHaveLength(2);
  await retry.click();
  await page.clock.runFor(400);
  await expect.poll(() => mapTransports(page)).toHaveLength(3);
  await settleMapTransport(page, 2, "success");
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast.*1068/ })).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test("review: late canceled success cannot replace or cache an obsolete grid", async ({ page }) => {
  await bootDeferredMap(page);
  const viewport = page.getByTestId("forecast-map-viewport");
  await viewport.focus();
  await viewport.press("ArrowRight");
  await expect.poll(async () => (await mapTransports(page))[0]?.aborted).toBe(true);
  await page.clock.runFor(400);
  await expect.poll(() => mapTransports(page)).toHaveLength(2);
  const requests = await mapTransports(page);
  expect(requests[0]?.url).not.toBe(requests[1]?.url);
  await settleMapTransport(page, 1, "success");
  const currentField = page.getByRole("img", { name: /Mean-sea-level pressure forecast.*1024/ });
  await expect(currentField).toBeVisible();
  await settleMapTransport(page, 0, "success");
  await expect(currentField).toBeVisible();
  await expect(page.getByText("Loading forecast field…", { exact: true })).toHaveCount(0);
  expect(await mapTransports(page)).toHaveLength(2);
  // Revisiting A must acquire fresh data, rather than use the canceled response
  // from the hook's cache even if its obsolete reducer action was discarded.
  await viewport.press("ArrowLeft");
  await page.clock.runFor(400);
  await expect.poll(() => mapTransports(page)).toHaveLength(3);
  expect((await mapTransports(page))[2]?.url).toBe(requests[0]?.url);
  await settleMapTransport(page, 2, "success");
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast.*1068/ })).toBeVisible();
});

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
  await page.clock.pauseAt(new Date(NOW.getTime() + 60_000));
  const viewport = page.getByTestId("forecast-map-viewport");
  const loading = page.getByText("Loading forecast field…", { exact: true });
  await viewport.focus();
  await viewport.press("ArrowRight");
  await expect(loading).toBeVisible();
  expect(requests).toBe(1);
  await page.clock.runFor(200);
  await viewport.press("ArrowRight");
  await expect(loading).toBeVisible();
  await page.clock.runFor(399);
  expect(requests).toBe(1);
  await expect(loading).toBeVisible();
  await page.clock.runFor(1);
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  await expect(loading).toHaveCount(0);
  await retry.click();
  await expect(loading).toBeVisible();
  expect(requests).toBe(2);
  await page.clock.runFor(399);
  expect(requests).toBe(2);
  await expect(loading).toBeVisible();
  await page.clock.runFor(1);
  await expect(page.getByRole("img", { name: /Mean-sea-level pressure forecast/ })).toBeVisible();
  await expect(loading).toHaveCount(0);
  await expect(retry).toHaveCount(0);
  expect(requests).toBe(3);
});
