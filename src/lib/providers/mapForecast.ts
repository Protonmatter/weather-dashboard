import { fetchJson, HttpError } from "../http";
import { weatherBaseUrls } from "../map/config";
import type { MapForecastGrid, MapForecastPoint, MapGridSpec } from "../map/types";

interface RawMapLocation {
  latitude?: number;
  longitude?: number;
  hourly_units?: Record<string, string>;
  hourly?: Record<string, unknown>;
}

type JsonFetcher = <T>(url: string, opts: {
  signal?: AbortSignal;
  timeoutMs: number;
  retries: number;
  cacheTtlMs: number;
}) => Promise<T>;

const VARIABLES = [
  "temperature_2m",
  "pressure_msl",
  "precipitation",
  "wind_speed_10m",
  "wind_direction_10m",
] as const;

const fixed = (value: number): string => value.toFixed(4);

export function buildMapForecastUrl(baseUrl: string, spec: MapGridSpec): string {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/v1/gfs`);
  url.searchParams.set("latitude", spec.points.map((p) => fixed(p.lat)).join(","));
  url.searchParams.set("longitude", spec.points.map((p) => fixed(p.lon)).join(","));
  url.searchParams.set("hourly", VARIABLES.join(","));
  url.searchParams.set("models", "gfs_global");
  url.searchParams.set("forecast_hours", "48");
  url.searchParams.set("timezone", "GMT");
  return url.toString();
}

function numericSeries(value: unknown, name: string, length: number): Array<number | null> {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`map forecast field ${name} has the wrong length`);
  }
  return value.map((item) => {
    if (item == null) return null;
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new Error(`map forecast field ${name} contains an invalid value`);
    }
    return item;
  });
}

const unitContains = (units: Record<string, string>, field: string, expected: string): void => {
  if (!units[field]?.includes(expected)) {
    throw new Error(`map forecast field ${field} has an unexpected unit`);
  }
};

export function parseMapForecastResponse(
  raw: unknown,
  spec: MapGridSpec,
  fetchedAt = Date.now()
): MapForecastGrid {
  if (!Array.isArray(raw) || raw.length !== spec.points.length) {
    throw new Error("map forecast response count does not match the requested grid");
  }

  let canonicalTimes: string[] | null = null;
  const points: MapForecastPoint[] = raw.map((entry, index) => {
    const location = entry as RawMapLocation;
    if (!location || typeof location !== "object" || !location.hourly || !location.hourly_units) {
      throw new Error("map forecast response is missing hourly data");
    }
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
      throw new Error("map forecast response has invalid resolved coordinates");
    }
    const timesRaw = location.hourly["time"];
    if (!Array.isArray(timesRaw) || timesRaw.length !== 48 || timesRaw.some((t) => typeof t !== "string")) {
      throw new Error("map forecast time axis must contain 48 timestamps");
    }
    const times = timesRaw as string[];
    if (canonicalTimes && times.some((time, i) => time !== canonicalTimes![i])) {
      throw new Error("map forecast locations have misaligned time axes");
    }
    canonicalTimes ??= [...times];

    unitContains(location.hourly_units, "temperature_2m", "C");
    unitContains(location.hourly_units, "pressure_msl", "hPa");
    unitContains(location.hourly_units, "precipitation", "mm");
    unitContains(location.hourly_units, "wind_speed_10m", "km/h");
    unitContains(location.hourly_units, "wind_direction_10m", "°");

    return {
      requested: spec.points[index]!,
      resolved: { lat: location.latitude!, lon: location.longitude! },
      temperatureC: numericSeries(location.hourly["temperature_2m"], "temperature_2m", 48),
      pressureHpa: numericSeries(location.hourly["pressure_msl"], "pressure_msl", 48),
      precipitationMm: numericSeries(location.hourly["precipitation"], "precipitation", 48),
      windKmh: numericSeries(location.hourly["wind_speed_10m"], "wind_speed_10m", 48),
      windFromDeg: numericSeries(location.hourly["wind_direction_10m"], "wind_direction_10m", 48),
    };
  });

  return {
    key: spec.key,
    rows: spec.rows,
    cols: spec.cols,
    times: canonicalTimes ?? [],
    points,
    fetchedAt,
  };
}

const mayFallback = (error: unknown): boolean =>
  !(error instanceof HttpError) || error.status === undefined || error.status === 429 || error.status >= 500;

export async function fetchMapForecast(
  spec: MapGridSpec,
  signal?: AbortSignal,
  bases = weatherBaseUrls(),
  fetcher: JsonFetcher = fetchJson
): Promise<MapForecastGrid> {
  let lastError: unknown;
  for (let index = 0; index < bases.length; index++) {
    let raw: unknown;
    try {
      raw = await fetcher<unknown>(buildMapForecastUrl(bases[index]!, spec), {
        signal,
        timeoutMs: 15_000,
        retries: 1,
        cacheTtlMs: 0,
      });
    } catch (error) {
      // fetchJson uses AbortError for both its own timeout and caller cancellation.
      // Only the caller's signal is authoritative; an internal timeout may fall back.
      if (signal?.aborted) throw error;
      lastError = error;
      if (!mayFallback(error) || index === bases.length - 1) break;
      continue;
    }

    // A successful transport with an invalid schema is not a transient proxy failure.
    // Fail closed instead of silently switching sources and masking contract drift.
    return parseMapForecastResponse(raw, spec);
  }
  throw lastError instanceof Error ? lastError : new Error("map forecast request failed");
}
