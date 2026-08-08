import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../http";
import { buildMapForecastUrl, fetchMapForecast, parseMapForecastResponse } from "../../providers/mapForecast";
import type { MapGridSpec } from "../types";

const spec: MapGridSpec = {
  key: "grid",
  rows: 1,
  cols: 1,
  viewport: { center: { lat: 1, lon: 2 }, zoom: 4, width: 100, height: 100 },
  points: [{ lat: 1, lon: 2, row: 0, col: 0 }],
};

const times = Array.from({ length: 48 }, (_, index) => `2026-08-08T${String(index).padStart(2, "0")}:00`);
const series = (value: number): number[] => Array.from({ length: 48 }, () => value);

function rawLocation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    latitude: 1,
    longitude: 2,
    hourly_units: {
      temperature_2m: "°C",
      pressure_msl: "hPa",
      precipitation: "mm",
      wind_speed_10m: "km/h",
      wind_direction_10m: "°",
    },
    hourly: {
      time: times,
      temperature_2m: series(20),
      pressure_msl: series(1004),
      precipitation: series(0),
      wind_speed_10m: series(10),
      wind_direction_10m: series(270),
    },
    ...overrides,
  };
}

describe("map forecast provider", () => {
  it("builds a fixed bounded GFS request", () => {
    const url = new URL(buildMapForecastUrl("https://example.test", spec));
    expect(url.pathname).toBe("/v1/gfs");
    expect(url.searchParams.get("models")).toBe("gfs_global");
    expect(url.searchParams.get("forecast_hours")).toBe("48");
    expect(url.searchParams.get("timezone")).toBe("GMT");
    expect(url.searchParams.get("hourly")).toContain("pressure_msl");
  });

  it("parses aligned canonical series and preserves nulls", () => {
    const raw = rawLocation();
    const hourly = raw["hourly"] as Record<string, unknown>;
    hourly["precipitation"] = [null, ...series(0).slice(1)];
    const parsed = parseMapForecastResponse([raw], spec, 123);
    expect(parsed.fetchedAt).toBe(123);
    expect(parsed.points[0]!.precipitationMm[0]).toBeNull();
    expect(parsed.points[0]!.pressureHpa[0]).toBe(1004);
  });

  it("rejects response-count, time-axis, unit, and field-length drift", () => {
    expect(() => parseMapForecastResponse([], spec)).toThrow(/count/);
    const short = rawLocation();
    (short["hourly"] as Record<string, unknown>)["time"] = times.slice(0, 47);
    expect(() => parseMapForecastResponse([short], spec)).toThrow(/48/);
    const badUnit = rawLocation();
    (badUnit["hourly_units"] as Record<string, string>)["pressure_msl"] = "inHg";
    expect(() => parseMapForecastResponse([badUnit], spec)).toThrow(/unit/);
    const shortField = rawLocation();
    (shortField["hourly"] as Record<string, unknown>)["wind_speed_10m"] = [1];
    expect(() => parseMapForecastResponse([shortField], spec)).toThrow(/length/);
  });

  it("falls back from a transient proxy failure to the direct endpoint", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new HttpError("HTTP 503", 503))
      .mockResolvedValueOnce([rawLocation()]);
    const parsed = await fetchMapForecast(
      spec,
      undefined,
      ["https://proxy.test", "https://api.open-meteo.com"],
      fetcher
    );
    expect(parsed.key).toBe("grid");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back when the proxy reaches its internal timeout", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new DOMException("Timeout", "AbortError"))
      .mockResolvedValueOnce([rawLocation()]);

    await expect(fetchMapForecast(
      spec,
      controller.signal,
      ["https://proxy.test", "https://api.open-meteo.com"],
      fetcher
    )).resolves.toMatchObject({ key: "grid" });
    expect(controller.signal.aborted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not fall back after caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(fetchMapForecast(
      spec,
      controller.signal,
      ["https://proxy.test", "https://api.open-meteo.com"],
      fetcher
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not fall back on a bad request", async () => {
    const fetcher = vi.fn().mockRejectedValue(new HttpError("HTTP 400", 400));
    await expect(fetchMapForecast(
      spec,
      undefined,
      ["https://proxy.test", "https://api.open-meteo.com"],
      fetcher
    )).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not mask proxy schema drift by falling back", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ unexpected: true })
      .mockResolvedValueOnce([rawLocation()]);
    await expect(fetchMapForecast(
      spec,
      undefined,
      ["https://proxy.test", "https://api.open-meteo.com"],
      fetcher
    )).rejects.toThrow(/count/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
