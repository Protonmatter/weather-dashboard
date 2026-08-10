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
});
