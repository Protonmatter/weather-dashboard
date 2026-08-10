import { ensembleStats, synthMembers } from "./ensemble";
import { dateAtLocalTime } from "./time";
import type { WeatherBundle } from "./types";

const FALLBACK_TIMEZONE = "America/Los_Angeles";

const HOUR_TEMPS = [67, 66, 65, 66, 68, 70, 69, 66, 62, 59, 57, 56, 55, 54, 54, 54, 54, 55, 56, 58, 61, 64, 68, 71];
const HOUR_CODES = [61, 61, 61, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0];
const HOUR_POP = [72, 65, 58, 40, 24, 16, 10, 8, 6, 5, 4, 4, 3, 3, 4, 5, 6, 5, 4, 2, 2, 1, 1, 0];
const DAY_ROWS: ReadonlyArray<readonly [number, number, number]> = [
  [54, 72, 61], [53, 73, 3], [54, 75, 0], [55, 76, 0], [56, 74, 3],
  [55, 77, 0], [56, 78, 0], [57, 76, 3], [56, 75, 0], [57, 77, 0],
];

/**
 * Sample forecast so the UI is never empty on a cold or offline start.
 * `live: false` propagates to the footer — this is always labelled as sample data.
 */
export function fallbackBundle(): WeatherBundle {
  const now = new Date();
  const base = new Date(now);
  base.setMinutes(0, 0, 0);

  const hourly = HOUR_TEMPS.map((temp, i) => {
    const time = new Date(base.getTime() + i * 3600e3);
    const h = time.getHours();
    return {
      time,
      temp,
      code: HOUR_CODES[i] ?? 0,
      isDay: h >= 7 && h < 18,
      pop: HOUR_POP[i] ?? 0,
      precipitationIn: i < 3 ? 0.03 : 0,
    };
  });

  const daily = DAY_ROWS.map(([low, high, code], i) => {
    const date = dateAtLocalTime(now, FALLBACK_TIMEZONE, 12, 0, i);
    return {
      date,
      low,
      high,
      code,
      uv: 3,
      sunrise: dateAtLocalTime(now, FALLBACK_TIMEZONE, 7, 4, i),
      sunset: dateAtLocalTime(now, FALLBACK_TIMEZONE, 17, 12, i),
    };
  });

  return {
    place: { lat: 37.4419, lon: -122.143, name: "Palo Alto", admin: "California", country: "United States", cc: "us" },
    current: {
      temp: 67,
      feels: 63,
      code: 61,
      isDay: true,
      humidity: 84,
      wind: 6,
      visibility: 7.2,
      pressure: 29.9,
      precipitationIn: 0.03,
      precipRateMmH: 3.048,
      cloudCover: 88,
    },
    hourly,
    daily,
    aqi: 28,
    ensemble: { ...ensembleStats(synthMembers(HOUR_POP)), source: "modeled spread", live: false },
    live: false,
    timezone: FALLBACK_TIMEZONE,
    timezoneAbbreviation: "PST/PDT",
    utcOffsetSeconds: -28_800,
    updatedAt: now,
    rainTodayIn: 0.09,
  };
}
