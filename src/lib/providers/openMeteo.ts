import { fetchJson } from "../http";
import { assertTimeZone, localDateKey } from "../time";
import type { Place, HourPoint, DayPoint, CurrentConditions } from "../types";

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const ENSEMBLE = "https://ensemble-api.open-meteo.com/v1/ensemble";

export interface ForecastResponse {
  timezone: string;
  timezone_abbreviation: string;
  utc_offset_seconds: number;
  current: Record<string, number>;
  hourly: {
    time: number[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability?: (number | null)[];
    precipitation: (number | null)[];
    is_day: number[];
    visibility?: (number | null)[];
  };
  minutely_15: {
    time: number[];
    rain: (number | null)[];
    showers: (number | null)[];
  };
  daily: {
    time: number[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: (number | null)[];
    sunset: (number | null)[];
    uv_index_max: (number | null)[];
  };
}

export interface ForecastBundle {
  current: CurrentConditions;
  hourly: HourPoint[];
  daily: DayPoint[];
  timezone: string;
  timezoneAbbreviation: string;
  utcOffsetSeconds: number;
  updatedAt: Date;
  /** 15-minute liquid rain plus showers through the current local-day provider timestamp, inches. */
  rainTodayIn: number;
}

/** Index of the first hour at or after "one hour ago", so "Now" is never in the future. */
function nowIndex(times: readonly number[], nowMs = Date.now()): number {
  const cutoff = nowMs - 3600e3;
  const i = times.findIndex((seconds) => seconds * 1000 >= cutoff);
  return i < 0 ? 0 : i;
}

function instant(seconds: number | null | undefined, label: string): Date | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) throw new Error(`forecast: invalid ${label}`);
  return date;
}

export function parseForecastResponse(w: ForecastResponse, nowMs = Date.now()): ForecastBundle {
  const timezone = assertTimeZone(w.timezone);
  const updatedAt = instant(w.current.time, "current time");
  if (!updatedAt) throw new Error("forecast: invalid current time");
  const start = nowIndex(w.hourly.time, nowMs);

  const hourly: HourPoint[] = w.hourly.time.slice(start).map((seconds, i) => {
    const j = start + i;
    const time = instant(seconds, "hourly time");
    if (!time) throw new Error("forecast: invalid hourly time");
    return {
      time,
      temp: Math.round(w.hourly.temperature_2m[j] ?? 0),
      code: w.hourly.weather_code[j] ?? 0,
      isDay: w.hourly.is_day[j] === 1,
      pop: w.hourly.precipitation_probability?.[j] ?? 0,
      precipitationIn: w.hourly.precipitation[j] ?? 0,
    };
  });

  const daily: DayPoint[] = w.daily.time.map((seconds, i) => {
    const date = instant(seconds, "daily time");
    if (!date) throw new Error("forecast: invalid daily time");
    return {
      date,
      low: Math.round(w.daily.temperature_2m_min[i] ?? 0),
      high: Math.round(w.daily.temperature_2m_max[i] ?? 0),
      code: w.daily.weather_code[i] ?? 0,
      uv: w.daily.uv_index_max[i] ?? 0,
      sunrise: instant(w.daily.sunrise[i], "sunrise"),
      sunset: instant(w.daily.sunset[i], "sunset"),
    };
  });

  const interval = w.current.interval ?? 900;
  const precipitationIn = w.current.precipitation ?? 0;
  const current: CurrentConditions = {
    temp: Math.round(w.current.temperature_2m ?? 0),
    feels: Math.round(w.current.apparent_temperature ?? 0),
    code: w.current.weather_code ?? 0,
    isDay: w.current.is_day === 1,
    humidity: Math.round(w.current.relative_humidity_2m ?? 0),
    wind: Math.round(w.current.wind_speed_10m ?? 0),
    visibility: (w.hourly.visibility?.[start] ?? 16000) / 1609,
    pressure: (w.current.surface_pressure ?? 1013) * 0.02953,
    precipitationIn,
    precipRateMmH: interval > 0 ? precipitationIn * 25.4 * (3600 / interval) : 0,
    cloudCover: Math.round(w.current.cloud_cover ?? 0),
  };

  const today = localDateKey(updatedAt, timezone);
  const rainTodayIn = w.minutely_15.time.reduce((total, seconds, i) => {
    const time = instant(seconds, "15-minute time");
    const intervalDay = time ? localDateKey(new Date(time.getTime() - 1), timezone) : "";
    return time && time <= updatedAt && intervalDay === today
      ? total + (w.minutely_15.rain[i] ?? 0) + (w.minutely_15.showers[i] ?? 0)
      : total;
  }, 0);

  return {
    current,
    hourly,
    daily,
    timezone,
    timezoneAbbreviation: w.timezone_abbreviation || timezone,
    utcOffsetSeconds: w.utc_offset_seconds,
    updatedAt,
    rainTodayIn,
  };
}

export async function fetchForecast(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<ForecastBundle> {
  const url =
    `${FORECAST}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,surface_pressure,precipitation,rain,showers,snowfall,cloud_cover` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,is_day,visibility` +
    `&minutely_15=rain,showers&past_minutely_15=104&forecast_minutely_15=1` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=auto&forecast_days=10`;

  const w = await fetchJson<ForecastResponse>(url, { signal, cacheTtlMs: 120_000 });
  return parseForecastResponse(w);
}

export async function fetchAqi(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<number | null> {
  const url = `${AIR}?latitude=${lat}&longitude=${lon}&current=us_aqi&timezone=auto`;
  const j = await fetchJson<{ current?: { us_aqi?: number | null } }>(url, {
    signal,
    cacheTtlMs: 600_000,
    retries: 1,
  });
  return j.current?.us_aqi ?? null;
}

export interface EnsembleMembers {
  /** Member-major hourly precipitation series, inches. */
  precip: number[][];
  /** Member-major hourly temperature series, °F. Empty if the model omits temperature. */
  temp: number[][];
}

/** Slice each member matching `prefix` to the 24h window at `start`, dropping short rows. */
function memberSeries(
  hourly: Record<string, unknown>,
  prefix: string,
  start: number
): number[][] {
  return Object.keys(hourly)
    .filter((k) => k.startsWith(prefix))
    .map((k) => (hourly[k] as (number | null)[]).slice(start, start + 24).map((v) => v ?? 0))
    .filter((m) => m.length === 24);
}

export function parseEnsembleResponse(
  value: { hourly: Record<string, unknown> },
  nowMs = Date.now()
): EnsembleMembers {
  const rawTimes = value.hourly["time"];
  if (!Array.isArray(rawTimes) || !rawTimes.every(
    (time): time is number => typeof time === "number" && Number.isFinite(time)
  )) {
    throw new Error("ensemble: expected Unix timestamps");
  }
  const start = nowIndex(rawTimes, nowMs);
  const precip = memberSeries(value.hourly, "precipitation", start);
  if (precip.length < 3) throw new Error("ensemble: too few members");
  return { precip, temp: memberSeries(value.hourly, "temperature_2m", start) };
}

/** Returns member-major hourly precipitation and temperature series. */
export async function fetchEnsemble(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<EnsembleMembers> {
  const url =
    `${ENSEMBLE}?latitude=${lat}&longitude=${lon}&hourly=precipitation,temperature_2m` +
    `&models=gfs025&forecast_days=2&precipitation_unit=inch&temperature_unit=fahrenheit` +
    `&timeformat=unixtime&timezone=auto`;

  const j = await fetchJson<{ hourly: Record<string, unknown> }>(url, {
    signal,
    timeoutMs: 15_000,
    cacheTtlMs: 600_000,
  });

  return parseEnsembleResponse(j);
}

interface GeoResponse {
  results?: Array<{
    latitude: number;
    longitude: number;
    name: string;
    admin1?: string;
    country?: string;
    country_code?: string;
    population?: number;
  }>;
}

export async function searchCities(text: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${GEO}?name=${encodeURIComponent(text)}&count=8&language=en&format=json`;
  const j = await fetchJson<GeoResponse>(url, { signal, cacheTtlMs: 300_000, retries: 1 });
  return (j.results ?? []).map((x) => ({
    lat: x.latitude,
    lon: x.longitude,
    name: x.name,
    admin: x.admin1 ?? "",
    country: x.country ?? "",
    cc: (x.country_code ?? "").toLowerCase(),
    population: x.population ?? 0,
    source: "open-meteo" as const,
  }));
}
