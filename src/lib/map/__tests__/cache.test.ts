import { describe, expect, it } from "vitest";
import { isMapForecastFresh, MAP_FORECAST_CACHE_TTL_MS } from "../cache";

describe("map forecast cache freshness", () => {
  const now = 1_000_000;

  it("reuses a grid only inside the freshness window", () => {
    expect(isMapForecastFresh({ fetchedAt: now }, now)).toBe(true);
    expect(isMapForecastFresh({ fetchedAt: now - MAP_FORECAST_CACHE_TTL_MS + 1 }, now)).toBe(true);
  });

  it("expires a grid at the TTL boundary", () => {
    expect(isMapForecastFresh({ fetchedAt: now - MAP_FORECAST_CACHE_TTL_MS }, now)).toBe(false);
    expect(isMapForecastFresh({ fetchedAt: now - MAP_FORECAST_CACHE_TTL_MS - 1 }, now)).toBe(false);
  });

  it("fails closed for invalid or future timestamps", () => {
    expect(isMapForecastFresh({ fetchedAt: Number.NaN }, now)).toBe(false);
    expect(isMapForecastFresh({ fetchedAt: now + 1 }, now)).toBe(false);
  });
});
