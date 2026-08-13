import type { RadarFrame, RadarProviderId } from "../radar/types";
import type {
  ForecastPrecipitationFrame,
  FuturePrecipitationSource,
  ObservationPrecipitationFrame,
  ObservationProviderId,
  PrecipitationFrame,
  PrecipitationHorizonHours,
  PrecipitationSelection,
  PrecipitationTimeline,
} from "./types";

const GFS_WALL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const HOUR_MS = 3_600_000;

export interface BuildPrecipitationTimelineInput {
  observations: readonly RadarFrame[];
  observationProvider: RadarProviderId;
  forecastTimes: readonly string[];
  now: Date;
  horizonHours: PrecipitationHorizonHours;
}

export function parseGfsValidTime(raw: string): Date {
  if (!GFS_WALL_TIME.test(raw)) {
    throw new Error("precipitation timeline: invalid GFS timestamp");
  }
  const value = new Date(`${raw}Z`);
  if (Number.isNaN(value.getTime())) {
    throw new Error("precipitation timeline: invalid GFS timestamp");
  }
  const canonical = value.toISOString().slice(0, raw.length);
  if (canonical !== raw) {
    throw new Error("precipitation timeline: invalid GFS timestamp");
  }
  return value;
}

export function gfsFuturePrecipitationSource(
  forecastTimes: readonly string[]
): FuturePrecipitationSource {
  const seen = new Set<number>();
  const frames = forecastTimes.map((raw, sourceIndex) => {
    const validAt = parseGfsValidTime(raw);
    const timestamp = validAt.getTime();
    if (seen.has(timestamp)) {
      throw new Error("precipitation timeline: duplicate forecast timestamp");
    }
    seen.add(timestamp);
    return {
      id: `gfs:${validAt.toISOString()}`,
      validAt,
      sourceIndex,
    };
  });
  return {
    provider: "open-meteo-gfs",
    kind: "modeled-precipitation",
    frames,
    attribution: {
      label: "Open-Meteo GFS",
      url: "https://open-meteo.com/en/docs/gfs-api",
    },
    coverage: frames.length ? "available" : "unavailable",
  };
}

const finiteDate = (date: Date, label: string): number => {
  const value = date.getTime();
  if (!Number.isFinite(value)) {
    throw new Error(`precipitation timeline: invalid ${label}`);
  }
  return value;
};

const percent = (value: number, start: number, end: number): number =>
  end <= start ? 0 : Math.min(100, Math.max(0, ((value - start) / (end - start)) * 100));

function observationFrames(
  observations: readonly RadarFrame[],
  provider: RadarProviderId,
  nowMs: number
): ObservationPrecipitationFrame[] {
  const seen = new Set<string>();
  for (const frame of observations) {
    if (seen.has(frame.id)) {
      throw new Error("precipitation timeline: duplicate observation id");
    }
    seen.add(frame.id);
    finiteDate(frame.validAt, "observation timestamp");
  }
  if (provider === "unavailable") return [];
  const observationProvider: ObservationProviderId = provider;
  return observations
    .filter((frame) => frame.validAt.getTime() <= nowMs)
    .map((radarFrame) => ({
      kind: "observation" as const,
      id: `observation:${observationProvider}:${radarFrame.id}`,
      validAt: new Date(radarFrame.validAt),
      provider: observationProvider,
      radarFrame,
    }))
    .sort((left, right) =>
      left.validAt.getTime() - right.validAt.getTime() || left.id.localeCompare(right.id)
    );
}

function forecastFrames(
  forecastTimes: readonly string[],
  nowMs: number,
  horizonHours: PrecipitationHorizonHours
): ForecastPrecipitationFrame[] {
  const horizonEnd = nowMs + horizonHours * HOUR_MS;
  return gfsFuturePrecipitationSource(forecastTimes).frames
    .filter((frame) => {
      const validAt = frame.validAt.getTime();
      return validAt > nowMs && validAt <= horizonEnd;
    })
    .map((frame) => ({
      kind: "forecast" as const,
      id: `forecast:open-meteo-gfs:${frame.validAt.toISOString()}`,
      validAt: new Date(frame.validAt),
      provider: "open-meteo-gfs" as const,
      forecastIndex: frame.sourceIndex,
    }))
    .sort((left, right) => left.validAt.getTime() - right.validAt.getTime());
}

export function buildPrecipitationTimeline(
  input: BuildPrecipitationTimelineInput
): PrecipitationTimeline {
  const nowMs = finiteDate(input.now, "NOW timestamp");
  const observations = observationFrames(input.observations, input.observationProvider, nowMs);
  const forecasts = forecastFrames(input.forecastTimes, nowMs, input.horizonHours);
  const frames: PrecipitationFrame[] = [...observations, ...forecasts].sort(
    (left, right) => left.validAt.getTime() - right.validAt.getTime() || left.id.localeCompare(right.id)
  );
  const latestObservationIndex = observations.length ? observations.length - 1 : null;
  const firstForecastIndex = forecasts.length ? observations.length : null;
  const defaultIndex = latestObservationIndex ?? firstForecastIndex;
  const earliestAt = observations[0]?.validAt ?? (forecasts.length ? new Date(nowMs) : null);
  const latestAt = forecasts.at(-1)?.validAt ?? (observations.length ? new Date(nowMs) : null);
  const nowPercent = earliestAt && latestAt
    ? percent(nowMs, earliestAt.getTime(), latestAt.getTime())
    : 0;

  return {
    frames,
    now: new Date(nowMs),
    nowPercent,
    earliestAt: earliestAt ? new Date(earliestAt) : null,
    latestAt: latestAt ? new Date(latestAt) : null,
    latestObservationIndex,
    firstForecastIndex,
    defaultIndex,
    horizonHours: input.horizonHours,
  };
}

export function nearestPrecipitationFrame(
  timeline: PrecipitationTimeline,
  targetMs: number
): PrecipitationFrame | null {
  if (!timeline.frames.length || !Number.isFinite(targetMs)) return null;
  let nearest = timeline.frames[0]!;
  let distance = Math.abs(nearest.validAt.getTime() - targetMs);
  for (const frame of timeline.frames.slice(1)) {
    const candidateDistance = Math.abs(frame.validAt.getTime() - targetMs);
    if (
      candidateDistance < distance ||
      (candidateDistance === distance && frame.validAt.getTime() < nearest.validAt.getTime())
    ) {
      nearest = frame;
      distance = candidateDistance;
    }
  }
  return nearest;
}

export function reconcilePrecipitationSelection(
  timeline: PrecipitationTimeline,
  previous: PrecipitationSelection | null
): PrecipitationFrame | null {
  if (!timeline.frames.length) return null;
  if (previous) {
    const exact = timeline.frames.find((frame) => frame.id === previous.id);
    if (exact) return exact;
    const nearest = nearestPrecipitationFrame(timeline, previous.validAtMs);
    if (nearest) return nearest;
  }
  return timeline.defaultIndex == null ? null : timeline.frames[timeline.defaultIndex] ?? null;
}
