import { fetchJson } from "../http";
import { precipitationWindow } from "../ensemble";
import { assertTimeZone, localDateKey } from "../time";
import type { Place, HourPoint, DayPoint, CurrentConditions } from "../types";

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const ENSEMBLE = "https://ensemble-api.open-meteo.com/v1/ensemble";

export interface ForecastResponse {
  timezone: string;
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
    uv_index_max?: (number | null)[];
  };
}

export interface ForecastBundle {
  current: CurrentConditions;
  hourly: HourPoint[];
  daily: DayPoint[];
  timezone: string;
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

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`forecast: invalid ${label}`);
  return value;
}

function optionalNumber(value: unknown, label: string): number | null {
  return value == null ? null : finiteNumber(value, label);
}

function validateTimeAxis(times: readonly number[], label: string): void {
  if (!Array.isArray(times) || !times.length || times.some((time, index) =>
    !instant(time, label) || (index > 0 && time <= times[index - 1]!)
  )) throw new Error(`forecast: invalid ${label} axis`);
}

export function parseForecastResponse(
  w: ForecastResponse,
  nowMs = Date.now(),
  calendarReferenceMs = nowMs
): ForecastBundle {
  const timezone = assertTimeZone(w.timezone);
  const updatedAt = instant(w.current.time, "current time");
  if (!updatedAt) throw new Error("forecast: invalid current time");
  validateTimeAxis(w.hourly.time, "hourly time");
  validateTimeAxis(w.daily.time, "daily time");
  validateTimeAxis(w.minutely_15.time, "15-minute time");
  const start = nowIndex(w.hourly.time, nowMs);

  const hourly: HourPoint[] = w.hourly.time.slice(start).map((seconds, i) => {
    const j = start + i;
    const time = instant(seconds, "hourly time");
    if (!time) throw new Error("forecast: invalid hourly time");
    return {
      time,
      temp: Math.round(finiteNumber(w.hourly.temperature_2m[j], "hourly temperature")),
      code: finiteNumber(w.hourly.weather_code[j], "hourly weather code"),
      isDay: finiteNumber(w.hourly.is_day[j], "hourly daylight") === 1,
      pop: finiteNumber(w.hourly.precipitation_probability?.[j], "hourly precipitation probability"),
      precipitationIn: finiteNumber(w.hourly.precipitation[j], "hourly precipitation"),
    };
  });

  const daily: DayPoint[] = w.daily.time.map((seconds, i) => {
    const date = instant(seconds, "daily time");
    if (!date) throw new Error("forecast: invalid daily time");
    return {
      date,
      low: Math.round(finiteNumber(w.daily.temperature_2m_min[i], "daily minimum temperature")),
      high: Math.round(finiteNumber(w.daily.temperature_2m_max[i], "daily maximum temperature")),
      code: finiteNumber(w.daily.weather_code[i], "daily weather code"),
      uv: optionalNumber(w.daily.uv_index_max?.[i], "daily UV"),
      sunrise: instant(w.daily.sunrise[i], "sunrise"),
      sunset: instant(w.daily.sunset[i], "sunset"),
    };
  });

  // Older provider responses omit interval; current data uses 15-minute totals.
  const interval = finiteNumber(w.current.interval ?? 900, "current interval");
  const precipitationIn = finiteNumber(w.current.precipitation, "current precipitation");
  const visibilityMetres = optionalNumber(w.hourly.visibility?.[start], "visibility");
  const current: CurrentConditions = {
    temp: Math.round(finiteNumber(w.current.temperature_2m, "current temperature")),
    feels: Math.round(finiteNumber(w.current.apparent_temperature, "current apparent temperature")),
    code: finiteNumber(w.current.weather_code, "current weather code"),
    isDay: finiteNumber(w.current.is_day, "current daylight") === 1,
    humidity: Math.round(finiteNumber(w.current.relative_humidity_2m, "current humidity")),
    wind: Math.round(finiteNumber(w.current.wind_speed_10m, "current wind")),
    visibility: visibilityMetres === null ? null : visibilityMetres / 1609,
    pressure: finiteNumber(w.current.surface_pressure, "current pressure") * 0.02953,
    precipitationIn,
    precipRateMmH: interval > 0 ? precipitationIn * 25.4 * (3600 / interval) : 0,
    cloudCover: Math.round(finiteNumber(w.current.cloud_cover, "current cloud cover")),
  };

  // The shared acquisition reference aligns hourly sources, but the response may
  // arrive after local midnight. Rain today follows the calendar at retrieval.
  const today = localDateKey(new Date(calendarReferenceMs), timezone);
  const rainTodayIn = w.minutely_15.time.reduce((total, seconds, i) => {
    const time = instant(seconds, "15-minute time");
    const intervalDay = time ? localDateKey(new Date(time.getTime() - 1), timezone) : "";
    return time && time <= updatedAt && intervalDay === today
      ? total + finiteNumber(w.minutely_15.rain[i], "elapsed rain") + finiteNumber(w.minutely_15.showers[i], "elapsed showers")
      : total;
  }, 0);

  return {
    current,
    hourly,
    daily,
    timezone,
    updatedAt,
    rainTodayIn,
  };
}

export async function fetchForecast(
  lat: number,
  lon: number,
  signal?: AbortSignal,
  referenceMs = Date.now()
): Promise<ForecastBundle> {
  const url =
    `${FORECAST}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,surface_pressure,precipitation,rain,showers,snowfall,cloud_cover` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,is_day,visibility` +
    `&minutely_15=rain,showers&past_minutely_15=104&forecast_minutely_15=1` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=auto&forecast_days=10`;

  const w = await fetchJson<ForecastResponse>(url, { signal });
  return parseForecastResponse(w, referenceMs, Date.now());
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
  validTimes: Date[];
  windowStart: Date;
  windowEnd: Date;
  /** Separate instantaneous-temperature axis used by the point hourly strip. */
  tempForHours?: number[][];
}

/** Join complete member rows to an explicit absolute-time axis; never impute missing data. */
function memberSeries(
  hourly: Record<string, unknown>,
  prefix: string,
  indices: readonly number[],
  sourceLength: number
): number[][] {
  if (indices.length !== 24 || indices.some(index => index < 0)) return [];
  const keyPattern = new RegExp(`^${prefix}(?:_member\\d+)?$`);
  return Object.keys(hourly)
    .filter(key => keyPattern.test(key))
    .sort()
    .flatMap(key => {
      const raw = hourly[key];
      if (!Array.isArray(raw) || raw.length !== sourceLength) return [];
      const selected: unknown[] = indices.map(index => raw[index]);
      if (!selected.every((value): value is number => typeof value === "number" &&
        Number.isFinite(value) && (prefix !== "precipitation" || value >= 0))) return [];
      return [selected];
    });
}

export function parseEnsembleResponse(
  value: { hourly: Record<string, unknown> },
  nowMs = Date.now(),
  temperatureTimes?: readonly Date[]
): EnsembleMembers {
  const rawTimes = value?.hourly?.["time"];
  if (!Array.isArray(rawTimes) || !rawTimes.every(
    (time): time is number => typeof time === "number" && Number.isFinite(time)
  )) {
    throw new Error("ensemble: expected Unix timestamps");
  }
  if (rawTimes.some((time, index) => index > 0 && time - rawTimes[index - 1]! !== 3600)) {
    throw new Error("ensemble: invalid hourly time axis");
  }
  const window = precipitationWindow(nowMs, rawTimes.map(time => new Date(time * 1000)));
  const timeIndex = new Map(rawTimes.map((time, index) => [time * 1000, index]));
  const indicesFor = (times: readonly Date[]): number[] => times.map(time => timeIndex.get(time.getTime()) ?? -1);
  const indices = indicesFor(window.validTimes);
  if (indices.some(index => index < 0)) throw new Error("ensemble: incomplete future window");
  const precip = memberSeries(value.hourly, "precipitation", indices, rawTimes.length);
  if (precip.length < 3) throw new Error("ensemble: too few members");
  const temperatures = (indices: readonly number[]): number[][] => {
    const members = memberSeries(value.hourly, "temperature_2m", indices, rawTimes.length);
    return members.length >= 3 ? members : [];
  };
  return {
    ...window,
    precip,
    temp: temperatures(indices),
    ...(temperatureTimes ? { tempForHours: temperatures(indicesFor(temperatureTimes)) } : {}),
  };
}

/** Returns member-major hourly precipitation and temperature series. */
export async function fetchEnsemble(
  lat: number,
  lon: number,
  signal?: AbortSignal,
  referenceMs = Date.now(),
  temperatureTimes?: readonly Date[]
): Promise<EnsembleMembers> {
  const url =
    `${ENSEMBLE}?latitude=${lat}&longitude=${lon}&hourly=precipitation,temperature_2m` +
    `&models=gfs025&forecast_days=3&precipitation_unit=inch&temperature_unit=fahrenheit` +
    `&timeformat=unixtime&timezone=auto`;

  const j = await fetchJson<{ hourly: Record<string, unknown> }>(url, {
    signal,
    timeoutMs: 15_000,
    cacheTtlMs: 600_000,
  });

  return parseEnsembleResponse(j, referenceMs, temperatureTimes);
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
