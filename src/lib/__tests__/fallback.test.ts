import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackBundle } from "../fallback";
import { ensembleStats, synthMembers } from "../ensemble";
import { formatLocalTime, localDateKey } from "../time";

afterEach(() => vi.useRealTimers());

describe("fallback forecast timezone", () => {
  it("constructs solar times as wall times in the declared location timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T16:30:00Z"));

    const bundle = fallbackBundle();
    const today = bundle.daily[0]!;

    expect(localDateKey(today.date, bundle.timezone)).toBe("2026-08-09");
    expect(formatLocalTime(today.sunrise!, bundle.timezone)).toBe("7:04 AM");
    expect(formatLocalTime(today.sunset!, bundle.timezone)).toBe("5:12 PM");
  });

  it("derives fallback day flags in the declared location timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:30:00Z"));

    const bundle = fallbackBundle();

    expect(formatLocalTime(bundle.hourly[0]!.time, bundle.timezone)).toBe("5:00 AM");
    expect(bundle.current.isDay).toBe(false);
    expect(bundle.hourly[0]!.isDay).toBe(false);
    expect(bundle.hourly[2]!.isDay).toBe(true);
  });

  it("anchors fallback hours in the declared timezone for fractional-offset viewers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:30:00Z"));
    const originalTimeZone = process.env["TZ"];
    process.env["TZ"] = "Asia/Kolkata";

    try {
      const bundle = fallbackBundle();

      expect(formatLocalTime(bundle.hourly[0]!.time, bundle.timezone)).toBe("5:00 AM");
      expect(formatLocalTime(bundle.hourly[1]!.time, bundle.timezone)).toBe("6:00 AM");
    } finally {
      if (originalTimeZone === undefined) delete process.env["TZ"];
      else process.env["TZ"] = originalTimeZone;
    }
  });

  it("keeps the active repeated hour during the fall DST fold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T09:30:00Z"));

    const bundle = fallbackBundle();

    expect(bundle.hourly[0]!.time.toISOString()).toBe("2026-11-01T09:00:00.000Z");
    expect(formatLocalTime(bundle.hourly[0]!.time, bundle.timezone)).toBe("1:00 AM");
    expect(formatLocalTime(bundle.hourly[1]!.time, bundle.timezone)).toBe("2:00 AM");
  });
});

describe("fallback precipitation window", () => {
  it.each([
    ["2026-09-12T12:00:00Z", "2026-09-12T12:00:00Z", 1, 65],
    ["2026-09-12T12:30:00Z", "2026-09-12T13:00:00Z", 2, 58],
    ["2026-03-08T09:30:00Z", "2026-03-08T10:00:00Z", 2, 58],
    ["2026-11-01T08:30:00Z", "2026-11-01T09:00:00Z", 2, 58],
    ["2026-11-01T09:30:00Z", "2026-11-01T10:00:00Z", 2, 58],
  ] as const)("matches complete source intervals at %s", (now, start, offset, firstPop) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const bundle = fallbackBundle();
    const startMs = Date.parse(start);
    const expectedHours = bundle.hourly.slice(offset, offset + 24);
    const endpoints = Array.from({ length: 24 }, (_, index) => startMs + (index + 1) * 3_600_000);

    expect(bundle.ensemble.windowStart?.getTime()).toBe(startMs);
    expect(bundle.ensemble.windowEnd?.getTime()).toBe(startMs + 24 * 3_600_000);
    expect(bundle.ensemble.validTimes?.map(time => time.getTime())).toEqual(endpoints);
    expect(expectedHours.map(hour => hour.time.getTime())).toEqual(endpoints);
    expect(expectedHours[0]?.pop).toBe(firstPop);
    expect(expectedHours.at(-1)?.pop).toBe(0);
    expect(expectedHours.at(-1)?.precipitationIn).toBe(0);
    expect(bundle.ensemble).toMatchObject(ensembleStats(synthMembers(expectedHours.map(hour => hour.pop))));
    expect(bundle.ensemble.n).toBe(31);
    expect(bundle.ensemble.perHour).toHaveLength(24);
    expect(bundle.ensemble.live).toBe(false);
    expect(bundle.ensemble.source).toBe("modeled spread");
    expect(bundle.ensemble.memberSeries).toBeUndefined();
  });

  it("uses the partial-hour window probabilities for every quantile and total", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:30:00Z"));
    const expectedPop = [58, 40, 24, 16, 10, 8, 6, 5, 4, 4, 3, 3, 4, 5, 6, 5, 4, 2, 2, 1, 1, 0, 0, 0];

    expect(fallbackBundle().ensemble).toMatchObject(ensembleStats(synthMembers(expectedPop)));
  });
});
