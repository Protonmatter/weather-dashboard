import { describe, expect, it } from "vitest";
import { frameSummary, windFlowAngle } from "../render";
import type { MapFrame } from "../types";

const frame: MapFrame = {
  time: "2026-08-08T00:00",
  temperatureC: [0, 20],
  pressureHpa: [996, 1008],
  precipitationMm: [0, 2.5],
  windKmh: [10, 20],
  windFromDeg: [0, 270],
};

describe("map presentation semantics", () => {
  it("rotates meteorological north-from wind toward southward flow", () => {
    expect(Math.sin(windFlowAngle(0))).toBeCloseTo(1);
    expect(Math.cos(windFlowAngle(270))).toBeCloseTo(1);
  });

  it("summarises canonical fields without confusing forecast precipitation with probability", () => {
    expect(frameSummary(frame, "temperature", "F")).toContain("32 to 68 degrees F");
    expect(frameSummary(frame, "pressure", "F")).toContain("996 to 1008 hectopascals");
    expect(frameSummary(frame, "precipitation", "F")).toContain("Hour-ending forecast precipitation");
  });
});
