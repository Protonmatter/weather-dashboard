import { screenToGeo } from "./mercator";
import type { MapFrame, MapForecastGrid, MapGridSpec, MapViewport } from "./types";

const DIMENSIONS = {
  phone: { cols: 9, rows: 7 },
  tablet: { cols: 11, rows: 9 },
  cinema: { cols: 13, rows: 9 },
} as const;

const HEIGHTS: Record<keyof typeof DIMENSIONS, number> = {
  phone: 350,
  tablet: 440,
  cinema: 520,
};

export function mapHeightForTarget(target: keyof typeof DIMENSIONS): number {
  return HEIGHTS[target];
}

const coordinate = (value: number): string => value.toFixed(4);

export function createGridSpec(
  viewport: MapViewport,
  target: keyof typeof DIMENSIONS
): MapGridSpec {
  const { cols, rows } = DIMENSIONS[target];
  const points = [];

  for (let row = 0; row < rows; row++) {
    const y = (row / (rows - 1)) * viewport.height;
    for (let col = 0; col < cols; col++) {
      const x = (col / (cols - 1)) * viewport.width;
      points.push({ ...screenToGeo({ x, y }, viewport), row, col });
    }
  }

  const key = [
    target,
    viewport.zoom.toFixed(0),
    viewport.width.toFixed(0),
    viewport.height.toFixed(0),
    ...points.flatMap((p) => [coordinate(p.lat), coordinate(p.lon)]),
  ].join(":");

  return { key, rows, cols, points, viewport };
}

export function frameAt(grid: MapForecastGrid, index: number): MapFrame {
  const i = Math.max(0, Math.min(grid.times.length - 1, Math.round(index)));
  return {
    time: grid.times[i] ?? "",
    temperatureC: grid.points.map((p) => p.temperatureC[i] ?? null),
    pressureHpa: grid.points.map((p) => p.pressureHpa[i] ?? null),
    precipitationMm: grid.points.map((p) => p.precipitationMm[i] ?? null),
    windKmh: grid.points.map((p) => p.windKmh[i] ?? null),
    windFromDeg: grid.points.map((p) => p.windFromDeg[i] ?? null),
  };
}

export function bilinearSample(
  values: readonly (number | null)[],
  rows: number,
  cols: number,
  x01: number,
  y01: number
): number | null {
  if (rows < 2 || cols < 2 || values.length !== rows * cols) return null;
  const x = Math.min(cols - 1, Math.max(0, x01 * (cols - 1)));
  const y = Math.min(rows - 1, Math.max(0, y01 * (rows - 1)));
  const c0 = Math.min(cols - 2, Math.floor(x));
  const r0 = Math.min(rows - 2, Math.floor(y));
  const tx = x - c0;
  const ty = y - r0;
  const a = values[r0 * cols + c0];
  const b = values[r0 * cols + c0 + 1];
  const d = values[(r0 + 1) * cols + c0];
  const c = values[(r0 + 1) * cols + c0 + 1];
  if (a == null || b == null || c == null || d == null) return null;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * tx * ty + d * (1 - tx) * ty;
}
