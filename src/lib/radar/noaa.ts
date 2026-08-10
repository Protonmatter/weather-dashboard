import { fetchJsonWithMetadata } from "../http";
import { screenToGeo, worldSize } from "../map/mercator";
import type { MapViewport } from "../map/types";
import type { RadarFrame, RadarSource } from "./types";

const SERVICE = "https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer";

const NOAA_ATTRIBUTION = {
  label: "NOAA / NWS MRMS",
  url: "https://www.weather.gov/gis/cloudgiswebservices",
};

interface NoaaFeature {
  attributes?: { idp_validtime?: unknown };
}

export function parseNoaaFrames(value: unknown, fetchedAt = Date.now()): RadarSource {
  const features = (value as { features?: unknown }).features;
  if (!Array.isArray(features)) throw new Error("NOAA radar returned an invalid frame catalogue");
  const frames = new Map<number, RadarFrame>();
  for (const feature of features as NoaaFeature[]) {
    const time = feature.attributes?.idp_validtime;
    if (typeof time !== "number" || !Number.isFinite(time) || time <= 0 || frames.has(time)) continue;
    frames.set(time, { id: String(time), validAt: new Date(time) });
  }
  const sorted = [...frames.values()].sort((a, b) => a.validAt.getTime() - b.validAt.getTime());
  return {
    provider: "noaa-mrms",
    frames: sorted,
    coverage: sorted.length ? "available" : "unavailable",
    attribution: NOAA_ATTRIBUTION,
    fetchedAt,
  };
}

export function noaaCatalogueUrl(): string {
  const url = new URL(`${SERVICE}/query`);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "idp_validtime");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("orderByFields", "idp_validtime ASC");
  url.searchParams.set("resultRecordCount", "1000");
  url.searchParams.set("f", "json");
  return url.toString();
}

export async function fetchNoaaRadar(signal?: AbortSignal): Promise<RadarSource> {
  const result = await fetchJsonWithMetadata<unknown>(noaaCatalogueUrl(), {
    signal,
    retries: 1,
    timeoutMs: 10_000,
    cacheTtlMs: 120_000,
    circuitBreakerScope: "radar-noaa",
  });
  return parseNoaaFrames(result.value, result.fetchedAt);
}

function webMercator(point: { lat: number; lon: number }): { x: number; y: number } {
  const radius = 6_378_137;
  const x = radius * point.lon * Math.PI / 180;
  const lat = Math.min(85.0511, Math.max(-85.0511, point.lat));
  const y = radius * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  return { x, y };
}

export interface NoaaImageLayer {
  src: string;
  left: number;
  width: number;
}

function noaaExportUrl(
  frame: RadarFrame,
  west: number,
  east: number,
  north: number,
  south: number,
  width: number,
  height: number
): string {
  const northWest = webMercator({ lat: north, lon: west });
  const southEast = webMercator({ lat: south, lon: east });
  const url = new URL(`${SERVICE}/exportImage`);
  url.searchParams.set("bbox", [northWest.x, southEast.y, southEast.x, northWest.y].join(","));
  url.searchParams.set("bboxSR", "3857");
  url.searchParams.set("imageSR", "3857");
  url.searchParams.set("size", `${width},${height}`);
  url.searchParams.set("format", "png32");
  url.searchParams.set("transparent", "true");
  url.searchParams.set("time", String(frame.validAt.getTime()));
  url.searchParams.set("f", "image");
  return url.toString();
}

/** Split a wrapped viewport so every ArcGIS export remains inside one EPSG:3857 world. */
export function noaaImageLayers(frame: RadarFrame, viewport: MapViewport): NoaaImageLayer[] {
  const northWestGeo = screenToGeo({ x: 0, y: 0 }, viewport);
  const southEastGeo = screenToGeo({ x: viewport.width, y: viewport.height }, viewport);
  const mapWorldSize = worldSize(viewport.zoom);
  const visibleWidth = Math.min(mapWorldSize, Math.max(1, viewport.width));
  const halfLongitudeSpan = visibleWidth / mapWorldSize * 180;
  const west = viewport.center.lon - halfLongitudeSpan;
  const east = viewport.center.lon + halfLongitudeSpan;
  const span = east - west;
  const renderWidth = Math.max(1, viewport.width);
  const height = Math.min(4096, Math.max(1, Math.round(viewport.height)));
  const layers: NoaaImageLayer[] = [];

  for (let cursor = west; cursor < east && layers.length < 2;) {
    const world = Math.floor((cursor + 180) / 360);
    const segmentEnd = Math.min(east, 180 + world * 360);
    const left = (cursor - west) / span * renderWidth;
    const right = (segmentEnd - west) / span * renderWidth;
    const width = right - left;
    layers.push({
      src: noaaExportUrl(
        frame,
        cursor - world * 360,
        segmentEnd - world * 360,
        northWestGeo.lat,
        southEastGeo.lat,
        Math.min(4096, Math.max(1, Math.round(width))),
        height
      ),
      left,
      width,
    });
    cursor = segmentEnd;
  }
  return layers;
}

/**
 * Backward-compatible single-image helper for callers whose viewport does not wrap.
 * Wrapped UI rendering must use `noaaImageLayers` so both world-edge segments appear.
 */
export function noaaImageUrl(
  frame: RadarFrame,
  viewport: MapViewport,
  size: { width: number; height: number }
): string {
  const [layer] = noaaImageLayers(frame, viewport);
  if (!layer) throw new Error("NOAA radar viewport produced no image layer");
  const url = new URL(layer.src);
  const width = Math.min(4096, Math.max(1, Math.round(size.width)));
  const height = Math.min(4096, Math.max(1, Math.round(size.height)));
  url.searchParams.set("size", `${width},${height}`);
  return url.toString();
}
