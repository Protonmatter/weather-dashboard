import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetHttpState, fetchJson, isAbort, isCircuitOpen } from "../http";
import { searchPlaces } from "../search";
import { searchPostal } from "../providers/zippopotam";
import { parseEnsembleResponse } from "../providers/openMeteo";
import { ensembleStats, temperatureStats } from "../ensemble";
import { loadWeather, ensembleFor } from "../weather";
import { fallbackBundle } from "../fallback";

const HOUR = 3_600_000;
const BASE = Date.parse("2026-09-12T00:00:00Z");
const REFERENCE = Date.parse("2026-09-12T12:30:00Z");
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function ensembleResponse() {
  const time = Array.from({ length: 72 }, (_, index) => BASE / 1000 + index * 3600);
  const hourly: Record<string, unknown> = { time };
  for (let member = 0; member < 4; member++) {
    hourly[`precipitation_member${member}`] = time.map((_, index) => index === 12 ? 9 : index === 37 ? 0.5 : 0);
    hourly[`temperature_2m_member${member}`] = time.map((_, index) => 50 + index + member);
  }
  return { hourly };
}

const hangingFetch = (_url: unknown, init?: RequestInit): Promise<Response> =>
  new Promise((_, reject) => {
    // Some fetch implementations reject AbortError even when a custom reason was used.
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });

beforeEach(() => __resetHttpState());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("provider lifecycle regressions", () => {
  it("rejects an already-cancelled caller even when a response is cached", async () => {
    const fetchSpy = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const url = "https://cache.test/value";
    await fetchJson(url, { cacheTtlMs: 60_000 });
    const controller = new AbortController();
    controller.abort();
    await expect(fetchJson(url, { cacheTtlMs: 60_000, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("reports an internal timeout as a failure while keeping the caller active", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch);
    const controller = new AbortController();
    const result = fetchJson("https://timeout.test/value", { signal: controller.signal, retries: 0, timeoutMs: 10 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(10);
    const error: unknown = await result;
    expect(controller.signal.aborted).toBe(false);
    expect(isAbort(error)).toBe(false);
    expect(error).toMatchObject({ name: "TimeoutError" });
  });

  it("keeps successful city matches when the other search provider times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => url.includes("photon")
      ? hangingFetch(url, init)
      : Promise.resolve(json({ results: [{ name: "Tokyo", latitude: 35.68, longitude: 139.69, country_code: "JP" }] })));
    const result = searchPlaces("Tokyo", new AbortController().signal).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toEqual([expect.objectContaining({ name: "Tokyo", lat: 35.68 })]);
  });

  it("allows a valid postcode after expected not-found responses", async () => {
    vi.stubGlobal("fetch", async (url: string) => url.endsWith("/94301")
      ? json({ country: "United States", places: [{ "place name": "Palo Alto", latitude: "37.44", longitude: "-122.14" }] })
      : json({}, 404));
    await Promise.allSettled(["us", "de", "fr", "es", "it"].map(cc => searchPostal("00000", cc)));
    expect(isCircuitOpen("https://api.zippopotam.us/us/94301")).toBe(false);
    await expect(searchPostal("94301", "us")).resolves.toEqual([expect.objectContaining({ name: "Palo Alto" })]);
  });
});

describe("complete ensemble windows", () => {
  it("excludes elapsed intervals and includes the final full future hour", () => {
    const parsed = parseEnsembleResponse(ensembleResponse(), REFERENCE);
    expect(parsed.precip[0]).toEqual([...Array(23).fill(0), 0.5]);
    expect(parsed.validTimes[0]?.toISOString()).toBe("2026-09-12T14:00:00.000Z");
    expect(parsed.validTimes.at(-1)?.toISOString()).toBe("2026-09-13T13:00:00.000Z");
    expect(parsed.windowStart.toISOString()).toBe("2026-09-12T13:00:00.000Z");
    expect(parsed.windowEnd.toISOString()).toBe("2026-09-13T13:00:00.000Z");
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, "0", -0.1])("drops an incomplete or invalid precipitation member (%s), preserving finite zero", invalid => {
    const fixture = ensembleResponse();
    (fixture.hourly.precipitation_member0 as unknown[])[18] = invalid;
    const parsed = parseEnsembleResponse(fixture, REFERENCE);
    expect(parsed.precip).toHaveLength(3);
    expect(parsed.precip.every(member => member[0] === 0 && member[23] === 0.5)).toBe(true);
  });

  it("rejects insufficient complete members instead of manufacturing dry weather", () => {
    const fixture = ensembleResponse();
    for (let member = 0; member < 4; member++) fixture.hourly[`precipitation_member${member}`] = Array(72).fill(null);
    expect(() => parseEnsembleResponse(fixture, REFERENCE)).toThrow(/members/);
  });

  it("omits unavailable temperature uncertainty without losing valid precipitation", () => {
    const fixture = ensembleResponse();
    for (let member = 0; member < 4; member++) fixture.hourly[`temperature_2m_member${member}`] = Array(72).fill(null);
    const parsed = parseEnsembleResponse(fixture, REFERENCE);
    expect(parsed.precip).toHaveLength(4);
    expect(parsed.temp).toEqual([]);
  });

  it("rejects gaps, duplicates, and truncated future axes", () => {
    for (const transform of [
      (times: number[]) => { times[18] = times[17]!; return times; },
      (times: number[]) => times.filter((_, index) => index !== 18),
      (times: number[]) => times.slice(0, 37),
    ]) {
      const fixture = ensembleResponse();
      fixture.hourly.time = transform(fixture.hourly.time as number[]);
      expect(() => parseEnsembleResponse(fixture, REFERENCE)).toThrow(/time|window|axis/);
    }
  });

  it("joins display temperature to point instants and archive temperature to precipitation endpoints", () => {
    const displayTimes = Array.from({ length: 24 }, (_, index) => new Date(BASE + (12 + index) * HOUR));
    const parsed = parseEnsembleResponse(ensembleResponse(), REFERENCE, displayTimes);
    expect(parsed.tempForHours?.[0]?.[0]).toBe(62);
    expect(parsed.temp[0]?.[0]).toBe(64);
    expect(parsed.temp[0]?.at(-1)).toBe(87);
  });

  it.each([
    [1800, "2026-09-12T13:30:00.000Z", "2026-09-12T14:30:00.000Z", "2026-09-13T13:30:00.000Z"],
    [900, "2026-09-12T13:15:00.000Z", "2026-09-12T14:15:00.000Z", "2026-09-13T13:15:00.000Z"],
  ] as const)("preserves provider hour phase %s for complete future intervals", (offset, start, first, end) => {
    const fixture = ensembleResponse();
    fixture.hourly.time = (fixture.hourly.time as number[]).map(time => time + offset);
    const parsed = parseEnsembleResponse(fixture, Date.parse("2026-09-12T12:35:00Z"));
    expect(parsed.windowStart.toISOString()).toBe(start);
    expect(parsed.validTimes[0]?.toISOString()).toBe(first);
    expect(parsed.windowEnd.toISOString()).toBe(end);
    expect(parsed.precip[0]).toEqual([...Array(23).fill(0), 0.5]);
  });

  it("keeps the point-provider fractional phase when the ensemble is unavailable", async () => {
    vi.stubGlobal("fetch", async () => json({}, 400));
    const hours = Array.from({ length: 48 }, (_, index) => ({
      time: new Date(BASE + index * HOUR + 1_800_000), temp: 60, code: 0, isDay: true,
      pop: index === 12 ? 100 : 0, precipitationIn: 0,
    }));
    const summary = await ensembleFor(22.57, 88.36, hours, undefined, Date.parse("2026-09-12T12:35:00Z"));
    expect(summary.n).toBe(31);
    expect(summary.t50).toBe(0);
    expect(summary.validTimes?.[0]?.toISOString()).toBe("2026-09-12T14:30:00.000Z");
    expect(summary.windowEnd?.toISOString()).toBe("2026-09-13T13:30:00.000Z");
  });

  it("never pads missing samples in the shared quantile helpers", () => {
    const precipitation = ensembleStats([[0.1, 0.2], [0.1], [Number.NaN, 0.2]]);
    expect(precipitation.n).toBe(1);
    expect(precipitation.perHour[1]?.p50).toBe(0.2);
    expect(temperatureStats([[60, 70], [60], [Number.NaN, 70]])).toEqual([
      { p10: 60, p50: 60, p90: 60 }, { p10: 70, p50: 70, p90: 70 },
    ]);
  });

  it("keeps synthetic precipitation attached to the same future endpoints", async () => {
    vi.setSystemTime(REFERENCE);
    vi.stubGlobal("fetch", async () => json({}, 400));
    const hours = Array.from({ length: 48 }, (_, index) => ({
      time: new Date(BASE + index * HOUR), temp: 60, code: 0, isDay: true,
      pop: index === 12 ? 100 : 0, precipitationIn: 0,
    }));
    const summary = await ensembleFor(0, 0, hours, undefined, REFERENCE);
    expect(summary.live).toBe(false);
    expect(summary.t50).toBe(0);
    expect(summary.validTimes?.[0]?.toISOString()).toBe("2026-09-12T14:00:00.000Z");
    expect(summary.windowEnd?.toISOString()).toBe("2026-09-13T13:00:00.000Z");
  });

  it("uses one acquisition reference when responses cross an hour boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:59:59Z"));
    const sample = fallbackBundle();
    const times = Array.from({ length: 72 }, (_, index) => BASE / 1000 + index * 3600);
    const point = {
      timezone: "UTC",
      current: {
        time: BASE / 1000 + 12 * 3600, interval: 900, temperature_2m: 62, apparent_temperature: 60,
        relative_humidity_2m: 50, weather_code: 0, is_day: 1, wind_speed_10m: 5,
        surface_pressure: 1013, precipitation: 0, cloud_cover: 0,
      },
      hourly: { time: times, temperature_2m: times.map((_, i) => 50 + i), weather_code: times.map(() => 0),
        precipitation_probability: times.map(() => 0), precipitation: times.map(() => 0), is_day: times.map(() => 1) },
      minutely_15: { time: [BASE / 1000 + 12 * 3600], rain: [0], showers: [0] },
      daily: { time: [BASE / 1000], temperature_2m_min: [50], temperature_2m_max: [75],
        weather_code: [0], uv_index_max: [3], sunrise: [BASE / 1000 + 6 * 3600], sunset: [BASE / 1000 + 18 * 3600] },
    };
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("air-quality")) return json({ current: { us_aqi: 25 } });
      if (url.includes("ensemble-api")) return json(ensembleResponse());
      const response = json(point);
      vi.setSystemTime(new Date("2026-09-12T13:00:01Z"));
      return response;
    });
    const bundle = await loadWeather(sample.place);
    expect(bundle.hourly[0]?.time.toISOString()).toBe("2026-09-12T12:00:00.000Z");
    expect(bundle.ensemble.tempSpread?.[0]?.p50).toBe(63.5);
    expect(bundle.ensemble.tempMemberSeries?.[0]?.[0]).toBe(64);
    expect(bundle.ensemble.validTimes?.[0]?.toISOString()).toBe("2026-09-12T14:00:00.000Z");
    expect(bundle.ensemble.windowStart?.toISOString()).toBe("2026-09-12T13:00:00.000Z");
  });
});
