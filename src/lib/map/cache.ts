import type { MapForecastGrid } from "./types";

/** Bound in-memory reuse while allowing updated model data to arrive in long-lived tabs. */
export const MAP_FORECAST_CACHE_TTL_MS = 10 * 60_000;

export function isMapForecastFresh(
  grid: Pick<MapForecastGrid, "fetchedAt">,
  now = Date.now()
): boolean {
  const age = now - grid.fetchedAt;
  return Number.isFinite(age) && age >= 0 && age < MAP_FORECAST_CACHE_TTL_MS;
}
