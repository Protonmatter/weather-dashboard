import { bilinearSample } from "./grid";
import type { MapFrame } from "./types";

export interface WindField {
  eastKmh: Array<number | null>;
  southKmh: Array<number | null>;
}

export interface WindParticle {
  x: number;
  y: number;
  ageSeconds: number;
  lifeSeconds: number;
}

export interface WindVector {
  eastKmh: number;
  southKmh: number;
  speedKmh: number;
}

/** Canvas angle toward motion from a meteorological "from" bearing. */
export const windFlowAngle = (fromDegrees: number): number =>
  ((fromDegrees + 180 - 90) * Math.PI) / 180;

/**
 * Convert polar wind samples before interpolation. Interpolating degrees directly would
 * turn neighbouring 359° and 1° samples into a false southerly wind near 180°.
 */
export function createWindField(frame: MapFrame): WindField {
  const eastKmh: Array<number | null> = [];
  const southKmh: Array<number | null> = [];
  const length = Math.min(frame.windKmh.length, frame.windFromDeg.length);
  for (let index = 0; index < length; index++) {
    const speed = frame.windKmh[index];
    const from = frame.windFromDeg[index];
    if (speed == null || from == null || !Number.isFinite(speed) || !Number.isFinite(from)) {
      eastKmh.push(null);
      southKmh.push(null);
      continue;
    }
    const angle = windFlowAngle(from);
    eastKmh.push(Math.cos(angle) * Math.max(0, speed));
    southKmh.push(Math.sin(angle) * Math.max(0, speed));
  }
  return { eastKmh, southKmh };
}

export function sampleWindVector(
  field: WindField,
  rows: number,
  cols: number,
  x01: number,
  y01: number
): WindVector | null {
  const eastKmh = bilinearSample(field.eastKmh, rows, cols, x01, y01);
  const southKmh = bilinearSample(field.southKmh, rows, cols, x01, y01);
  if (eastKmh == null || southKmh == null) return null;
  return { eastKmh, southKmh, speedKmh: Math.hypot(eastKmh, southKmh) };
}

const randomUnit = (seed: number): number => {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
};

export function seedWindParticle(seed: number, width: number, height: number): WindParticle {
  const lifeSeconds = 2.8 + randomUnit(seed + 2) * 3.6;
  return {
    x: randomUnit(seed) * Math.max(1, width),
    y: randomUnit(seed + 1) * Math.max(1, height),
    ageSeconds: randomUnit(seed + 3) * lifeSeconds,
    lifeSeconds,
  };
}

export function windParticleCount(target: "phone" | "tablet" | "cinema"): number {
  if (target === "phone") return 72;
  if (target === "cinema") return 180;
  return 120;
}

/** Advance one particle in screen space; null means it should be deterministically reseeded. */
export function advanceWindParticle(
  particle: WindParticle,
  field: WindField,
  rows: number,
  cols: number,
  width: number,
  height: number,
  elapsedSeconds: number
): WindParticle | null {
  if (width <= 0 || height <= 0 || elapsedSeconds <= 0 || particle.ageSeconds >= particle.lifeSeconds) {
    return null;
  }
  const vector = sampleWindVector(field, rows, cols, particle.x / width, particle.y / height);
  if (!vector || vector.speedKmh < 0.2) return null;

  // The visual scale is intentionally screen-relative, not a geographic distance claim.
  // Direction and relative speed come from the forecast field; 0.72 maps km/h to px/s.
  const scale = 0.72 * elapsedSeconds;
  const next = {
    ...particle,
    x: particle.x + vector.eastKmh * scale,
    y: particle.y + vector.southKmh * scale,
    ageSeconds: particle.ageSeconds + elapsedSeconds,
  };
  const margin = 4;
  if (
    next.x < -margin || next.x > width + margin ||
    next.y < -margin || next.y > height + margin ||
    next.ageSeconds >= next.lifeSeconds
  ) {
    return null;
  }
  return next;
}
