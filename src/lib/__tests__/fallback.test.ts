import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackBundle } from "../fallback";
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
});
