import { describe, expect, it } from "vitest";
import { buildTrendGeometry } from "../trend";

describe("buildTrendGeometry", () => {
  it("maps endpoints into the requested padded drawing area", () => {
    const result = buildTrendGeometry([50, 60, 70], 280, 100, 10);
    expect(result.points[0]).toMatchObject({ x: 10, value: 50 });
    expect(result.points[2]).toMatchObject({ x: 270, value: 70 });
    expect(result.points[0]!.y).toBeGreaterThan(result.points[2]!.y);
    expect(result.polyline).toBe(result.points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
  });

  it("centres a constant series instead of dividing by zero", () => {
    const result = buildTrendGeometry([62, 62, 62], 120, 60, 6);
    expect(new Set(result.points.map((point) => point.y)).size).toBe(1);
    expect(result.points[0]!.y).toBe(30);
  });

  it("rejects fewer than two finite values", () => {
    expect(() => buildTrendGeometry([62], 120, 60)).toThrow(/at least two/);
    expect(() => buildTrendGeometry([62, Number.NaN], 120, 60)).toThrow(/finite/);
  });
});
