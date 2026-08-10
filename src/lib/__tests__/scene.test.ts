import { describe, expect, it } from "vitest";
import { deriveWeatherScene, sceneParticles } from "../scene";
import type { CurrentConditions } from "../types";

const current = (overrides: Partial<CurrentConditions>): CurrentConditions => ({
  temp: 67,
  feels: 63,
  code: 0,
  isDay: true,
  humidity: 60,
  wind: 5,
  visibility: 10,
  pressure: 29.92,
  precipitationIn: 0,
  precipRateMmH: 0,
  cloudCover: 5,
  ...overrides,
});

describe("weather scene", () => {
  it("distinguishes clear, cloudy, fog, snow, and storm conditions", () => {
    expect(deriveWeatherScene(current({ code: 0, cloudCover: 4 })).kind).toBe("clear");
    expect(deriveWeatherScene(current({ code: 2, cloudCover: 55 })).kind).toBe("partly-cloudy");
    expect(deriveWeatherScene(current({ code: 3, cloudCover: 96 })).kind).toBe("overcast");
    expect(deriveWeatherScene(current({ code: 45, cloudCover: 100 })).kind).toBe("fog");
    expect(deriveWeatherScene(current({ code: 75, precipRateMmH: 4 })).kind).toBe("snow");
    expect(deriveWeatherScene(current({ code: 95, precipRateMmH: 12 })).kind).toBe("storm");
  });

  it("scales rain from drizzle through downpour", () => {
    expect(deriveWeatherScene(current({ code: 51, precipRateMmH: 0.2 })).intensity).toBe("drizzle");
    expect(deriveWeatherScene(current({ code: 61, precipRateMmH: 1.2 })).intensity).toBe("light");
    expect(deriveWeatherScene(current({ code: 63, precipRateMmH: 4 })).intensity).toBe("moderate");
    expect(deriveWeatherScene(current({ code: 65, precipRateMmH: 12 })).intensity).toBe("heavy");
  });

  it("uses the WMO severity when a wet code has no usable rate", () => {
    expect(deriveWeatherScene(current({ code: 51, precipRateMmH: 0 })).intensity).toBe("drizzle");
    expect(deriveWeatherScene(current({ code: 65, precipRateMmH: 0 })).intensity).toBe("heavy");
  });

  it("generates stable bounded particle geometry", () => {
    const scene = deriveWeatherScene(current({ code: 65, precipRateMmH: 9, isDay: false }));
    const first = sceneParticles(scene, 200);

    expect(first).toEqual(sceneParticles(scene, 200));
    expect(first).toHaveLength(96);
    expect(first[0]).toEqual({
      id: 0,
      left: 26.75,
      top: 22.74,
      size: 33.71,
      duration: 0.83,
      delay: 1.74,
      opacity: 0.32,
    });
  });
});
