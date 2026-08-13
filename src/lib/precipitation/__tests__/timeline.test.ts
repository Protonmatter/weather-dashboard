import { describe, expect, it } from "vitest";
import {
  buildPrecipitationTimeline,
  nearestPrecipitationFrame,
  parseGfsValidTime,
  reconcilePrecipitationSelection,
} from "../timeline";
import type { RadarFrame } from "../../radar/types";

const now = new Date("2026-08-13T16:00:00.000Z");
const observation = (id: string, iso: string): RadarFrame => ({
  id,
  validAt: new Date(iso),
});

describe("unified precipitation timeline", () => {
  it("merges observations and future GFS frames chronologically", () => {
    const timeline = buildPrecipitationTimeline({
      observations: [
        observation("o2", "2026-08-13T15:55:00.000Z"),
        observation("o1", "2026-08-13T15:50:00.000Z"),
      ],
      observationProvider: "noaa-mrms",
      forecastTimes: [
        "2026-08-13T16:00",
        "2026-08-13T17:00",
        "2026-08-14T16:00",
        "2026-08-15T16:00",
      ],
      now,
      horizonHours: 24,
    });

    expect(timeline.frames.map((frame) => [frame.kind, frame.validAt.toISOString()])).toEqual([
      ["observation", "2026-08-13T15:50:00.000Z"],
      ["observation", "2026-08-13T15:55:00.000Z"],
      ["forecast", "2026-08-13T17:00:00.000Z"],
      ["forecast", "2026-08-14T16:00:00.000Z"],
    ]);
    expect(timeline.latestObservationIndex).toBe(1);
    expect(timeline.firstForecastIndex).toBe(2);
    expect(timeline.defaultIndex).toBe(1);
    expect(timeline.horizonHours).toBe(24);
  });

  it("parses provider GMT timestamps as UTC in every viewer timezone", () => {
    expect(parseGfsValidTime("2026-08-13T17:00").toISOString())
      .toBe("2026-08-13T17:00:00.000Z");
    expect(parseGfsValidTime("2026-08-13T17:00:00").toISOString())
      .toBe("2026-08-13T17:00:00.000Z");
  });

  it("removes future-source frames as NOW passes without reclassifying them", () => {
    const input = {
      observations: [observation("o1", "2026-08-13T15:55:00.000Z")],
      observationProvider: "noaa-mrms" as const,
      forecastTimes: ["2026-08-13T17:00", "2026-08-13T18:00"],
      horizonHours: 24 as const,
    };
    const before = buildPrecipitationTimeline({ ...input, now });
    const after = buildPrecipitationTimeline({
      ...input,
      now: new Date("2026-08-13T17:30:00.000Z"),
    });

    expect(before.frames.filter((frame) => frame.kind === "forecast")).toHaveLength(2);
    expect(after.frames.map((frame) => [frame.kind, frame.id])).toEqual([
      ["observation", "observation:noaa-mrms:o1"],
      ["forecast", "forecast:open-meteo-gfs:2026-08-13T18:00:00.000Z"],
    ]);
  });

  it("uses NOW as the slider boundary for forecast-only and observation-only modes", () => {
    const forecastOnly = buildPrecipitationTimeline({
      observations: [],
      observationProvider: "unavailable",
      forecastTimes: ["2026-08-13T17:00", "2026-08-13T18:00"],
      now,
      horizonHours: 24,
    });
    expect(forecastOnly.earliestAt?.toISOString()).toBe(now.toISOString());
    expect(forecastOnly.nowPercent).toBe(0);
    expect(forecastOnly.defaultIndex).toBe(0);

    const observationOnly = buildPrecipitationTimeline({
      observations: [observation("o1", "2026-08-13T15:50:00.000Z")],
      observationProvider: "noaa-mrms",
      forecastTimes: [],
      now,
      horizonHours: 24,
    });
    expect(observationOnly.latestAt?.toISOString()).toBe(now.toISOString());
    expect(observationOnly.nowPercent).toBe(100);
  });

  it("filters 24-hour and 48-hour horizons and clamps a removed selection", () => {
    const base = {
      observations: [observation("o1", "2026-08-13T15:55:00.000Z")],
      observationProvider: "noaa-mrms" as const,
      forecastTimes: ["2026-08-14T15:00", "2026-08-14T17:00", "2026-08-15T15:00"],
      now,
    };
    const extended = buildPrecipitationTimeline({ ...base, horizonHours: 48 });
    const selected = extended.frames.at(-1)!;
    const compact = buildPrecipitationTimeline({ ...base, horizonHours: 24 });

    expect(extended.frames.filter((frame) => frame.kind === "forecast")).toHaveLength(3);
    expect(compact.frames.filter((frame) => frame.kind === "forecast")).toHaveLength(1);
    expect(reconcilePrecipitationSelection(compact, {
      id: selected.id,
      validAtMs: selected.validAt.getTime(),
    })?.validAt.toISOString()).toBe("2026-08-14T15:00:00.000Z");
  });

  it("selects the nearest real frame and resolves ties toward the earlier frame", () => {
    const timeline = buildPrecipitationTimeline({
      observations: [observation("o1", "2026-08-13T15:50:00.000Z")],
      observationProvider: "noaa-mrms",
      forecastTimes: ["2026-08-13T16:10"],
      now,
      horizonHours: 24,
    });
    expect(nearestPrecipitationFrame(
      timeline,
      new Date("2026-08-13T16:00:00.000Z").getTime()
    )?.kind).toBe("observation");
  });

  it("rejects invalid and duplicate provider timestamps", () => {
    expect(() => parseGfsValidTime("2026-08-13 17:00")).toThrow(
      "precipitation timeline: invalid GFS timestamp"
    );
    expect(() => parseGfsValidTime("2026-02-30T17:00")).toThrow(
      "precipitation timeline: invalid GFS timestamp"
    );
    expect(() => buildPrecipitationTimeline({
      observations: [
        observation("duplicate", "2026-08-13T15:50:00.000Z"),
        observation("duplicate", "2026-08-13T15:55:00.000Z"),
      ],
      observationProvider: "noaa-mrms",
      forecastTimes: [],
      now,
      horizonHours: 24,
    })).toThrow("precipitation timeline: duplicate observation id");
    expect(() => buildPrecipitationTimeline({
      observations: [],
      observationProvider: "unavailable",
      forecastTimes: ["2026-08-13T17:00", "2026-08-13T17:00"],
      now,
      horizonHours: 24,
    })).toThrow("precipitation timeline: duplicate forecast timestamp");
  });
});
