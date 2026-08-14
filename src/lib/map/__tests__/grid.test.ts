import { describe, expect, it } from "vitest";
import {
  bilinearSample,
  createGridSpec,
  frameAt,
  hasPrecipitationSamples,
  mapHeightForTarget,
} from "../grid";
import type { MapForecastGrid, MapViewport } from "../types";

const viewport: MapViewport = {
  center: { lat: 0, lon: 179 },
  zoom: 4,
  width: 900,
  height: 600,
};

describe("map sampling grid", () => {
  it.each([
    ["phone", 9, 7, 63],
    ["tablet", 11, 9, 99],
    ["cinema", 13, 9, 117],
  ] as const)("builds the bounded %s grid", (target, cols, rows, count) => {
    const spec = createGridSpec(viewport, target);
    expect(spec.cols).toBe(cols);
    expect(spec.rows).toBe(rows);
    expect(spec.points).toHaveLength(count);
    expect(spec.points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))).toBe(true);
  });

  it("is deterministic and antimeridian safe", () => {
    const first = createGridSpec(viewport, "tablet");
    const second = createGridSpec(viewport, "tablet");
    expect(first.key).toBe(second.key);
    expect(first.points.some((point) => point.lon < 0)).toBe(true);
    expect(first.points.some((point) => point.lon > 0)).toBe(true);
  });

  it("does not duplicate polar samples outside the Mercator world", () => {
    const spec = createGridSpec({
      ...viewport,
      center: { lat: 85, lon: 0 },
      zoom: 2,
      height: 520,
    }, "phone");
    const centerColumnLatitudes = Array.from(
      { length: spec.rows },
      (_, row) => spec.points[row * spec.cols + Math.floor(spec.cols / 2)]!.lat
    );
    expect(new Set(centerColumnLatitudes.map((lat) => lat.toFixed(6))).size).toBe(spec.rows);
  });

  it.each([
    ["phone", 350],
    ["tablet", 440],
    ["cinema", 520],
  ] as const)("uses the responsive %s map height", (target, height) => {
    expect(mapHeightForTarget(target)).toBe(height);
  });
});

describe("map frame and interpolation", () => {
  it("bilinearly interpolates a complete cell and rejects missing corners", () => {
    expect(bilinearSample([0, 10, 20, 30], 2, 2, 0.5, 0.5)).toBe(15);
    expect(bilinearSample([0, null, 20, 30], 2, 2, 0.5, 0.5)).toBeNull();
  });

  it("clamps a requested frame index", () => {
    const grid: MapForecastGrid = {
      key: "test",
      rows: 1,
      cols: 1,
      times: ["a", "b"],
      fetchedAt: 0,
      points: [{
        requested: { lat: 0, lon: 0, row: 0, col: 0 },
        resolved: { lat: 0, lon: 0 },
        temperatureC: [1, 2],
        pressureHpa: [1000, 1001],
        precipitationMm: [0, 1],
        windKmh: [10, 20],
        windFromDeg: [0, 90],
      }],
    };
    expect(frameAt(grid, 99).time).toBe("b");
    expect(frameAt(grid, 99).temperatureC).toEqual([2]);
  });

  it("requires at least one usable precipitation sample for a forecast frame", () => {
    const grid: MapForecastGrid = {
      key: "precipitation-availability",
      rows: 1,
      cols: 2,
      times: ["missing", "dry", "wet"],
      fetchedAt: 0,
      points: [0, 1].map((col) => ({
        requested: { lat: 0, lon: col, row: 0, col },
        resolved: { lat: 0, lon: col },
        temperatureC: [1, 1, 1],
        pressureHpa: [1000, 1000, 1000],
        precipitationMm: [null, 0, col === 0 ? null : 2.5],
        windKmh: [10, 10, 10],
        windFromDeg: [0, 0, 0],
      })),
    };

    expect(hasPrecipitationSamples(grid, 0)).toBe(false);
    expect(hasPrecipitationSamples(grid, 1)).toBe(true);
    expect(hasPrecipitationSamples(grid, 2)).toBe(true);
    expect(hasPrecipitationSamples(grid, 3)).toBe(false);
  });
});
