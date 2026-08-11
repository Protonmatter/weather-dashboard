import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetHttpState } from "../../http";
import type { Place } from "../../types";
import {
  comparisonUrl,
  fetchComparison,
  parseComparisonResponse,
} from "../provider";

const NOW_MS = Date.parse("2026-08-10T16:00:00Z");
const NOW_SECONDS = NOW_MS / 1000;
const PALO_ALTO: Place = {
  lat: 37.4419,
  lon: -122.143,
  name: "Palo Alto",
  admin: "California",
  country: "United States",
  cc: "us",
};

function response() {
  return {
    latitude: 37.44,
    longitude: -122.14,
    timezone: "America/Los_Angeles",
    current_units: {
      time: "unixtime",
      temperature_2m: "°F",
      apparent_temperature: "°F",
      relative_humidity_2m: "%",
      weather_code: "wmo code",
      is_day: "",
    },
    current: {
      time: NOW_SECONDS,
      temperature_2m: 72,
      apparent_temperature: 71,
      relative_humidity_2m: 48,
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
      time: Array.from({ length: 6 }, (_, index) => NOW_SECONDS + index * 3600),
      temperature_2m: [72, 73, 74, 73, 71, 69],
      weather_code: [1, 1, 2, 2, 3, 3],
      precipitation_probability: [0, 0, 10, 20, 30, 20],
      precipitation: [0, 0, 0, 0.01, 0.02, 0],
      is_day: [1, 1, 1, 1, 1, 0],
    },
    minutely_15_units: { time: "unixtime", rain: "inch", showers: "inch" },
    minutely_15: {
      time: Array.from({ length: 105 }, (_, index) => NOW_SECONDS - (104 - index) * 900),
      rain: Array.from({ length: 105 }, (_, index): number => index >= 101 ? 0.05 : 0),
      showers: Array.from({ length: 105 }, (_, index): number => index >= 101 ? 0.025 : 0),
    },
    daily_units: {
      time: "unixtime",
      weather_code: "wmo code",
      temperature_2m_max: "°F",
      temperature_2m_min: "°F",
      uv_index_max: "",
    },
    daily: {
      time: [1_786_282_800, 1_786_369_200, 1_786_455_600],
      weather_code: [1, 2, 3],
      temperature_2m_max: [78, 76, 74],
      temperature_2m_min: [58, 59, 57],
      uv_index_max: [6, 5, 4],
    },
  };
}

beforeEach(() => __resetHttpState());
afterEach(() => vi.unstubAllGlobals());

describe("comparison response parser", () => {
  it("returns location-local current, six-hour, three-day, and elapsed-rain data", () => {
    const summary = parseComparisonResponse(response(), PALO_ALTO, NOW_MS);

    expect(summary.place).toEqual(PALO_ALTO);
    expect(summary.timezone).toBe("America/Los_Angeles");
    expect(summary.updatedAt.toISOString()).toBe("2026-08-10T16:00:00.000Z");
    expect(summary.current).toEqual({
      temperatureF: 72,
      apparentF: 71,
      code: 1,
      isDay: true,
      humidityPercent: 48,
    });
    expect(summary.today).toEqual({ lowF: 58, highF: 78, uvMax: 6, rainSoFarIn: 0.3 });
    expect(summary.hourly).toHaveLength(6);
    expect(summary.hourly[3]).toMatchObject({ tempF: 73, code: 2, pop: 20, precipitationIn: 0.01 });
    expect(summary.daily).toEqual([
      { date: new Date(1_786_282_800_000), lowF: 58, highF: 78, code: 1 },
      { date: new Date(1_786_369_200_000), lowF: 59, highF: 76, code: 2 },
      { date: new Date(1_786_455_600_000), lowF: 57, highF: 74, code: 3 },
    ]);
  });

  it("excludes future and prior-local-day rain intervals", () => {
    const fixture = response();
    fixture.minutely_15.time = [
      Date.parse("2026-08-10T06:45:00Z") / 1000,
      Date.parse("2026-08-10T07:00:00Z") / 1000,
      Date.parse("2026-08-10T07:15:00Z") / 1000,
      NOW_SECONDS + 900,
    ];
    fixture.minutely_15.rain = [0.5, 0.25, 0.1, 4];
    fixture.minutely_15.showers = [0, 0, 0.05, 4];

    expect(parseComparisonResponse(fixture, PALO_ALTO, NOW_MS).today.rainSoFarIn).toBeCloseTo(0.15, 8);
  });

  it("does not treat hourly total precipitation as liquid rain today", () => {
    const fixture = response();
    fixture.hourly.precipitation = [1, 1, 1, 1, 1, 1];
    fixture.minutely_15.rain.fill(0);
    fixture.minutely_15.showers.fill(0);

    expect(parseComparisonResponse(fixture, PALO_ALTO, NOW_MS).today.rainSoFarIn).toBe(0);
  });

  it("rejects invalid timezones, units, non-finite numbers, and short axes", () => {
    const badTimezone = response();
    badTimezone.timezone = "Mars/Olympus";
    expect(() => parseComparisonResponse(badTimezone, PALO_ALTO, NOW_MS)).toThrow(/timezone/i);

    const badUnits = response();
    badUnits.hourly_units.temperature_2m = "°C";
    expect(() => parseComparisonResponse(badUnits, PALO_ALTO, NOW_MS)).toThrow(/unit/i);

    const badNumber = response();
    badNumber.current.temperature_2m = Number.NaN;
    expect(() => parseComparisonResponse(badNumber, PALO_ALTO, NOW_MS)).toThrow(/temperature/i);

    const shortHours = response();
    shortHours.hourly.time.pop();
    expect(() => parseComparisonResponse(shortHours, PALO_ALTO, NOW_MS)).toThrow(/hourly/i);
  });
});

describe("comparison request boundary", () => {
  it("requests only the approved point-summary shape", () => {
    const url = new URL(comparisonUrl(PALO_ALTO));

    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("forecast_hours")).toBe("6");
    expect(url.searchParams.get("forecast_days")).toBe("3");
    expect(url.searchParams.get("past_minutely_15")).toBe("104");
    expect(url.searchParams.get("forecast_minutely_15")).toBe("1");
    expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");
    expect(url.searchParams.get("precipitation_unit")).toBe("inch");
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.has("models")).toBe(false);
    expect(url.searchParams.has("us_aqi")).toBe(false);
    expect(url.searchParams.has("pressure_msl")).toBe(false);
  });

  it("revalidates instead of reusing the shared HTTP cache", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(response()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await fetchComparison(PALO_ALTO);
    await fetchComparison(PALO_ALTO);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
