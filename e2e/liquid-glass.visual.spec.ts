import { inflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = new Date("2026-02-18T07:00:00.000Z");
const HASH_SIZE = 8;
const MAX_HASH_DISTANCE = 4;

const PLATFORM_BASELINES = {
  linux: {
    phone: { width: 366, height: 2509, dHash: "86805d9101098687" },
    tablet: { width: 1132, height: 1705, dHash: "0737135971393935" },
    cinema: { width: 1680, height: 1145, dHash: "2324b55724a46479" },
  },
  win32: {
    phone: { width: 366, height: 2466, dHash: "86805d1101098687" },
    tablet: { width: 1132, height: 1706, dHash: "0737135971393935" },
    cinema: { width: 1680, height: 1146, dHash: "2324b55724a46479" },
  },
} as const;

type VisualPlatform = keyof typeof PLATFORM_BASELINES;
type ScenarioName = keyof (typeof PLATFORM_BASELINES)[VisualPlatform];

const BASELINES = PLATFORM_BASELINES[process.platform as VisualPlatform];
if (!BASELINES) throw new Error(`visual baselines are not calibrated for ${process.platform}`);

const TIMELINE_BASELINES = {
  linux: {
    phone: { width: 366, height: 852, dHash: "90e2f2cebe04e0e8" },
    tablet: { width: 1132, height: 789, dHash: "8190b4ecd8f25d8f" },
    cinema: { width: 1680, height: 901, dHash: "83909292928c7d0b" },
  },
  win32: {
    phone: { width: 366, height: 819, dHash: "b0e6f2ce9e5c63fa" },
    tablet: { width: 1132, height: 788, dHash: "8190b4ecd8d25da7" },
    cinema: { width: 1680, height: 900, dHash: "8390929292dc7d27" },
  },
} as const;
const TIMELINE_PLATFORM_BASELINES = TIMELINE_BASELINES[process.platform as VisualPlatform];

type TimelineVisualState = "observation" | "forecast" | "unavailable";

interface DecodedPng {
  width: number;
  height: number;
  bytesPerPixel: number;
  pixels: Buffer;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(png: Buffer): DecodedPng {
  const signature = "89504e470d0a1a0a";
  if (png.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("visual baseline input is not a PNG");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bytesPerPixel = 0;
  const idat: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(
          `unsupported screenshot PNG: depth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`
        );
      }
      bytesPerPixel = colorType === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height || !bytesPerPixel || !idat.length) {
    throw new Error("incomplete screenshot PNG");
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = raw[sourceOffset++];
    const rowOffset = row * stride;
    const previousRowOffset = rowOffset - stride;

    for (let column = 0; column < stride; column += 1) {
      const encoded = raw[sourceOffset++];
      const left = column >= bytesPerPixel ? pixels[rowOffset + column - bytesPerPixel]! : 0;
      const above = row > 0 ? pixels[previousRowOffset + column]! : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[previousRowOffset + column - bytesPerPixel]!
          : 0;

      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);

      pixels[rowOffset + column] = (encoded + predictor) & 0xff;
    }
  }

  return { width, height, bytesPerPixel, pixels };
}

function downsampleLuminance(
  image: DecodedPng,
  columns: number,
  rows: number
): number[][] {
  const { width, height, bytesPerPixel, pixels } = image;
  if (width < columns || height < rows) {
    throw new Error(`cannot downsample ${width}x${height} into ${columns}x${rows}`);
  }

  const stride = width * bytesPerPixel;
  return Array.from({ length: rows }, (_, row) => {
    const top = Math.floor((row * height) / rows);
    const bottom = Math.floor(((row + 1) * height) / rows);

    return Array.from({ length: columns }, (_, column) => {
      const left = Math.floor((column * width) / columns);
      const right = Math.floor(((column + 1) * width) / columns);
      let total = 0;

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const pixelOffset = y * stride + x * bytesPerPixel;
          const red = pixels[pixelOffset]!;
          const green = pixels[pixelOffset + 1]!;
          const blue = pixels[pixelOffset + 2]!;
          const alpha = bytesPerPixel === 4 ? pixels[pixelOffset + 3]! / 255 : 1;
          const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
          total += luminance * alpha + 255 * (1 - alpha);
        }
      }

      return total / ((right - left) * (bottom - top));
    });
  });
}

function differenceHash(png: Buffer): { width: number; height: number; hash: string } {
  const decoded = decodePng(png);
  const luminance = downsampleLuminance(decoded, HASH_SIZE + 1, HASH_SIZE);
  let bits = "";

  for (let row = 0; row < HASH_SIZE; row += 1) {
    for (let column = 0; column < HASH_SIZE; column += 1) {
      bits += luminance[row]![column + 1]! > luminance[row]![column]! ? "1" : "0";
    }
  }

  let hash = "";
  for (let index = 0; index < bits.length; index += 4) {
    hash += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return { width: decoded.width, height: decoded.height, hash };
}

function hammingDistance(left: string, right: string): number {
  if (left.length !== right.length) throw new Error("visual hashes have different lengths");
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = Number.parseInt(left[index]!, 16) ^ Number.parseInt(right[index]!, 16);
    while (value) {
      distance += value & 1;
      value >>= 1;
    }
  }
  return distance;
}

test("dHash downsampling averages every pixel in each source region", () => {
  const width = (HASH_SIZE + 1) * 2;
  const height = HASH_SIZE;
  const pixels = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 1; x < width; x += 2) {
      const offset = (y * width + x) * 3;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
    }
  }

  const sampled = downsampleLuminance(
    { width, height, bytesPerPixel: 3, pixels },
    HASH_SIZE + 1,
    HASH_SIZE
  );
  for (const row of sampled) {
    for (const value of row) expect(value).toBeCloseTo(127.5, 5);
  }
});

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

  const providerNotice = page
    .getByRole("status")
    .filter({ hasText: "Couldn't reach the forecast service" });
  await expect(providerNotice).toBeVisible({ timeout: 15_000 });
  await providerNotice.evaluate((node) => {
    node.style.display = "none";
  });

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

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XqR0WQAAAABJRU5ErkJggg==",
  "base64"
);

function timelinePointForecastFixture(): Record<string, unknown> {
  const nowSeconds = Math.floor(FIXED_NOW.getTime() / 1_000);
  const dayStart = nowSeconds - (nowSeconds % 86_400);
  return {
    timezone: "America/Los_Angeles",
    timezone_abbreviation: "PST",
    utc_offset_seconds: -28_800,
    current: {
      temperature_2m: 54,
      apparent_temperature: 52,
      relative_humidity_2m: 78,
      weather_code: 61,
      is_day: 0,
      wind_speed_10m: 8,
      surface_pressure: 1_012,
      time: nowSeconds,
      interval: 900,
      precipitation: 0.04,
      rain: 0.04,
      showers: 0,
      snowfall: 0,
      cloud_cover: 88,
    },
    hourly: {
      time: Array.from({ length: 48 }, (_, index) => nowSeconds + (index - 2) * 3_600),
      temperature_2m: Array.from({ length: 48 }, (_, index) => 50 + index % 9),
      weather_code: Array.from({ length: 48 }, () => 61),
      precipitation_probability: Array.from({ length: 48 }, (_, index) => 30 + index % 60),
      is_day: Array.from({ length: 48 }, (_, index) => index % 24 > 8 && index % 24 < 18 ? 1 : 0),
      visibility: Array.from({ length: 48 }, () => 16_000),
      precipitation: Array.from({ length: 48 }, (_, index) => index % 6 === 0 ? 0.06 : 0),
    },
    minutely_15: {
      time: Array.from({ length: 105 }, (_, index) => nowSeconds - (104 - index) * 900),
      rain: Array.from({ length: 105 }, (_, index) => index % 24 === 0 ? 0.01 : 0),
      showers: Array.from({ length: 105 }, () => 0),
    },
    daily: {
      time: Array.from({ length: 10 }, (_, index) => dayStart + index * 86_400),
      weather_code: Array.from({ length: 10 }, () => 61),
      temperature_2m_max: Array.from({ length: 10 }, (_, index) => 58 + index),
      temperature_2m_min: Array.from({ length: 10 }, (_, index) => 45 + index),
      sunrise: Array.from({ length: 10 }, (_, index) => dayStart + index * 86_400 + 15 * 3_600),
      sunset: Array.from({ length: 10 }, (_, index) => dayStart + index * 86_400 + 3 * 3_600 + 86_400),
      uv_index_max: Array.from({ length: 10 }, () => 3),
    },
  };
}

function timelineMapFixture(url: URL): Array<Record<string, unknown>> {
  const times = Array.from({ length: 48 }, (_, index) =>
    new Date(FIXED_NOW.getTime() + index * 3_600_000).toISOString().slice(0, 16)
  );
  const latitudes = (url.searchParams.get("latitude") ?? "").split(",").map(Number);
  const longitudes = (url.searchParams.get("longitude") ?? "").split(",").map(Number);
  return latitudes.map((latitude, point) => ({
    latitude,
    longitude: longitudes[point],
    hourly_units: {
      temperature_2m: "°C",
      pressure_msl: "hPa",
      precipitation: "mm",
      wind_speed_10m: "km/h",
      wind_direction_10m: "°",
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, hour) => 7 + point * 0.08 + Math.sin(hour / 6) * 4),
      pressure_msl: times.map((_, hour) => 1_006 + point * 0.12 + Math.cos(hour / 8) * 2),
      precipitation: times.map((_, hour) => (point + hour) % 7 === 0 ? 2.2 : 0),
      wind_speed_10m: times.map((_, hour) => 10 + (point + hour) % 15),
      wind_direction_10m: times.map((_, hour) => (point * 11 + hour * 7) % 360),
    },
  }));
}

async function bootTimelineVisual(page: Page, state: TimelineVisualState): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("wx.location-onboarding.v1", JSON.stringify({ version: 1, complete: true }));
  });
  await page.route("**/api.open-meteo.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/v1/gfs")) {
      return state === "unavailable"
        ? route.fulfill({ status: 503, json: { error: "visual unavailable state" } })
        : route.fulfill({ json: timelineMapFixture(url) });
    }
    return route.fulfill({ json: timelinePointForecastFixture() });
  });
  await page.route("**/mapservices.weather.noaa.gov/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/query")) {
      const frames = state === "unavailable"
        ? []
        : [-600_000, -300_000, 0].map((offset, index) => ({
          attributes: { objectid: index + 1, idp_validtime: FIXED_NOW.getTime() + offset },
        }));
      return route.fulfill({ json: { features: frames } });
    }
    return route.fulfill({ contentType: "image/png", body: transparentPixel });
  });
  await page.route("**/tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/png", body: transparentPixel })
  );
  await page.route("**/air-quality-api.open-meteo.com/**", (route) =>
    route.fulfill({ json: { current: { us_aqi: 28 } } })
  );
  for (const pattern of [
    "**/ensemble-api.open-meteo.com/**",
    "**/geocoding-api.open-meteo.com/**",
    "**/api.rainviewer.com/**",
  ]) {
    await page.route(pattern, (route) => route.abort());
  }

  await page.goto("/");
  await expect(page.getByTestId("forecast-overview")).toBeVisible();
  await expect(page.getByText(/Live data from Open-Meteo/)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("forecast-map-shell").scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "Precipitation timeline" }).click();

  if (state === "observation") {
    await expect(page.locator('img[data-radar-layer="loaded"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("precipitation-source")).toContainText("NOAA / NWS MRMS");
  } else if (state === "forecast") {
    const timeline = page.getByTestId("precipitation-time");
    await expect(page.getByTestId("precipitation-horizon-48")).toBeEnabled({ timeout: 15_000 });
    await timeline.fill((await timeline.getAttribute("max"))!);
    await expect(page.getByTestId("precipitation-forecast-overlay")).toBeVisible();
    await expect(page.getByTestId("precipitation-source")).toContainText("Open-Meteo GFS");
  } else {
    await expect(page.getByTestId("precipitation-source"))
      .toHaveText("PRECIPITATION UNAVAILABLE", { timeout: 15_000 });
    await expect(page.getByText("Modeled forecast precipitation could not be loaded."))
      .toBeVisible();
  }

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
  if (state === "observation") {
    await expect(page.locator('img[data-radar-layer="loaded"]')).toHaveCount(1);
    await expect(page.getByTestId("precipitation-source")).toContainText("NOAA / NWS MRMS");
  } else if (state === "forecast") {
    await expect(page.getByTestId("precipitation-forecast-overlay")).toBeVisible();
    await expect(page.getByTestId("precipitation-source")).toContainText("Open-Meteo GFS");
  } else {
    await expect(page.getByText("Modeled forecast precipitation could not be loaded."))
      .toBeVisible();
    await expect(page.getByTestId("precipitation-source")).toHaveText("PRECIPITATION UNAVAILABLE");
  }
}

const scenarios: ReadonlyArray<{
  name: ScenarioName;
  width: number;
  height: number;
}> = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 1180, height: 820 },
  { name: "cinema", width: 1920, height: 1080 },
];

for (const scenario of scenarios) {
  test(`${scenario.name} Liquid Glass dashboard`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await bootVisualDashboard(page);

    const screenshot = await page.getByTestId("forecast-overview").screenshot({
      animations: "disabled",
      caret: "hide",
    });
    const actual = differenceHash(screenshot);
    const expected = BASELINES[scenario.name];
    const distance = hammingDistance(actual.hash, expected.dHash);
    console.log(
      `visual-signature ${scenario.name} ${actual.width}x${actual.height} ${actual.hash}`
    );

    if (
      actual.width !== expected.width ||
      actual.height !== expected.height ||
      distance > MAX_HASH_DISTANCE
    ) {
      await testInfo.attach(`liquid-glass-${scenario.name}.png`, {
        body: screenshot,
        contentType: "image/png",
      });
      await testInfo.attach(`liquid-glass-${scenario.name}-signature.json`, {
        body: Buffer.from(
          JSON.stringify({ expected, actual, distance, maxDistance: MAX_HASH_DISTANCE }, null, 2)
        ),
        contentType: "application/json",
      });
    }

    expect(actual.width).toBe(expected.width);
    expect(actual.height).toBe(expected.height);
    expect(distance, `perceptual dHash ${actual.hash}`).toBeLessThanOrEqual(
      MAX_HASH_DISTANCE
    );
  });
}

const timelineVisualStates: Record<ScenarioName, TimelineVisualState> = {
  phone: "observation",
  tablet: "forecast",
  cinema: "unavailable",
};

for (const scenario of scenarios) {
  test(`${scenario.name} precipitation timeline visual baseline`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    const state = timelineVisualStates[scenario.name];
    await bootTimelineVisual(page, state);

    const screenshot = await page.getByTestId("forecast-map-card").screenshot({
      animations: "disabled",
      caret: "hide",
    });
    const actual = differenceHash(screenshot);
    const expected = TIMELINE_PLATFORM_BASELINES[scenario.name];
    const distance = hammingDistance(actual.hash, expected.dHash);
    console.log(
      `timeline-visual-signature ${scenario.name} ${state} ${actual.width}x${actual.height} ${actual.hash}`
    );

    if (
      actual.width !== expected.width ||
      actual.height !== expected.height ||
      distance > MAX_HASH_DISTANCE
    ) {
      await testInfo.attach(`precipitation-timeline-${scenario.name}.png`, {
        body: screenshot,
        contentType: "image/png",
      });
      await testInfo.attach(`precipitation-timeline-${scenario.name}-signature.json`, {
        body: Buffer.from(
          JSON.stringify({ state, expected, actual, distance, maxDistance: MAX_HASH_DISTANCE }, null, 2)
        ),
        contentType: "application/json",
      });
    }

    expect(actual.width).toBe(expected.width);
    expect(actual.height).toBe(expected.height);
    expect(distance, `timeline perceptual dHash ${actual.hash}`).toBeLessThanOrEqual(
      MAX_HASH_DISTANCE
    );
  });
}
