import { describe, expect, it } from "vitest";
import {
  advanceWindParticle,
  createWindField,
  sampleWindVector,
  seedWindParticle,
  windParticleCount,
} from "../wind";
import type { MapFrame } from "../types";

const windFrame = (directions: number[], speeds = directions.map(() => 20)): MapFrame => ({
  time: "2026-08-08T00:00",
  temperatureC: directions.map(() => 20),
  pressureHpa: directions.map(() => 1_012),
  precipitationMm: directions.map(() => 0),
  windKmh: speeds,
  windFromDeg: directions,
});

describe("animated wind field", () => {
  it("interpolates vector components across the north bearing wrap", () => {
    const field = createWindField(windFrame([359, 1, 359, 1]));
    const vector = sampleWindVector(field, 2, 2, 0.5, 0.5);
    expect(vector).not.toBeNull();
    expect(vector!.eastKmh).toBeCloseTo(0, 6);
    expect(vector!.southKmh).toBeGreaterThan(19.9);
    expect(vector!.speedKmh).toBeGreaterThan(19.9);
  });

  it("advects particles toward forecast motion at relative forecast speed", () => {
    const field = createWindField(windFrame([270, 270, 270, 270], [10, 10, 10, 10]));
    const particle = { x: 20, y: 20, ageSeconds: 0, lifeSeconds: 10 };
    const next = advanceWindParticle(particle, field, 2, 2, 100, 100, 1);
    expect(next).not.toBeNull();
    expect(next!.x).toBeCloseTo(27.2);
    expect(next!.y).toBeCloseTo(20);
  });

  it("fails closed across missing vector samples", () => {
    const field = createWindField(windFrame([0, 0, 0, Number.NaN]));
    expect(sampleWindVector(field, 2, 2, 0.5, 0.5)).toBeNull();
  });

  it("keeps particle seeding and target budgets deterministic", () => {
    expect(seedWindParticle(42, 800, 400)).toEqual(seedWindParticle(42, 800, 400));
    expect(windParticleCount("phone")).toBeLessThan(windParticleCount("tablet"));
    expect(windParticleCount("tablet")).toBeLessThan(windParticleCount("cinema"));
  });
});
