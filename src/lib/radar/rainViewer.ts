import { fetchJsonWithMetadata } from "../http";
import type { RadarFrame, RadarSource, RadarTile } from "./types";

const METADATA = "https://api.rainviewer.com/public/weather-maps.json";
const ATTRIBUTION = { label: "Radar data by RainViewer", url: "https://www.rainviewer.com/" };

interface RainViewerResponse {
  version?: unknown;
  generated?: unknown;
  host?: unknown;
  radar?: { past?: unknown };
}

function secureHost(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("radar image host is missing");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("radar image host is invalid"); }
  if (url.protocol !== "https:") throw new Error("radar image host must use HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("radar image host is invalid");
  if (url.hostname !== "tilecache.rainviewer.com" || url.port || url.pathname !== "/") {
    throw new Error("radar image host is not the RainViewer tile service");
  }
  return url.origin;
}

const isFramePath = (path: unknown): path is string =>
  typeof path === "string" && /^\/v2\/radar\/[A-Za-z0-9_-]+$/.test(path);

export function parseRainViewer(value: unknown, fetchedAt = Date.now()): RadarSource {
  const response = value as RainViewerResponse;
  const imageHost = secureHost(response.host);
  const past = response.radar?.past;
  if (!Array.isArray(past)) throw new Error("RainViewer returned an invalid frame catalogue");
  const frames = new Map<number, RadarFrame>();
  for (const candidate of past as Array<{ time?: unknown; path?: unknown }>) {
    const time = candidate.time;
    const path = candidate.path;
    if (typeof time !== "number" || !Number.isFinite(time) || time <= 0 || frames.has(time)) continue;
    if (!isFramePath(path)) continue;
    frames.set(time, { id: String(time), validAt: new Date(time * 1000), path });
  }
  const sorted = [...frames.values()].sort((a, b) => a.validAt.getTime() - b.validAt.getTime());
  return {
    provider: "rainviewer",
    frames: sorted,
    coverage: sorted.length ? "available" : "unavailable",
    attribution: ATTRIBUTION,
    imageHost,
    fetchedAt,
  };
}

export async function fetchRainViewer(signal?: AbortSignal): Promise<RadarSource> {
  const result = await fetchJsonWithMetadata<unknown>(METADATA, {
    signal,
    retries: 1,
    timeoutMs: 10_000,
    cacheTtlMs: 120_000,
    circuitBreakerScope: "radar-rainviewer",
  });
  return parseRainViewer(result.value, result.fetchedAt);
}

export function rainViewerTileUrl(
  frame: RadarFrame,
  imageHost: string,
  tile: RadarTile
): string {
  const host = secureHost(imageHost);
  if (!isFramePath(frame.path)) throw new Error("RainViewer frame path is invalid");
  const limit = 2 ** tile.z;
  if (!Number.isInteger(tile.z) || tile.z < 0 || tile.z > 7 ||
      !Number.isInteger(tile.x) || tile.x < 0 || tile.x >= limit ||
      !Number.isInteger(tile.y) || tile.y < 0 || tile.y >= limit) {
    throw new Error("RainViewer tile is outside the supported pyramid");
  }
  return `${host}${frame.path}/256/${tile.z}/${tile.x}/${tile.y}/2/1_1.png`;
}
