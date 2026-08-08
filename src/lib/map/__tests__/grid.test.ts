import { describe, expect, it } from "vitest";
import { bilinearSample, createGridSpec, frameAt } from "../grid";
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
});
