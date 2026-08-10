import type { CurrentConditions } from "./types";

export type SceneKind =
  | "clear"
  | "partly-cloudy"
  | "overcast"
  | "fog"
  | "rain"
  | "snow"
  | "storm";

export type SceneIntensity = "none" | "drizzle" | "light" | "moderate" | "heavy";

export interface WeatherScene {
  kind: SceneKind;
  intensity: SceneIntensity;
  isDay: boolean;
  cloudCover: number;
  particleCount: number;
  seed: number;
}

export interface SceneParticle {
  id: number;
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const mod = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function kindFor(code: number, cloudCover: number): SceneKind {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code === 3 || cloudCover >= 85) return "overcast";
  if (code === 1 || code === 2 || cloudCover >= 25) return "partly-cloudy";
  return "clear";
}

function fallbackIntensity(code: number): SceneIntensity {
  if (code === 51 || code === 53 || code === 56) return "drizzle";
  if (code === 55 || code === 57 || code === 61 || code === 66 || code === 71 || code === 80 || code === 85) return "light";
  if (code === 63 || code === 67 || code === 73 || code === 77 || code === 81 || code === 86) return "moderate";
  if (code >= 51) return "heavy";
  return "none";
}

function intensityFor(code: number, rate: number): SceneIntensity {
  if (code < 51) return "none";
  if (rate <= 0) return fallbackIntensity(code);
  if (rate < 0.5) return "drizzle";
  if (rate < 2.5) return "light";
  if (rate < 7.5) return "moderate";
  return "heavy";
}

const PARTICLES: Record<SceneIntensity, number> = {
  none: 0,
  drizzle: 24,
  light: 40,
  moderate: 64,
  heavy: 96,
};

export function deriveWeatherScene(current: CurrentConditions): WeatherScene {
  const cloudCover = Math.min(100, Math.max(0, current.cloudCover));
  const kind = kindFor(current.code, cloudCover);
  const intensity = intensityFor(current.code, Math.max(0, current.precipRateMmH));
  return {
    kind,
    intensity,
    isDay: current.isDay,
    cloudCover,
    particleCount: PARTICLES[intensity],
    seed: hash(`${current.code}:${current.isDay ? 1 : 0}:${cloudCover}:${intensity}`),
  };
}

/** Stable geometry keeps hydration, screenshots, and regression tests reproducible. */
export function sceneParticles(scene: WeatherScene, requested: number): SceneParticle[] {
  const count = Math.min(96, Math.max(0, Math.floor(requested)));
  const variant = (scene.seed % 97) / 97;
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: round2(mod(26.75 + id * (37.17 + variant * 11.3), 100)),
    top: round2(mod(22.74 + id * (53.41 + variant * 7.9), 100)),
    size: round2(33.71 + mod(id * (17.23 + variant * 5.1), 36)),
    duration: round2(0.83 + mod(id * (0.19 + variant * 0.07), 0.82)),
    delay: round2(mod(1.74 + id * (0.43 + variant * 0.13), 3)),
    opacity: round2(0.32 + mod(id * (0.037 + variant * 0.02), 0.24)),
  }));
}
