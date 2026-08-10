import { fetchJson } from "../http";
import { screenToGeo } from "../map/mercator";
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

export function parseNoaaFrames(value: unknown): RadarSource {
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
    fetchedAt: Date.now(),
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
  const value = await fetchJson<unknown>(noaaCatalogueUrl(), {
    signal,
    retries: 1,
    timeoutMs: 10_000,
    cacheTtlMs: 120_000,
    circuitBreakerScope: "radar-noaa",
  });
  return parseNoaaFrames(value);
}

function webMercator(point: { lat: number; lon: number }): { x: number; y: number } {
  const radius = 6_378_137;
  const x = radius * point.lon * Math.PI / 180;
  const lat = Math.min(85.0511, Math.max(-85.0511, point.lat));
  const y = radius * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  return { x, y };
}

function longitudeNear(lon: number, reference: number): number {
  let candidate = lon;
  while (candidate - reference > 180) candidate -= 360;
  while (candidate - reference < -180) candidate += 360;
  return candidate;
}

export function noaaImageUrl(
  frame: RadarFrame,
  viewport: MapViewport,
  size: { width: number; height: number }
): string {
  const northWestGeo = screenToGeo({ x: 0, y: 0 }, viewport);
  const southEastGeo = screenToGeo({ x: viewport.width, y: viewport.height }, viewport);
  const northWest = webMercator({
    ...northWestGeo,
    lon: longitudeNear(northWestGeo.lon, viewport.center.lon),
  });
  const southEast = webMercator({
    ...southEastGeo,
    lon: longitudeNear(southEastGeo.lon, viewport.center.lon),
  });
  const width = Math.min(4096, Math.max(1, Math.round(size.width)));
  const height = Math.min(4096, Math.max(1, Math.round(size.height)));
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
