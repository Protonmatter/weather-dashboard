export interface TrendGeometry {
  points: ReadonlyArray<{ x: number; y: number; value: number }>;
  polyline: string;
  min: number;
  max: number;
}

export function buildTrendGeometry(
  values: readonly number[],
  width: number,
  height: number,
  padding = 8
): TrendGeometry {
  if (values.length < 2) throw new Error("trend requires at least two values");
  if (!values.every(Number.isFinite)) throw new Error("trend values must be finite");
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= padding * 2 || height <= padding * 2) {
    throw new Error("trend dimensions must exceed padding");
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const points = values.map((value, index) => ({
    x: padding + (index / (values.length - 1)) * usableWidth,
    y: span === 0
      ? height / 2
      : padding + (1 - (value - min) / span) * usableHeight,
    value,
  }));

  return {
    points,
    polyline: points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
    min,
    max,
  };
}
