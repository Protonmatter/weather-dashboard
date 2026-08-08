import type { GeoPoint, MapViewport } from "./types";

export const TILE_SIZE = 256;
export const MAX_MERCATOR_LAT = 85.05112878;

export interface WorldPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface VisibleTile {
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
}

export const wrapLongitude = (lon: number): number => {
  const wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 && lon > 0 ? 180 : wrapped;
};

export const clampLatitude = (lat: number): number =>
  Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, lat));

export const worldSize = (zoom: number): number => TILE_SIZE * 2 ** zoom;

export function project(point: GeoPoint, zoom: number): WorldPoint {
  const size = worldSize(zoom);
  const lat = (clampLatitude(point.lat) * Math.PI) / 180;
  return {
    x: ((wrapLongitude(point.lon) + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * size,
  };
}

export function unproject(point: WorldPoint, zoom: number): GeoPoint {
  const size = worldSize(zoom);
  const lon = (point.x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * point.y) / size;
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return { lat: clampLatitude(lat), lon: wrapLongitude(lon) };
}

/** World X nearest the reference, preserving continuity across the antimeridian. */
function nearestWorldX(x: number, reference: number, size: number): number {
  let candidate = x;
  while (candidate - reference > size / 2) candidate -= size;
  while (candidate - reference < -size / 2) candidate += size;
  return candidate;
}

export function geoToScreen(point: GeoPoint, viewport: MapViewport): ScreenPoint {
  const center = project(viewport.center, viewport.zoom);
  const raw = project(point, viewport.zoom);
  const size = worldSize(viewport.zoom);
  const x = nearestWorldX(raw.x, center.x, size);
  return {
    x: x - center.x + viewport.width / 2,
    y: raw.y - center.y + viewport.height / 2,
  };
}

export function screenToGeo(point: ScreenPoint, viewport: MapViewport): GeoPoint {
  const center = project(viewport.center, viewport.zoom);
  return unproject(
    {
      x: center.x + point.x - viewport.width / 2,
      y: center.y + point.y - viewport.height / 2,
    },
    viewport.zoom
  );
}

export function panViewport(viewport: MapViewport, dx: number, dy: number): MapViewport {
  const center = project(viewport.center, viewport.zoom);
  return {
    ...viewport,
    center: unproject({ x: center.x - dx, y: center.y - dy }, viewport.zoom),
  };
}

export function visibleTiles(viewport: MapViewport): VisibleTile[] {
  const z = Math.round(viewport.zoom);
  const center = project(viewport.center, z);
  const minX = center.x - viewport.width / 2;
  const maxX = center.x + viewport.width / 2;
  const minY = center.y - viewport.height / 2;
  const maxY = center.y + viewport.height / 2;
  const tileCount = 2 ** z;
  const tiles: VisibleTile[] = [];

  for (let ty = Math.floor(minY / TILE_SIZE); ty <= Math.floor(maxY / TILE_SIZE); ty++) {
    if (ty < 0 || ty >= tileCount) continue;
    for (let tx = Math.floor(minX / TILE_SIZE); tx <= Math.floor(maxX / TILE_SIZE); tx++) {
      const wrappedX = ((tx % tileCount) + tileCount) % tileCount;
      tiles.push({
        z,
        x: wrappedX,
        y: ty,
        left: tx * TILE_SIZE - minX,
        top: ty * TILE_SIZE - minY,
      });
    }
  }
  return tiles;
}
