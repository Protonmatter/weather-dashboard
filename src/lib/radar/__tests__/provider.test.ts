import { describe, expect, it } from "vitest";
import { RADAR_CATALOGUE_TTL_MS, radarRefreshTimerDelayMs } from "../cache";
import { noaaCatalogueUrl, noaaImageLayers, noaaImageUrl, parseNoaaFrames } from "../noaa";
import { radarProviderFor } from "../provider";
import { parseRainViewer, rainViewerTileUrl } from "../rainViewer";
import type { MapViewport } from "../../map/types";
import type { Place } from "../../types";

const place = (cc: string): Place => ({
  lat: 37.44,
  lon: -122.14,
  name: "Test",
  admin: "",
  country: "",
  cc,
});

describe("radar provider boundary", () => {
  it("schedules an immediate refresh for an already-expired catalogue", () => {
    expect(radarRefreshTimerDelayMs({ provider: "noaa-mrms", fetchedAt: 1_000 }, 121_000)).toBe(0);
    expect(radarRefreshTimerDelayMs({ provider: "unavailable", fetchedAt: 1_000 }, 121_000)).toBeNull();
    expect(radarRefreshTimerDelayMs({ provider: "noaa-mrms", fetchedAt: 2_000 }, 1_000))
      .toBe(RADAR_CATALOGUE_TTL_MS);
    expect(radarRefreshTimerDelayMs({ provider: "noaa-mrms", fetchedAt: Number.NaN }, 1_000))
      .toBeNull();
  });

  it("selects NOAA for the US and RainViewer elsewhere", () => {
    expect(radarProviderFor(place("US"))).toBe("noaa-mrms");
    expect(radarProviderFor(place("pr"))).toBe("noaa-mrms");
    expect(radarProviderFor(place("jp"))).toBe("rainviewer");
  });

  it("does not silently assign a global provider when the country is unknown", () => {
    expect(radarProviderFor(place(""))).toBe("unavailable");
  });

  it("sorts and deduplicates NOAA regional records by valid time", () => {
    const source = parseNoaaFrames({
      features: [
        { attributes: { objectid: 3, idp_validtime: 200_000 } },
        { attributes: { objectid: 1, idp_validtime: 100_000 } },
        { attributes: { objectid: 2, idp_validtime: 100_000 } },
        { attributes: { objectid: 4, idp_validtime: null } },
      ],
    });

    expect(source.coverage).toBe("available");
    expect(source.frames.map((frame) => [frame.id, frame.validAt.getTime()])).toEqual([
      ["100000", 100_000],
      ["200000", 200_000],
    ]);
  });

  it("requests the newest NOAA records before applying the catalogue cap", () => {
    const url = new URL(noaaCatalogueUrl());

    expect(url.searchParams.get("orderByFields")).toBe("idp_validtime DESC");
    expect(url.searchParams.get("resultRecordCount")).toBe("1000");
  });

  it("sorts and deduplicates RainViewer paths", () => {
    const source = parseRainViewer({
      version: "2.0",
      generated: 300,
      host: "https://tilecache.rainviewer.com",
      radar: {
        past: [
          { time: 200, path: "/v2/radar/b" },
          { time: 100, path: "/v2/radar/a" },
          { time: 100, path: "/v2/radar/duplicate" },
        ],
      },
    });

    expect(source.frames.map((frame) => [frame.id, frame.path])).toEqual([
      ["100", "/v2/radar/a"],
      ["200", "/v2/radar/b"],
    ]);
  });

  it("uses the catalogue acquisition time supplied by the HTTP cache", () => {
    expect(parseNoaaFrames({ features: [] }, 123_000).fetchedAt).toBe(123_000);
    expect(parseRainViewer({
      host: "https://tilecache.rainviewer.com",
      radar: { past: [] },
    }, 456_000).fetchedAt).toBe(456_000);
  });

  it("rejects an insecure RainViewer image origin", () => {
    expect(() => parseRainViewer({
      version: "2.0",
      generated: 300,
      host: "http://tiles.example.test",
      radar: { past: [{ time: 100, path: "/v2/radar/a" }] },
    })).toThrow("radar image host must use HTTPS");
    expect(() => parseRainViewer({
      host: "https://tracker.example",
      radar: { past: [] },
    })).toThrow(/RainViewer/);
  });

  it("rejects traversal and query material in a RainViewer frame path", () => {
    expect(() => rainViewerTileUrl(
      { id: "100", validAt: new Date(100_000), path: "/v2/radar/../../collect?token=x" },
      "https://tilecache.rainviewer.com",
      { z: 4, x: 2, y: 3 }
    )).toThrow(/path/);
  });

  it("builds bounded provider image URLs without accepting an origin from the place", () => {
    const viewport: MapViewport = {
      center: { lat: 37.44, lon: -122.14 },
      zoom: 5,
      width: 800,
      height: 500,
    };
    const noaa = new URL(noaaImageLayers(
      { id: "100000", validAt: new Date(100_000) },
      viewport
    )[0]!.src);
    expect(noaa.hostname).toBe("mapservices.weather.noaa.gov");
    expect(noaa.pathname.endsWith("/ImageServer/exportImage")).toBe(true);
    expect(noaa.searchParams.get("time")).toBe("100000");
    expect(noaa.searchParams.get("size")).toBe("800,500");
    expect(noaa.searchParams.get("bboxSR")).toBe("3857");

    expect(rainViewerTileUrl(
      {
        id: "100",
        validAt: new Date(100_000),
        path: "/v2/radar/a",
      },
      "https://tilecache.rainviewer.com",
      { z: 7, x: 12, y: 34 }
    )).toBe("https://tilecache.rainviewer.com/v2/radar/a/256/7/12/34/2/1_1.png");
  });

  it("keeps a NOAA bbox ordered when the viewport crosses the antimeridian", () => {
    const layers = noaaImageLayers(
      { id: "100000", validAt: new Date(100_000) },
      {
        center: { lat: 20, lon: 179 },
        zoom: 2,
        width: 800,
        height: 500,
      }
    );
    const webMercatorLimit = Math.PI * 6_378_137;

    expect(layers).toHaveLength(2);
    expect(layers.reduce((total, layer) => total + layer.width, 0)).toBeCloseTo(800, 8);
    for (const layer of layers) {
      const bbox = new URL(layer.src).searchParams.get("bbox")!.split(",").map(Number);
      expect(bbox[0]).toBeLessThan(bbox[2]!);
      expect(bbox[0]).toBeGreaterThanOrEqual(-webMercatorLimit);
      expect(bbox[2]).toBeLessThanOrEqual(webMercatorLimit);
    }
  });

  it("keeps the legacy NOAA helper size independent from viewport geometry", () => {
    const frame = { id: "100000", validAt: new Date(100_000) };
    const viewport: MapViewport = {
      center: { lat: 37.44, lon: -122.14 },
      zoom: 5,
      width: 800,
      height: 500,
    };
    const layerUrl = new URL(noaaImageLayers(frame, viewport)[0]!.src);
    const legacyUrl = new URL(noaaImageUrl(frame, viewport, { width: 640, height: 400 }));

    expect(legacyUrl.searchParams.get("bbox")).toBe(layerUrl.searchParams.get("bbox"));
    expect(legacyUrl.searchParams.get("size")).toBe("640,400");
  });

  it("clamps a wide NOAA viewport to one ordered Web Mercator world", () => {
    const layers = noaaImageLayers(
      { id: "100000", validAt: new Date(100_000) },
      {
        center: { lat: 37.4419, lon: -122.143 },
        zoom: 2,
        width: 1760,
        height: 500,
      }
    );
    const webMercatorWorldWidth = 2 * Math.PI * 6_378_137;

    expect(layers.reduce((total, layer) => total + layer.width, 0)).toBeCloseTo(1760, 8);
    for (const layer of layers) {
      const bbox = new URL(layer.src).searchParams.get("bbox")!.split(",").map(Number);
      expect(bbox[0]).toBeLessThan(bbox[2]!);
      expect(bbox[2]! - bbox[0]!).toBeLessThanOrEqual(webMercatorWorldWidth);
    }
  });
});
