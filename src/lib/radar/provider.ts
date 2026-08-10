import type { Place } from "../types";
import { fetchNoaaRadar } from "./noaa";
import { fetchRainViewer } from "./rainViewer";
import type { RadarProviderId, RadarSource } from "./types";

const NOAA_CODES = new Set(["us", "pr", "vi", "gu", "mp"]);

export function radarProviderFor(place: Place): RadarProviderId {
  const countryCode = place.cc.trim().toLowerCase();
  if (!countryCode) return "unavailable";
  return NOAA_CODES.has(countryCode) ? "noaa-mrms" : "rainviewer";
}

export function radarKey(place: Place): string {
  return `${radarProviderFor(place)}:${place.lat.toFixed(3)}:${place.lon.toFixed(3)}`;
}

export async function loadRadarSource(place: Place, signal?: AbortSignal): Promise<RadarSource> {
  const provider = radarProviderFor(place);
  if (provider === "noaa-mrms") return fetchNoaaRadar(signal);
  if (provider === "rainviewer") return fetchRainViewer(signal);
  return {
    provider: "unavailable",
    frames: [],
    coverage: "unavailable",
    attribution: { label: "Radar provider unavailable", url: "" },
    fetchedAt: Date.now(),
  };
}
