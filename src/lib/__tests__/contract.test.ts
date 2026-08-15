import { describe, it, expect } from "vitest";
import { noaaCatalogueUrl, noaaImageUrl, parseNoaaFrames } from "../radar/noaa";
import { parseRainViewer, rainViewerTileUrl } from "../radar/rainViewer";
import type { MapViewport } from "../map/types";
import { comparisonUrl, parseComparisonResponse } from "../comparison/provider";
import type { Place } from "../types";

/**
 * Contract tests (RFC 0001 §4).
 *
 * These hit real provider endpoints. They answer a question no unit test can: has an
 * upstream schema changed underneath us? They are network-dependent by design and are
 * skipped unless RUN_CONTRACT_TESTS=1, so an offline developer machine or a flaky CI
 * runner does not produce a red build that means nothing.
 *
 * CI runs them nightly. Provider schemas change on the provider's schedule, and we would
 * rather learn about it from a nightly than from a user.
 */

const enabled = process.env["RUN_CONTRACT_TESTS"] === "1";
const d = enabled ? describe : describe.skip;
const LAT = 37.44;
const LON = -122.14;
const PALO_ALTO: Place = {
  lat: LAT,
  lon: LON,
  name: "Palo Alto",
  admin: "California",
  country: "United States",
  cc: "us",
};

async function getJson<T = Record<string, unknown>>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  expect(
    res.ok,
    `${new URL(url).hostname} returned HTTP ${res.status} ${res.statusText}`
  ).toBe(true);
  return (await res.json()) as T;
}

async function expectImage(url: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  expect(
    response.ok,
    `${new URL(url).hostname} returned HTTP ${response.status} ${response.statusText}`
  ).toBe(true);
  expect(response.headers.get("content-type")).toMatch(/^image\/(png|webp)/);
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
}

d("contract: Open-Meteo forecast", () => {
  it("returns the fields the parser reads", async () => {
    const j = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,surface_pressure,precipitation,rain,showers,snowfall,cloud_cover` +
        `&hourly=temperature_2m,weather_code,precipitation_probability,is_day,visibility,precipitation` +
        `&minutely_15=rain,showers&past_minutely_15=104&forecast_minutely_15=1` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max` +
        `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&timeformat=unixtime&forecast_days=10`
    );

    const current = j["current"] as Record<string, number>;
    const hourly = j["hourly"] as Record<string, unknown[]>;
    const minutely = j["minutely_15"] as Record<string, unknown[]>;
    const daily = j["daily"] as Record<string, unknown[]>;

    expect(typeof current["temperature_2m"]).toBe("number");
    expect(typeof current["weather_code"]).toBe("number");
    expect(typeof current["precipitation"]).toBe("number");
    expect(typeof current["cloud_cover"]).toBe("number");
    expect(typeof j["timezone"]).toBe("string");
    expect(Array.isArray(hourly["time"])).toBe(true);
    expect(typeof hourly["time"]![0]).toBe("number");
    expect(hourly["temperature_2m"]).toHaveLength(hourly["time"]!.length);
    expect(hourly["precipitation"]).toHaveLength(hourly["time"]!.length);
    expect(minutely["time"]).toHaveLength(105);
    expect(minutely["rain"]).toHaveLength(minutely["time"]!.length);
    expect(minutely["showers"]).toHaveLength(minutely["time"]!.length);
    expect(daily["time"]).toHaveLength(10);
    expect(daily["sunrise"]).toHaveLength(10);
  }, 30_000);
});

d("contract: Open-Meteo comparison summary", () => {
  it("returns the bounded Fahrenheit, inch, and Unix-time shape", async () => {
    const j = await getJson<Record<string, unknown>>(comparisonUrl(PALO_ALTO));
    const summary = parseComparisonResponse(j, PALO_ALTO);
    const hourly = j["hourly"] as Record<string, unknown[]>;
    const minutely = j["minutely_15"] as Record<string, unknown[]>;
    const daily = j["daily"] as Record<string, unknown[]>;
    const hourlyUnits = j["hourly_units"] as Record<string, string>;
    const minutelyUnits = j["minutely_15_units"] as Record<string, string>;

    expect(summary.hourly).toHaveLength(6);
    expect(summary.daily).toHaveLength(3);
    expect(hourly["time"]).toHaveLength(6);
    expect(typeof hourly["time"]![0]).toBe("number");
    expect(minutely["time"]).toHaveLength(105);
    expect(daily["time"]).toHaveLength(3);
    expect(hourlyUnits["temperature_2m"]).toContain("F");
    expect(hourlyUnits["precipitation"]).toBe("inch");
    expect(minutelyUnits["rain"]).toBe("inch");
    expect(j["timezone"]).toMatch(/^[A-Za-z_]+\/[A-Za-z_+-]+/);
  }, 30_000);
});

d("contract: Open-Meteo ensemble", () => {
  it("still exposes multiple precipitation and temperature member series", async () => {
    const j = await getJson(
      `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${LAT}&longitude=${LON}` +
        `&hourly=precipitation,temperature_2m&models=gfs025&forecast_days=1` +
        `&precipitation_unit=inch&temperature_unit=fahrenheit&timeformat=unixtime&timezone=auto`
    );
    const hourly = j["hourly"] as Record<string, unknown>;
    const precip = Object.keys(hourly).filter((k) => k.startsWith("precipitation"));
    const temp = Object.keys(hourly).filter((k) => k.startsWith("temperature_2m"));
    expect(precip.length).toBeGreaterThanOrEqual(10);
    expect(temp.length).toBeGreaterThanOrEqual(10);
    expect(Array.isArray(hourly["time"])).toBe(true);
    expect(typeof (hourly["time"] as unknown[])[0]).toBe("number");
  }, 40_000);
});

d("contract: Open-Meteo forecast map", () => {
  it("returns aligned GFS fields for multiple coordinates", async () => {
    const locations = await getJson<Array<Record<string, unknown>>>(
      "https://api.open-meteo.com/v1/gfs" +
        "?latitude=37.44,38.58,36.17,34.05&longitude=-122.14,-121.49,-115.14,-118.24" +
        "&hourly=temperature_2m,pressure_msl,precipitation,wind_speed_10m,wind_direction_10m" +
        "&models=gfs_global&forecast_hours=48&timezone=GMT"
    );
    expect(locations).toHaveLength(4);
    const firstTimes = (locations[0]!["hourly"] as Record<string, unknown[]>)["time"];
    expect(firstTimes).toHaveLength(48);
    for (const location of locations) {
      const hourly = location["hourly"] as Record<string, unknown[]>;
      const units = location["hourly_units"] as Record<string, string>;
      expect(hourly["time"]).toEqual(firstTimes);
      for (const field of ["temperature_2m", "pressure_msl", "precipitation", "wind_speed_10m", "wind_direction_10m"]) {
        expect(hourly[field]).toHaveLength(48);
      }
      expect(units["temperature_2m"]).toContain("C");
      expect(units["pressure_msl"]).toContain("hPa");
      expect(units["precipitation"]).toContain("mm");
      expect(units["wind_speed_10m"]).toContain("km/h");
    }
  }, 30_000);
});

d("contract: NOAA MRMS radar", () => {
  it("returns recent, deduplicated observation frames", async () => {
    const source = parseNoaaFrames(await getJson<unknown>(noaaCatalogueUrl()));
    expect(source.frames.length).toBeGreaterThan(2);
    expect(new Set(source.frames.map((frame) => frame.id)).size).toBe(source.frames.length);
    const newest = source.frames.at(-1)!;
    expect(Date.now() - newest.validAt.getTime()).toBeLessThan(8 * 60 * 60 * 1000);
  }, 30_000);

  it("exports a bounded transparent image for a selected frame and viewport", async () => {
    const source = parseNoaaFrames(await getJson<unknown>(noaaCatalogueUrl()));
    const viewport: MapViewport = {
      center: { lat: LAT, lon: LON },
      zoom: 5,
      width: 640,
      height: 400,
    };
    await expectImage(noaaImageUrl(source.frames.at(-1)!, viewport, { width: 640, height: 400 }));
  }, 30_000);
});

d("contract: RainViewer radar", () => {
  it("returns recent public observation frames from the approved tile host", async () => {
    const source = parseRainViewer(await getJson<unknown>("https://api.rainviewer.com/public/weather-maps.json"));
    expect(source.frames.length).toBeGreaterThan(2);
    expect(source.imageHost).toBe("https://tilecache.rainviewer.com");
    expect(Date.now() - source.frames.at(-1)!.validAt.getTime()).toBeLessThan(4 * 60 * 60 * 1000);
  }, 30_000);

  it("serves the documented public radar tile shape", async () => {
    const source = parseRainViewer(await getJson<unknown>("https://api.rainviewer.com/public/weather-maps.json"));
    await expectImage(rainViewerTileUrl(
      source.frames.at(-1)!,
      source.imageHost!,
      { z: 4, x: 2, y: 6 }
    ));
  }, 30_000);
});

d("contract: Zippopotam", () => {
  it("resolves a known postal code to coordinates", async () => {
    const j = await getJson("https://api.zippopotam.us/us/94301");
    const places = j["places"] as Array<Record<string, string>>;
    expect(places.length).toBeGreaterThan(0);
    expect(Number.isFinite(Number.parseFloat(places[0]!["latitude"]!))).toBe(true);
    expect(places[0]!["place name"]).toBeTruthy();
  }, 20_000);
});

d("contract: Photon", () => {
  it("returns GeoJSON features with the properties the parser reads", async () => {
    const j = await getJson("https://photon.komoot.io/api/?q=SW1A%201AA&limit=1");
    const features = j["features"] as Array<Record<string, unknown>>;
    expect(features.length).toBeGreaterThan(0);
    const geom = features[0]!["geometry"] as { coordinates: number[] };
    expect(geom.coordinates).toHaveLength(2);
  }, 20_000);
});

d("contract: Open-Meteo past analysis", () => {
  it("returns elapsed hours for verification, with temperature in the unit we asked for", async () => {
    const j = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        `&hourly=precipitation,temperature_2m&past_days=7&forecast_days=1` +
        `&precipitation_unit=inch&temperature_unit=fahrenheit&timezone=auto`
    );
    const hourly = j["hourly"] as Record<string, unknown[]>;
    const times = hourly["time"] as string[];
    const past = times.filter((t) => new Date(t).getTime() < Date.now());
    expect(past.length).toBeGreaterThan(100);

    // The unit trap (RFC 0002 §3.3): the endpoint echoes the unit it actually applied.
    // If this stops containing °F, temperature verification is silently scoring Celsius.
    const units = j["hourly_units"] as Record<string, string>;
    expect(units["temperature_2m"]).toContain("F");

    const temps = hourly["temperature_2m"] as (number | null)[];
    expect(temps.length).toBe(times.length);
    const elapsed = temps.slice(0, past.length).filter((v): v is number => v !== null);
    expect(elapsed.length).toBeGreaterThan(100);
    for (const v of elapsed) {
      expect(v).toBeGreaterThan(-80);
      expect(v).toBeLessThan(140);
    }
  }, 30_000);
});
