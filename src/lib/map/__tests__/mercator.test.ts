import { describe, expect, it } from "vitest";
import {
  MAX_MERCATOR_LAT,
  geoToScreen,
  panViewport,
  project,
  screenToGeo,
  unproject,
  visibleTiles,
  wrapLongitude,
} from "../mercator";
import type { MapViewport } from "../types";

const viewport: MapViewport = {
  center: { lat: 37.44, lon: -122.14 },
  zoom: 4,
  width: 800,
  height: 500,
};

describe("Web Mercator projection", () => {
  it("round-trips representative coordinates", () => {
    for (const point of [
      { lat: 0, lon: 0 },
      { lat: 37.44, lon: -122.14 },
      { lat: -45, lon: 170 },
    ]) {
      const result = unproject(project(point, 5), 5);
      expect(result.lat).toBeCloseTo(point.lat, 8);
      expect(result.lon).toBeCloseTo(point.lon, 8);
    }
  });

  it("clamps polar latitude and wraps longitude", () => {
    expect(unproject(project({ lat: 90, lon: 540 }, 3), 3).lat).toBeCloseTo(MAX_MERCATOR_LAT, 6);
    expect(wrapLongitude(181)).toBe(-179);
    expect(wrapLongitude(-181)).toBe(179);
  });

  it("maps the viewport center to the screen center", () => {
    expect(geoToScreen(viewport.center, viewport)).toEqual({ x: 400, y: 250 });
    const result = screenToGeo({ x: 400, y: 250 }, viewport);
    expect(result.lat).toBeCloseTo(viewport.center.lat, 8);
    expect(result.lon).toBeCloseTo(viewport.center.lon, 8);
  });

  it("keeps nearby points continuous across the antimeridian", () => {
    const dateline = { ...viewport, center: { lat: 0, lon: 179 } };
    expect(geoToScreen({ lat: 0, lon: -179 }, dateline).x).toBeGreaterThan(400);
  });

  it("pans in screen-pixel direction and returns only valid wrapped tiles", () => {
    const moved = panViewport(viewport, 100, 0);
    expect(moved.center.lon).toBeLessThan(viewport.center.lon);
    const tiles = visibleTiles({ ...viewport, center: { lat: 80, lon: 179 } });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((tile) => tile.x >= 0 && tile.x < 2 ** tile.z)).toBe(true);
    expect(tiles.every((tile) => tile.y >= 0 && tile.y < 2 ** tile.z)).toBe(true);
  });
});
