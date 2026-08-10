import { describe, expect, it } from "vitest";
import { parseEnsembleResponse, parseForecastResponse } from "../providers/openMeteo";

const response = () => ({
  timezone: "America/Los_Angeles",
  timezone_abbreviation: "PDT",
  utc_offset_seconds: -25_200,
  current: {
    time: 1_786_291_200,
    interval: 900,
    temperature_2m: 67,
    apparent_temperature: 63,
    relative_humidity_2m: 84,
    weather_code: 63,
    is_day: 1,
    wind_speed_10m: 6,
    surface_pressure: 1012,
    precipitation: 0.04,
    rain: 0.04,
    showers: 0,
    snowfall: 0,
    cloud_cover: 92,
  },
  hourly: {
    time: [1_786_287_600, 1_786_291_200, 1_786_294_800],
    temperature_2m: [66, 67, 68],
    weather_code: [61, 63, 3],
    precipitation_probability: [70, 80, 20],
    precipitation: [0.1, 0.2, 0.5],
    is_day: [1, 1, 1],
    visibility: [12_000, 13_000, 16_000],
  },
  daily: {
    time: [1_786_258_800],
    weather_code: [63],
    temperature_2m_max: [72],
    temperature_2m_min: [54],
    sunrise: [1_786_282_200],
    sunset: [1_786_327_200],
    uv_index_max: [3],
  },
});

describe("Open-Meteo point forecast parser", () => {
  it("retains location time and precipitation context", () => {
    const parsed = parseForecastResponse(response(), 1_786_291_200_000);

    expect(parsed.timezone).toBe("America/Los_Angeles");
    expect(parsed.timezoneAbbreviation).toBe("PDT");
    expect(parsed.utcOffsetSeconds).toBe(-25_200);
    expect(parsed.updatedAt.toISOString()).toBe("2026-08-09T16:00:00.000Z");
    expect(parsed.current.precipitationIn).toBe(0.04);
    expect(parsed.current.precipRateMmH).toBeCloseTo(4.064, 3);
    expect(parsed.current.cloudCover).toBe(92);
    expect(parsed.rainTodayIn).toBeCloseTo(0.3, 8);
  });

  it("keeps hourly instants while excluding stale history from consumers", () => {
    const parsed = parseForecastResponse(response(), 1_786_291_200_000);

    expect(parsed.hourly.map((point) => point.time.toISOString())).toEqual([
      "2026-08-09T15:00:00.000Z",
      "2026-08-09T16:00:00.000Z",
      "2026-08-09T17:00:00.000Z",
    ]);
    expect(parsed.daily[0]?.sunrise?.toISOString()).toBe("2026-08-09T13:30:00.000Z");
  });

  it("attributes a midnight-ending precipitation interval to the previous local day", () => {
    const midnight = Date.parse("2026-08-10T07:00:00Z") / 1000;
    const fixture = response();
    fixture.current.time = midnight + 5_400;
    fixture.hourly.time = [midnight - 3_600, midnight, midnight + 3_600];
    fixture.hourly.precipitation = [0.1, 0.2, 0.3];

    const parsed = parseForecastResponse(fixture, (midnight + 5_400) * 1000);

    expect(parsed.rainTodayIn).toBeCloseTo(0.3, 8);
  });

  it("fails closed on an invalid provider timezone", () => {
    const malformed = response();
    malformed.timezone = "Mars/Olympus_Mons";

    expect(() => parseForecastResponse(malformed, 1_786_291_200_000)).toThrow(
      "forecast: invalid timezone"
    );
  });
});

describe("Open-Meteo ensemble parser", () => {
  it("requires absolute Unix timestamps for a viewer-timezone-independent horizon", () => {
    const times = Array.from({ length: 24 }, (_, index) => 1_786_287_600 + index * 3_600);
    const hourly: Record<string, unknown> = { time: times };
    for (let member = 0; member < 3; member++) {
      hourly[`precipitation_member${member}`] = times.map(() => member * 0.01);
      hourly[`temperature_2m_member${member}`] = times.map(() => 60 + member);
    }

    const parsed = parseEnsembleResponse({ hourly }, 1_786_291_200_000);
    expect(parsed.precip).toHaveLength(3);
    expect(parsed.precip[2]?.[0]).toBe(0.02);

    expect(() => parseEnsembleResponse({
      hourly: { ...hourly, time: times.map((seconds) => new Date(seconds * 1000).toISOString().slice(0, 16)) },
    }, 1_786_291_200_000)).toThrow(/Unix timestamps/);
  });
});
