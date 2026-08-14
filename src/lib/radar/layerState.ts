import type { MapViewport } from "../map/types";
import type { Place } from "../types";
import type { RadarProviderId } from "./types";

export interface RadarLayerIdentity {
  contextKey: string;
  sourceKey: string;
  frameId: string;
}

export function radarLayerContextKey(
  place: Place,
  viewport: MapViewport,
  provider: RadarProviderId
): string {
  return [
    provider,
    place.lat,
    place.lon,
    viewport.center.lat,
    viewport.center.lon,
    viewport.zoom,
    viewport.width,
    viewport.height,
  ].join(":");
}

export function matchesRadarLayerIdentity(
  event: RadarLayerIdentity,
  current: RadarLayerIdentity | null
): boolean {
  return current !== null &&
    event.contextKey === current.contextKey &&
    event.sourceKey === current.sourceKey &&
    event.frameId === current.frameId;
}

export function shouldDisplayRetainedRadarLayer(
  loadedContextKey: string | null,
  currentContextKey: string,
  clearRetained: boolean,
  loadedSourceKey: string | null,
  currentSourceKey: string
): boolean {
  return !clearRetained &&
    loadedContextKey === currentContextKey &&
    loadedSourceKey === currentSourceKey;
}
