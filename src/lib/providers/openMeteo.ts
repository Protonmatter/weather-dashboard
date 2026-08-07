import { fetchJson } from "../http";
import type { Place, HourPoint, DayPoint, CurrentConditions } from "../types";

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const ENSEMBLE = "https://ensemble-api.open-meteo.com/v1/ensemble";

interface ForecastResponse {
  current: Record<string, number>;
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability?: (number | null)[];
    is_day: number[];
    visibility?: (number | null)[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: (number | null)[];
  };
}

export interface ForecastBundle {
  current: CurrentConditions;
  hourly: HourPoint[];
  daily: DayPoint[];
}

/** Index of the first hour at or after "one hour ago", so "Now" is never in the future. */
function nowIndex(times: readonly string[]): number {
  const cutoff = Date.now() - 3600e3;
  const i = times.findIndex((t) => new Date(t).getTime() >= cutoff);
  return i < 0 ? 0 : i;
}

export async function fetchForecast(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<ForecastBundle> {
  const url =
    `${FORECAST}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,surface_pressure` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,is_day,visibility` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=10`;

  const w = await fetchJson<ForecastResponse>(url, { signal, cacheTtlMs: 120_000 });
  const start = nowIndex(w.hourly.time);

  // Keep the full fetched axis (~240h) — consumers slice what they need (RFC 0003 §2.4).
  const hourly: HourPoint[] = w.hourly.time.slice(start).map((t, i) => {
    const j = start + i;
    return {
      time: new Date(t),
      temp: Math.round(w.hourly.temperature_2m[j] ?? 0),
      code: w.hourly.weather_code[j] ?? 0,
      isDay: w.hourly.is_day[j] === 1,
      pop: w.hourly.precipitation_probability?.[j] ?? 0,
    };
  });

  const daily: DayPoint[] = w.daily.time.map((t, i) => ({
    date: new Date(`${t}T12:00:00`),
    low: Math.round(w.daily.temperature_2m_min[i] ?? 0),
    high: Math.round(w.daily.temperature_2m_max[i] ?? 0),
    code: w.daily.weather_code[i] ?? 0,
    uv: w.daily.uv_index_max[i] ?? 0,
    sunrise: w.daily.sunrise[i] ? new Date(w.daily.sunrise[i]!) : null,
    sunset: w.daily.sunset[i] ? new Date(w.daily.sunset[i]!) : null,
  }));

  const current: CurrentConditions = {
    temp: Math.round(w.current.temperature_2m ?? 0),
    feels: Math.round(w.current.apparent_temperature ?? 0),
    code: w.current.weather_code ?? 0,
    isDay: w.current.is_day === 1,
    humidity: Math.round(w.current.relative_humidity_2m ?? 0),
    wind: Math.round(w.current.wind_speed_10m ?? 0),
    visibility: (w.hourly.visibility?.[start] ?? 16000) / 1609,
    pressure: (w.current.surface_pressure ?? 1013) * 0.02953,
  };

  return { current, hourly, daily };
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

/** Returns member-major hourly precipitation and temperature series. */
export async function fetchEnsemble(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<EnsembleMembers> {
  const url =
    `${ENSEMBLE}?latitude=${lat}&longitude=${lon}&hourly=precipitation,temperature_2m` +
    `&models=gfs025&forecast_days=2&precipitation_unit=inch&temperature_unit=fahrenheit&timezone=auto`;

  const j = await fetchJson<{ hourly: Record<string, unknown> }>(url, {
    signal,
    timeoutMs: 15_000,
    cacheTtlMs: 600_000,
  });

  const times = j.hourly["time"] as string[] | undefined;
  if (!times) throw new Error("ensemble: no time axis");
  const start = nowIndex(times);

  const precip = memberSeries(j.hourly, "precipitation", start);
  if (precip.length < 3) throw new Error("ensemble: too few members");

  return { precip, temp: memberSeries(j.hourly, "temperature_2m", start) };
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
