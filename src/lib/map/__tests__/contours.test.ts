import { describe, expect, it } from "vitest";
import { contourLevels, contourSegments } from "../contours";

describe("marching squares", () => {
  it("emits no segment for a uniform cell", () => {
    expect(contourSegments([1, 1, 1, 1], 2, 2, 0, 100, 100)).toEqual([]);
  });

  it("interpolates a simple crossing", () => {
    const segments = contourSegments([0, 10, 0, 10], 2, 2, 5, 100, 100);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.a.x).toBeCloseTo(50);
    expect(segments[0]!.b.x).toBeCloseTo(50);
  });

  it("resolves ambiguous saddle cells deterministically", () => {
    // Row-major values put highs at top-left and bottom-right.
    const first = contourSegments([10, 0, 0, 10], 2, 2, 5, 100, 100);
    const second = contourSegments([10, 0, 0, 10], 2, 2, 5, 100, 100);
    expect(first).toHaveLength(2);
    expect(first).toEqual(second);
  });

  it("skips cells with missing data", () => {
    expect(contourSegments([0, null, 10, 0], 2, 2, 5, 100, 100)).toEqual([]);
  });

  it("anchors pressure levels to global four-hPa multiples", () => {
    expect(contourLevels([997, 1002, 1009], 4)).toEqual([1000, 1004, 1008]);
  });
});
