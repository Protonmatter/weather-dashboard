import { describe, expect, it } from "vitest";
import {
  assertTimeZone,
  formatLocalDate,
  formatLocalHour,
  formatLocalTime,
  formatLocalWallTime,
  formatLocalWeekday,
  localDateKey,
  timezoneLabel,
} from "../time";

describe("location time", () => {
  it("formats one instant in the selected location rather than the viewer timezone", () => {
    const instant = new Date("2026-08-09T16:30:00Z");

    expect(formatLocalTime(instant, "America/Los_Angeles")).toBe("9:30 AM");
    expect(formatLocalTime(instant, "America/New_York")).toBe("12:30 PM");
  });

  it("derives daylight-saving-aware abbreviations", () => {
    expect(timezoneLabel(new Date("2026-01-15T12:00:00Z"), "America/Los_Angeles")).toBe("PST");
    expect(timezoneLabel(new Date("2026-08-15T12:00:00Z"), "America/Los_Angeles")).toBe("PDT");
  });

  it("formats a wall clock with seconds and a location-local date", () => {
    const instant = new Date("2026-08-09T16:30:07Z");

    expect(formatLocalWallTime(instant, "America/Los_Angeles")).toBe("9:30:07 AM");
    expect(formatLocalDate(instant, "America/Los_Angeles")).toBe("Sun, Aug 9");
  });

  it("formats forecast hour and weekday labels in the location timezone", () => {
    const instant = new Date("2026-08-10T02:00:00Z");

    expect(formatLocalHour(instant, "America/Los_Angeles")).toBe("7PM");
    expect(formatLocalWeekday(instant, "America/Los_Angeles")).toBe("Sun");
    expect(formatLocalHour(instant, "Asia/Tokyo")).toBe("11AM");
    expect(formatLocalWeekday(instant, "Asia/Tokyo")).toBe("Mon");
  });

  it("groups an instant by the location calendar day", () => {
    const instant = new Date("2026-08-10T02:00:00Z");

    expect(localDateKey(instant, "America/Los_Angeles")).toBe("2026-08-09");
    expect(localDateKey(instant, "Asia/Tokyo")).toBe("2026-08-10");
  });

  it("rejects an invalid provider timezone", () => {
    expect(() => assertTimeZone("Mars/Olympus_Mons")).toThrow("forecast: invalid timezone");
  });

  it("rejects missing or empty provider timezones", () => {
    expect(() => assertTimeZone(undefined)).toThrow("forecast: invalid timezone");
    expect(() => assertTimeZone(null)).toThrow("forecast: invalid timezone");
    expect(() => assertTimeZone("")).toThrow("forecast: invalid timezone");
    expect(() => assertTimeZone("   ")).toThrow("forecast: invalid timezone");
  });
});
