import type { RadarSource } from "./types";

/** Match the provider catalogue cache while ensuring long-lived tabs revalidate. */
export const RADAR_CATALOGUE_TTL_MS = 2 * 60_000;

export function radarRefreshDelayMs(
  source: Pick<RadarSource, "fetchedAt">,
  now = Date.now()
): number {
  const age = now - source.fetchedAt;
  if (!Number.isFinite(age) || age < 0) return 0;
  return Math.max(0, RADAR_CATALOGUE_TTL_MS - age);
}

/** Null disables refresh; zero is a valid immediate revalidation delay. */
export function radarRefreshTimerDelayMs(
  source: Pick<RadarSource, "fetchedAt" | "provider">,
  now = Date.now()
): number | null {
  if (source.provider === "unavailable" || !Number.isFinite(source.fetchedAt)) return null;
  if (source.fetchedAt > now) return RADAR_CATALOGUE_TTL_MS;
  return radarRefreshDelayMs(source, now);
}
