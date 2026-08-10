import type { Place } from "../types";
import { fetchNoaaRadar } from "./noaa";
import { fetchRainViewer } from "./rainViewer";
import type { RadarProviderId, RadarSource } from "./types";

const NOAA_CODES = new Set(["us", "pr", "vi", "gu", "mp"]);

export function radarProviderFor(place: Place): RadarProviderId {
  return NOAA_CODES.has(place.cc.toLowerCase()) ? "noaa-mrms" : "rainviewer";
}

export function radarKey(place: Place): string {
  return `${radarProviderFor(place)}:${place.lat.toFixed(3)}:${place.lon.toFixed(3)}`;
}

export async function loadRadarSource(place: Place, signal?: AbortSignal): Promise<RadarSource> {
  return radarProviderFor(place) === "noaa-mrms"
    ? fetchNoaaRadar(signal)
    : fetchRainViewer(signal);
}
