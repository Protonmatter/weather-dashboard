import { describe, it, expect } from "vitest";

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

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  expect(res.ok).toBe(true);
  return (await res.json()) as Record<string, unknown>;
}

d("contract: Open-Meteo forecast", () => {
  it("returns the fields the parser reads", async () => {
    const j = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,surface_pressure` +
        `&hourly=temperature_2m,weather_code,precipitation_probability,is_day,visibility` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max` +
        `&temperature_unit=fahrenheit&timezone=auto&forecast_days=10`
    );

    const current = j["current"] as Record<string, number>;
    const hourly = j["hourly"] as Record<string, unknown[]>;
    const daily = j["daily"] as Record<string, unknown[]>;

    expect(typeof current["temperature_2m"]).toBe("number");
    expect(typeof current["weather_code"]).toBe("number");
    expect(Array.isArray(hourly["time"])).toBe(true);
    expect(hourly["temperature_2m"]).toHaveLength(hourly["time"]!.length);
    expect(daily["time"]).toHaveLength(10);
    expect(daily["sunrise"]).toHaveLength(10);
  }, 30_000);
});

d("contract: Open-Meteo ensemble", () => {
  it("still exposes multiple precipitation and temperature member series", async () => {
    const j = await getJson(
      `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${LAT}&longitude=${LON}` +
        `&hourly=precipitation,temperature_2m&models=gfs025&forecast_days=1` +
        `&precipitation_unit=inch&temperature_unit=fahrenheit&timezone=auto`
    );
    const hourly = j["hourly"] as Record<string, unknown>;
    const precip = Object.keys(hourly).filter((k) => k.startsWith("precipitation"));
    const temp = Object.keys(hourly).filter((k) => k.startsWith("temperature_2m"));
    expect(precip.length).toBeGreaterThanOrEqual(10);
    expect(temp.length).toBeGreaterThanOrEqual(10);
    expect(Array.isArray(hourly["time"])).toBe(true);
  }, 40_000);
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
  it("returns elapsed hours for verification", async () => {
    const j = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        `&hourly=precipitation&past_days=7&forecast_days=1&precipitation_unit=inch&timezone=auto`
    );
    const hourly = j["hourly"] as Record<string, unknown[]>;
    const times = hourly["time"] as string[];
    const past = times.filter((t) => new Date(t).getTime() < Date.now());
    expect(past.length).toBeGreaterThan(100);
  }, 30_000);
});
