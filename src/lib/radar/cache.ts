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
