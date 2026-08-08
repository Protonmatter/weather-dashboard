import type { MapForecastGrid } from "./types";

/** Bound in-memory reuse while allowing updated model data to arrive in long-lived tabs. */
export const MAP_FORECAST_CACHE_TTL_MS = 10 * 60_000;

export function mapForecastRefreshDelayMs(
  grid: Pick<MapForecastGrid, "fetchedAt">,
  now = Date.now()
): number {
  const age = now - grid.fetchedAt;
  if (!Number.isFinite(age) || age < 0) return 0;
  return Math.max(0, MAP_FORECAST_CACHE_TTL_MS - age);
}

export function isMapForecastFresh(
  grid: Pick<MapForecastGrid, "fetchedAt">,
  now = Date.now()
): boolean {
  return mapForecastRefreshDelayMs(grid, now) > 0;
}
