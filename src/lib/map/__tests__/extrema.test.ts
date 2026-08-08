import { describe, expect, it } from "vitest";
import { findPressureExtrema, smoothGrid } from "../extrema";

describe("pressure extrema", () => {
  it("smooths finite values while preserving missing source centers", () => {
    const smoothed = smoothGrid([null, 2, null, 4], 2, 2);
    expect(smoothed).toHaveLength(4);
    expect(smoothed[0]).toBeNull();
    expect(smoothed[2]).toBeNull();
    expect([smoothed[1], smoothed[3]].every(
      (value) => value != null && value >= 2 && value <= 4
    )).toBe(true);
  });

  it("does not manufacture an extremum inside a missing pressure cell", () => {
    const values = new Array<number | null>(25).fill(1000);
    for (let row = 1; row <= 3; row++) {
      for (let col = 1; col <= 3; col++) values[row * 5 + col] = 1020;
    }
    values[2 * 5 + 2] = null;

    expect(smoothGrid(values, 5, 5)[2 * 5 + 2]).toBeNull();
    expect(findPressureExtrema(values, 5, 5, 400, 400, 0.01, 10)).not.toContainEqual(
      expect.objectContaining({ row: 2, col: 2 })
    );
  });

  it("finds an interior high and excludes border extrema", () => {
    const values = [
      1000, 1000, 1000, 1000, 1020,
      1000, 1001, 1002, 1001, 1000,
      1000, 1002, 1020, 1002, 1000,
      1000, 1001, 1002, 1001, 1000,
      1000, 1000, 1000, 1000, 1000,
    ];
    const extrema = findPressureExtrema(values, 5, 5, 400, 400, 0.01, 10);
    expect(extrema.some((item) => item.kind === "H" && item.row === 2 && item.col === 2)).toBe(true);
    expect(extrema.some((item) => item.row === 0 || item.col === 4)).toBe(false);
  });

  it("suppresses weaker nearby candidates", () => {
    const values = new Array<number>(49).fill(1000);
    values[2 * 7 + 2] = 1020;
    values[2 * 7 + 4] = 1018;
    const extrema = findPressureExtrema(values, 7, 7, 300, 300, 0.01, 150);
    expect(extrema.filter((item) => item.kind === "H")).toHaveLength(1);
  });

  it("retains nearby extrema of opposite kinds", () => {
    const values = new Array<number>(49).fill(1000);
    values[3 * 7 + 2] = 1020;
    values[3 * 7 + 4] = 980;
    const extrema = findPressureExtrema(values, 7, 7, 300, 300, 0.01, 150);
    expect(extrema.some((item) => item.kind === "H")).toBe(true);
    expect(extrema.some((item) => item.kind === "L")).toBe(true);
  });
});
