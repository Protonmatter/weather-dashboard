# Unified Precipitation Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the observation-only radar view with one time-proportional precipitation timeline that preserves provider-native radar history through `NOW` and continues into clearly labelled Open-Meteo GFS precipitation through `+24h` by default or `+48h` on demand.

**Architecture:** Keep `ForecastMap` as the shared map, viewport, and forecast-grid owner. Move observation imagery into a focused `ObservedRadarLayer`, render future GFS precipitation through a separate canvas layer, and coordinate both through a pure timeline model plus a small React orchestration hook inside a lazy `PrecipitationTimelinePanel`. The same already-loaded `MapForecastGrid` is passed into the lazy panel; no second GFS request is permitted.

**Tech Stack:** React 18, TypeScript 5.5 strict mode, Vite 7, Vitest 3 in Node mode, Playwright 1.62, Canvas 2D, NOAA/NWS MRMS ArcGIS imagery, RainViewer raster tiles, Open-Meteo GFS forecast grids.

## Global Constraints

- Keep the application client-only and keyless; add no backend, authentication, telemetry, cookie, or storage-schema change.
- Add no runtime dependency.
- Preserve the existing NOAA/RainViewer provider selection, fixed origins, HTTPS validation, antimeridian handling, cache, timeout, retry, abort, and circuit-breaker boundaries.
- Retain all usable observation frames at or before `NOW`; retain only GFS forecast frames after `NOW`.
- Default the future horizon to exactly `24` hours and expose an in-session-only `48`-hour option.
- Never present GFS precipitation under `OBSERVED`, `RADAR OBSERVATION`, `MRMS`, or reflectivity terminology.
- Use a visible, textual, time-proportional `NOW` boundary; do not use frame count to place it.
- Do not interpolate, blend, morph, or crossfade across the observation/forecast boundary.
- Reuse the existing `MapForecastGrid`; the precipitation timeline must issue no duplicate Open-Meteo forecast request.
- Keep radar code lazy until the user first selects `Precipitation timeline`.
- Do not preload observation imagery; request only the selected observation frame.
- Keep all playback and action controls at least 44 CSS pixels.
- `prefers-reduced-motion` disables automatic playback while preserving slider, previous, and next controls.
- Preserve forced-colors, keyboard, touch, and screen-reader semantics.
- Initial JavaScript must remain at or below **73 kB gzip** and total JavaScript at or below the owner-approved **99 kB gzip** ceiling.
- Implement Phase 1 with GFS modeled precipitation only; define but do not implement the later `hrrr-simulated-reflectivity` provider.
- Do not merge or deploy until the complete PR CI matrix and all review threads are green.

---

## File Structure

### Create

- `src/lib/precipitation/types.ts`: provider-neutral observation, forecast, future-source, timeline, horizon, and presentation contracts.
- `src/lib/precipitation/timeline.ts`: strict UTC parsing, GFS future-source adaptation, chronological merge, time-proportional boundary, nearest-frame selection, and selection reconciliation.
- `src/lib/precipitation/presentation.ts`: source badge, timestamp, legend, attribution, and accessible value-text generation.
- `src/lib/precipitation/__tests__/timeline.test.ts`: timeline construction, validation, horizon, selection, and advancing-`NOW` tests.
- `src/lib/precipitation/__tests__/presentation.test.ts`: terminology and accessibility tests that prevent forecast-as-radar regressions.
- `src/hooks/usePrecipitationTimeline.ts`: horizon, selected-frame, play/pause, previous/next, and rebuild reconciliation state.
- `src/components/ObservedRadarLayer.tsx`: selected-frame-only NOAA/RainViewer imagery with atomic swap and retained-layer behavior.
- `src/components/ForecastPrecipitationLayer.tsx`: selected GFS precipitation frame rendered through the existing canvas renderer.
- `src/components/PrecipitationTimelinePanel.tsx`: lazy source orchestration, timeline controls, `NOW` marker, legends, failures, retries, and source switching.
- `src/components/PrecipitationTimelineBoundary.tsx`: lazy-chunk containment and return-to-forecast recovery.
- `e2e/precipitation-timeline.spec.ts`: deterministic interaction, semantics, degraded-mode, clock, and location journeys.
- `e2e/precipitation-timeline-liquid-glass.visual.spec.ts`: deterministic observation, boundary, forecast, horizon, and degraded-state visual baselines.
- `docs/rfcs/0006-unified-precipitation-timeline.md`: accepted architecture and future simulated-reflectivity seam.

### Modify

- `src/components/ForecastMap.tsx`: rename the map mode, pass the existing forecast grid/state into the lazy panel, host source-specific overlays, and preserve the existing forecast-fields mode.
- `src/index.css`: timeline segment, `NOW` marker, selected-horizon, reduced-motion, and forced-colors presentation.
- `e2e/journeys.spec.ts`: update the existing lazy-load, NOAA, RainViewer, map-tab, image-retention, and reduced-motion journeys to the new tab and test IDs.
- `README.md`: document the unified timeline, source distinction, horizons, and limitations.
- `docs/rfcs/0005-local-context-and-radar.md`: mark the observation-only UI decision as extended by RFC 0006.
- `docs/superpowers/specs/2026-08-13-unified-precipitation-timeline-design.md`: change status to implemented only after all acceptance gates pass.

### Delete after migration

- `src/components/RadarPanel.tsx`
- `src/components/RadarPanelBoundary.tsx`

---

### Task 1: Define and Validate the Unified Timeline Domain

**Files:**

- Create: `src/lib/precipitation/types.ts`
- Create: `src/lib/precipitation/timeline.ts`
- Create: `src/lib/precipitation/__tests__/timeline.test.ts`

**Interfaces:**

- Consumes: `RadarFrame` and `RadarProviderId` from `src/lib/radar/types.ts`.
- Produces:
  - `PrecipitationHorizonHours`
  - `ObservationPrecipitationFrame`
  - `ForecastPrecipitationFrame`
  - `PrecipitationFrame`
  - `FuturePrecipitationSource`
  - `PrecipitationTimeline`
  - `parseGfsValidTime(raw: string): Date`
  - `gfsFuturePrecipitationSource(forecastTimes: readonly string[]): FuturePrecipitationSource`
  - `buildPrecipitationTimeline(input): PrecipitationTimeline`
  - `nearestPrecipitationFrame(timeline, targetMs): PrecipitationFrame | null`
  - `reconcilePrecipitationSelection(timeline, previous): PrecipitationFrame | null`

- [ ] **Step 1: Write the failing timeline tests**

Create `src/lib/precipitation/__tests__/timeline.test.ts` with fixed instants, not `Date.now()`:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run:

```bash
npx vitest run src/lib/precipitation/__tests__/timeline.test.ts
```

Expected: FAIL because `src/lib/precipitation/timeline.ts` and `types.ts` do not exist.

- [ ] **Step 3: Implement the typed contracts**

Create `src/lib/precipitation/types.ts`:

```ts
import type { RadarFrame, RadarProviderId } from "../radar/types";

export type PrecipitationHorizonHours = 24 | 48;
export type ObservationProviderId = Exclude<RadarProviderId, "unavailable">;

export interface SourceAttribution {
  label: string;
  url: string;
}

export interface ObservationPrecipitationFrame {
  kind: "observation";
  id: string;
  validAt: Date;
  provider: ObservationProviderId;
  radarFrame: RadarFrame;
}

export interface ForecastPrecipitationFrame {
  kind: "forecast";
  id: string;
  validAt: Date;
  provider: "open-meteo-gfs";
  forecastIndex: number;
}

export type PrecipitationFrame =
  | ObservationPrecipitationFrame
  | ForecastPrecipitationFrame;

export interface FuturePrecipitationFrame {
  id: string;
  validAt: Date;
  sourceIndex: number;
}

export interface FuturePrecipitationSource {
  provider: "open-meteo-gfs" | "hrrr-simulated-reflectivity";
  kind: "modeled-precipitation" | "simulated-reflectivity";
  frames: readonly FuturePrecipitationFrame[];
  attribution: SourceAttribution;
  coverage: "available" | "unavailable";
}

export interface PrecipitationTimeline {
  frames: readonly PrecipitationFrame[];
  now: Date;
  nowPercent: number;
  earliestAt: Date | null;
  latestAt: Date | null;
  latestObservationIndex: number | null;
  firstForecastIndex: number | null;
  defaultIndex: number | null;
  horizonHours: PrecipitationHorizonHours;
}

export interface PrecipitationSelection {
  id: string;
  validAtMs: number;
}
```

- [ ] **Step 4: Implement strict UTC parsing and the GFS future-source adapter**

In `src/lib/precipitation/timeline.ts`, implement and export:

```ts
const GFS_WALL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const HOUR_MS = 3_600_000;

export function parseGfsValidTime(raw: string): Date {
  if (!GFS_WALL_TIME.test(raw)) {
    throw new Error("precipitation timeline: invalid GFS timestamp");
  }
  const value = new Date(`${raw}Z`);
  if (Number.isNaN(value.getTime())) {
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
```

Do not add an HRRR fetcher or renderer. The union member exists only to stabilize the future interface.

- [ ] **Step 5: Implement timeline construction and selection helpers**

Implement `buildPrecipitationTimeline`, `nearestPrecipitationFrame`, and `reconcilePrecipitationSelection` with these exact rules:

```ts
const finiteDate = (date: Date, label: string): number => {
  const value = date.getTime();
  if (!Number.isFinite(value)) {
    throw new Error(`precipitation timeline: invalid ${label}`);
  }
  return value;
};

const percent = (value: number, start: number, end: number): number =>
  end <= start ? 0 : Math.min(100, Math.max(0, ((value - start) / (end - start)) * 100));
```

- Prefix observation IDs as `observation:${provider}:${radarFrame.id}`.
- Prefix forecast IDs as `forecast:open-meteo-gfs:${validAt.toISOString()}`.
- Ignore supplied observation frames when `observationProvider === "unavailable"`.
- Throw for duplicate observation IDs before filtering by time.
- Exclude observations later than `now`.
- Exclude forecast frames at or before `now`.
- Exclude forecast frames later than `now + horizonHours`.
- Set `earliestAt` to the earliest observation, otherwise to `now` when forecasts exist.
- Set `latestAt` to the latest forecast, otherwise to `now` when observations exist.
- Use the latest observation as `defaultIndex`; otherwise use the first forecast.
- Resolve equal-distance nearest-frame ties toward the earlier frame.
- Reconcile a missing prior selection to the nearest remaining timestamp, which clamps `+48h` selections when contracting to `+24h`.

- [ ] **Step 6: Run the focused tests**

Run:

```bash
npx vitest run src/lib/precipitation/__tests__/timeline.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the full unit suite and typecheck**

Run:

```bash
npm run typecheck
npm test
```

Expected: both commands exit `0`.

- [ ] **Step 8: Commit the domain layer**

```bash
git add src/lib/precipitation
git commit -m "feat(map): add unified precipitation timeline domain"
```

---

### Task 2: Add Source-Safe Presentation Semantics

**Files:**

- Create: `src/lib/precipitation/presentation.ts`
- Create: `src/lib/precipitation/__tests__/presentation.test.ts`

**Interfaces:**

- Consumes: `PrecipitationFrame`, `SourceAttribution`, and existing timezone formatters.
- Produces:
  - `PrecipitationLegend`
  - `precipitationProviderLabel(frame)`
  - `precipitationSourceBadge(frame)`
  - `precipitationTimestampLabel(frame, timezone)`
  - `precipitationAriaValueText(frame, timezone)`
  - `precipitationLegend(frame)`
  - `precipitationAttribution(frame, radarAttribution)`

- [ ] **Step 1: Write terminology regression tests**

```ts
import { describe, expect, it } from "vitest";
import {
  precipitationAriaValueText,
  precipitationLegend,
  precipitationSourceBadge,
  precipitationTimestampLabel,
} from "../presentation";
import type { ForecastPrecipitationFrame, ObservationPrecipitationFrame } from "../types";

const observation: ObservationPrecipitationFrame = {
  kind: "observation",
  id: "observation:noaa-mrms:o1",
  validAt: new Date("2026-08-13T16:00:00.000Z"),
  provider: "noaa-mrms",
  radarFrame: { id: "o1", validAt: new Date("2026-08-13T16:00:00.000Z") },
};
const forecast: ForecastPrecipitationFrame = {
  kind: "forecast",
  id: "forecast:open-meteo-gfs:2026-08-13T17:00:00.000Z",
  validAt: new Date("2026-08-13T17:00:00.000Z"),
  provider: "open-meteo-gfs",
  forecastIndex: 3,
};

describe("precipitation presentation", () => {
  it("labels observation frames as radar reflectivity", () => {
    expect(precipitationSourceBadge(observation)).toBe("OBSERVED · NOAA / NWS MRMS");
    expect(precipitationLegend(observation)).toMatchObject({
      title: "Radar reflectivity",
      note: "Precipitation intensity, not a surface total",
    });
    expect(precipitationTimestampLabel(observation, "America/New_York"))
      .toMatch(/^Observed /);
  });

  it("never labels GFS precipitation as radar or observed", () => {
    const badge = precipitationSourceBadge(forecast);
    const legend = precipitationLegend(forecast);
    const aria = precipitationAriaValueText(forecast, "America/New_York");

    expect(badge).toBe("MODEL FORECAST · Open-Meteo GFS");
    expect(legend).toEqual({
      title: "Modeled precipitation",
      stops: "rgba(0,0,0,0), #4fc3f7, #4464d9, #6d2ab3",
      labels: ["0", "1", "5", "10+ mm"],
      note: "Hour-ending modeled total, not radar reflectivity",
    });
    expect(aria).toMatch(/^Model forecast, Open-Meteo GFS, /);
    expect(`${badge} ${legend.title} ${aria}`).not.toMatch(/\bOBSERVED\b|\bMRMS\b|Radar observation/);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npx vitest run src/lib/precipitation/__tests__/presentation.test.ts
```

Expected: FAIL because `presentation.ts` does not exist.

- [ ] **Step 3: Implement source-specific copy and legends**

Use existing `formatLocalDate`, `formatLocalTime`, and `timezoneLabel`:

```ts
export function precipitationTimestampLabel(
  frame: PrecipitationFrame,
  timeZone: string
): string {
  const time = `${formatLocalTime(frame.validAt, timeZone)} ${timezoneLabel(frame.validAt, timeZone)}`;
  const date = formatLocalDate(frame.validAt, timeZone);
  return frame.kind === "observation"
    ? `Observed ${time} · ${date}`
    : `Forecast for ${time} · ${date}`;
}
```

Observation legend:

```ts
{
  title: "Radar reflectivity",
  stops: "transparent, #42d6ff, #3fd05a, #ffe04a, #ff7b31, #e82f45, #bd44dd",
  labels: ["Light", "Moderate", "Heavy"],
  note: "Precipitation intensity, not a surface total",
}
```

Forecast legend must use the exact modeled-precipitation wording asserted above.

- [ ] **Step 4: Implement accessible value text and attribution**

The accessible text must be one complete phrase:

```ts
export function precipitationAriaValueText(
  frame: PrecipitationFrame,
  timeZone: string
): string {
  const local = `${formatLocalTime(frame.validAt, timeZone)} ${timezoneLabel(frame.validAt, timeZone)}, ${formatLocalDate(frame.validAt, timeZone)}`;
  return frame.kind === "observation"
    ? `Observed, ${precipitationProviderLabel(frame)}, ${local}`
    : `Model forecast, Open-Meteo GFS, ${local}`;
}
```

`precipitationAttribution` returns the selected radar source attribution for observations and the fixed Open-Meteo GFS attribution for forecasts.

- [ ] **Step 5: Run focused and full unit tests**

```bash
npx vitest run src/lib/precipitation/__tests__/presentation.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit presentation semantics**

```bash
git add src/lib/precipitation/presentation.ts src/lib/precipitation/__tests__/presentation.test.ts
git commit -m "feat(map): add precipitation source semantics"
```

---

### Task 3: Add Timeline Selection and Playback Orchestration

**Files:**

- Create: `src/hooks/usePrecipitationTimeline.ts`
- Modify: `src/lib/precipitation/__tests__/timeline.test.ts`

**Interfaces:**

- Consumes: `buildPrecipitationTimeline`, `nearestPrecipitationFrame`, `reconcilePrecipitationSelection`.
- Produces:

```ts
export interface UsePrecipitationTimelineInput {
  observations: readonly RadarFrame[];
  observationProvider: RadarProviderId;
  forecastTimes: readonly string[];
  now: Date;
  initialHorizon?: PrecipitationHorizonHours;
  reducedMotion: boolean;
}

export interface UsePrecipitationTimelineResult {
  timeline: PrecipitationTimeline;
  selectedFrame: PrecipitationFrame | null;
  horizonHours: PrecipitationHorizonHours;
  playing: boolean;
  selectTimestamp(targetMs: number): void;
  selectFrame(frame: PrecipitationFrame): void;
  step(direction: -1 | 1): void;
  setHorizonHours(value: PrecipitationHorizonHours): void;
  setPlaying(value: boolean): void;
  stop(): void;
}
```

Playback timing remains in the panel because image readiness, page visibility, and map visibility are renderer concerns. The hook owns play state and deterministic frame stepping.

- [ ] **Step 1: Extend unit tests for selection reconciliation**

Add tests that prove:

```ts
it("preserves a selected frame across source refresh when its id remains", () => {
  const first = buildPrecipitationTimeline(/* fixed input */);
  const selected = first.frames.find((frame) => frame.kind === "forecast")!;
  const refreshed = buildPrecipitationTimeline(/* same timestamps plus one later frame */);

  expect(reconcilePrecipitationSelection(refreshed, {
    id: selected.id,
    validAtMs: selected.validAt.getTime(),
  })?.id).toBe(selected.id);
});
```

Also assert that an empty timeline reconciles to `null` and that stepping wraps from the last frame to the first.

- [ ] **Step 2: Run the focused test and observe the missing helper behavior**

```bash
npx vitest run src/lib/precipitation/__tests__/timeline.test.ts
```

Expected: FAIL until the stepping helper used by the hook is exported.

- [ ] **Step 3: Add a pure stepping helper**

Export from `timeline.ts`:

```ts
export function stepPrecipitationFrame(
  timeline: PrecipitationTimeline,
  current: PrecipitationFrame | null,
  direction: -1 | 1
): PrecipitationFrame | null {
  if (!timeline.frames.length) return null;
  const currentIndex = current
    ? timeline.frames.findIndex((frame) => frame.id === current.id)
    : timeline.defaultIndex ?? 0;
  const index = currentIndex < 0 ? timeline.defaultIndex ?? 0 : currentIndex;
  const next = (index + direction + timeline.frames.length) % timeline.frames.length;
  return timeline.frames[next] ?? null;
}
```

- [ ] **Step 4: Implement the React hook**

Key implementation rules:

- `horizonHours` initializes to `24`.
- Store `{ id, validAtMs } | null`, not an array index.
- Rebuild the pure timeline with `useMemo`.
- Resolve `selectedFrame` with `reconcilePrecipitationSelection`.
- On a timeline rebuild, update stored selection only when the resolved frame changed.
- `setHorizonHours(24)` preserves the current timestamp and clamps to the nearest retained frame.
- `reducedMotion === true` forces `playing` to `false`.
- An empty timeline forces selection to `null` and playback to `false`.
- The component using the hook is keyed by place, so a location change remounts and returns to `24h` plus the default frame.

Use stable callbacks and avoid including the entire frame array in callback dependency lists when `timeline` is sufficient.

- [ ] **Step 5: Run unit tests and typecheck**

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit orchestration state**

```bash
git add src/hooks/usePrecipitationTimeline.ts src/lib/precipitation
git commit -m "feat(map): add precipitation timeline state"
```

---

### Task 4: Extract Observation Imagery Without Changing Existing Behavior

**Files:**

- Create: `src/components/ObservedRadarLayer.tsx`
- Modify: `src/components/RadarPanel.tsx`
- Test: existing `e2e/journeys.spec.ts`

**Interfaces:**

- Consumes: `RadarSource`, selected `RadarFrame`, `MapViewport`, `Place`, `RadarImageLayer`, NOAA/RainViewer URL builders.
- Produces:

```ts
export interface ObservedRadarLayerProps {
  active: boolean;
  place: Place;
  source: RadarSource | null;
  frame: RadarFrame | null;
  viewport: MapViewport;
  retryGeneration: number;
  onLayerLoad(validAt: Date): void;
  onLayerError(message: string): void;
}
```

`ObservedRadarLayer` renders no controls and performs no metadata fetch. It owns settled-viewport image specification and atomic image swapping only.

- [ ] **Step 1: Run the existing radar browser journeys before refactoring**

```bash
npm run build
npx playwright test e2e/journeys.spec.ts --project=chromium --grep "radar|RainViewer|NOAA"
```

Expected: PASS. Save the test count in the task notes; the same set must pass after extraction.

- [ ] **Step 2: Move settled-viewport and image-spec construction into the new component**

Move these responsibilities from `RadarPanel.tsx` without semantic changes:

- `NOAA_VIEWPORT_SETTLE_MS = 200`
- `useSettledViewport`
- `visibleTiles`
- NOAA `noaaImageLayers`
- RainViewer `rainViewerTileUrl`
- provider/place/viewport context key
- request key
- `RadarImageLayer`

The component root must be synchronously hidden when `active === false`:

```tsx
<div
  hidden={!active}
  className="absolute inset-0 z-10 pointer-events-none"
  data-testid="precipitation-observation-overlay"
>
  <RadarImageLayer
    active={active}
    contextKey={contextKey}
    requestKey={requestKey}
    retryGeneration={retryGeneration}
    images={images}
    onLayerLoad={() => frame && onLayerLoad(frame.validAt)}
    onLayerError={() =>
      onLayerError(
        "Radar imagery could not be loaded. The last successful layer remains visible when available."
      )
    }
  />
</div>
```

Build no candidate image URLs when `frame === null`; retain the mounted `RadarImageLayer` so the last complete same-context layer remains available when returning to an observation frame.

- [ ] **Step 3: Make the existing `RadarPanel` consume the extracted layer**

Keep the current observation-only controls and IDs temporarily. Replace its portal imagery block with `ObservedRadarLayer`, retaining:

- `loadedObservation`
- `imageFailure`
- `imageRetryGeneration`
- playback pause on image error
- retained-observation timestamp semantics
- observation legend and attribution
- metadata retry

This step is a behavior-preserving extraction only.

- [ ] **Step 4: Run focused E2E after extraction**

```bash
npm run build
npx playwright test e2e/journeys.spec.ts --project=chromium --grep "radar|RainViewer|NOAA"
```

Expected: the same focused test count and all PASS.

- [ ] **Step 5: Run typecheck and unit tests**

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit the extraction**

```bash
git add src/components/ObservedRadarLayer.tsx src/components/RadarPanel.tsx
git commit -m "refactor(map): extract observed radar layer"
```

---

### Task 5: Build and Integrate the Unified Precipitation Panel

**Files:**

- Create: `src/components/ForecastPrecipitationLayer.tsx`
- Create: `src/components/PrecipitationTimelinePanel.tsx`
- Create: `src/components/PrecipitationTimelineBoundary.tsx`
- Modify: `src/components/ForecastMap.tsx`
- Modify: `src/index.css`
- Delete: `src/components/RadarPanel.tsx`
- Delete: `src/components/RadarPanelBoundary.tsx`
- Test: `e2e/journeys.spec.ts`

**Interfaces:**

`ForecastPrecipitationLayer`:

```ts
export interface ForecastPrecipitationLayerProps {
  active: boolean;
  grid: MapForecastGrid | null;
  forecastIndex: number | null;
  viewport: MapViewport;
  ariaLabel: string;
}
```

`PrecipitationTimelinePanel`:

```ts
export interface PrecipitationTimelinePanelProps {
  place: Place;
  timezone: string;
  viewport: MapViewport;
  overlayHost: HTMLDivElement | null;
  active: boolean;
  reducedMotion: boolean;
  mapVisible: boolean;
  pageVisible: boolean;
  forecastState: MapLoadState<MapForecastGrid>;
  forecastGrid: MapForecastGrid | null;
  onRetryForecast(): void;
}
```

- [ ] **Step 1: Write failing integration expectations in `e2e/journeys.spec.ts`**

Update the existing map-mode test first:

```ts
const precipitationTab = page.getByRole("tab", { name: "Precipitation timeline" });
await forecastTab.focus();
await page.keyboard.press("ArrowRight");
await expect(precipitationTab).toBeFocused();
await expect(precipitationTab).toHaveAttribute("aria-selected", "true");
await expect(page.getByRole("heading", { name: "Precipitation timeline map" })).toBeVisible();
await expect(page.locator("#precipitation-map-mode-panel")).toBeVisible();
```

Update the lazy-chunk failure route and recovery:

```ts
await page.route(
  /\/assets\/PrecipitationTimelinePanel-[^/]+\.js(?:\?.*)?$/,
  (route) => route.abort("failed")
);
```

Expected failure before implementation: the tab and chunk do not exist.

- [ ] **Step 2: Implement the forecast precipitation canvas layer**

`ForecastPrecipitationLayer` must:

- derive a `MapFrame` with `frameAt(grid, forecastIndex)`;
- call `renderMap` with `layer: "precipitation"` and `wind: false`;
- clear the canvas when inactive or data is unavailable;
- set `hidden={!active}` and `data-testid="precipitation-forecast-overlay"`;
- expose `role="img"` and the supplied modeled-forecast `ariaLabel`;
- never import or mention radar providers.

Core render effect:

```ts
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  if (!active || !grid || forecastIndex == null) {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  renderMap({
    canvas,
    frame: frameAt(grid, forecastIndex),
    layer: "precipitation",
    rows: grid.rows,
    cols: grid.cols,
    width: viewport.width,
    height: viewport.height,
    wind: false,
  });
}, [active, forecastIndex, grid, viewport.height, viewport.width]);
```

- [ ] **Step 3: Implement the lazy precipitation panel**

Inside `PrecipitationTimelinePanel`:

1. Call `useRadar(place, true)`.
2. Call `useClock(60_000)`.
3. Call `usePrecipitationTimeline` with `source?.frames ?? []`, `source?.provider ?? radarProviderFor(place)`, and `forecastGrid?.times ?? []`.
4. Key the panel from `ForecastMap` with `radarKey(place)` so place changes reset horizon, selection, and playback.
5. Render both source layers through one portal into `overlayHost`.
6. Set the observation layer active only for an observation frame.
7. Set the forecast layer active only for a forecast frame.
8. Never render both layers as active in the same commit.

The overlay portal structure must be source-explicit:

```tsx
<div className="absolute inset-0 z-10 pointer-events-none" data-testid="precipitation-overlay">
  <ObservedRadarLayer active={active && selectedFrame?.kind === "observation"} ... />
  <ForecastPrecipitationLayer
    active={active && selectedFrame?.kind === "forecast"}
    grid={forecastGrid}
    forecastIndex={selectedFrame?.kind === "forecast" ? selectedFrame.forecastIndex : null}
    viewport={viewport}
    ariaLabel={selectedFrame ? precipitationAriaValueText(selectedFrame, timezone) : ""}
  />
  {selectedFrame && <PrecipitationLegend frame={selectedFrame} />}
</div>
```

Implement the legend inline or as a small private component in the same file; do not create another public abstraction.

- [ ] **Step 4: Implement timeline controls and source copy**

The control panel must use:

```tsx
<div
  id="precipitation-map-mode-panel"
  role="tabpanel"
  aria-labelledby="precipitation-map-tab"
  hidden={!active}
  data-testid="precipitation-panel"
>
```

Required controls and IDs:

- play/pause: `data-testid="precipitation-playback"`
- previous: `aria-label="Previous precipitation frame"`
- next: `aria-label="Next precipitation frame"`
- source badge: `data-testid="precipitation-source"`
- timestamp: `data-testid="precipitation-valid-time"`
- range input: `data-testid="precipitation-time"`
- `NOW` marker: `data-testid="precipitation-now"`
- 24-hour control: `data-testid="precipitation-horizon-24"`
- 48-hour control: `data-testid="precipitation-horizon-48"`
- observation overlay: `data-testid="precipitation-observation-overlay"`
- forecast overlay: `data-testid="precipitation-forecast-overlay"`
- legend: `data-testid="precipitation-legend"`

The range input uses epoch milliseconds:

```tsx
<input
  type="range"
  min={timeline.earliestAt?.getTime() ?? 0}
  max={timeline.latestAt?.getTime() ?? 0}
  value={selectedFrame?.validAt.getTime() ?? 0}
  onChange={(event) => selectTimestamp(Number(event.currentTarget.value))}
  aria-label="Precipitation valid time"
  aria-valuetext={
    selectedFrame
      ? precipitationAriaValueText(selectedFrame, timezone)
      : "Precipitation timeline unavailable"
  }
/>
```

Position the marker from `timeline.nowPercent`, not from frame indexes:

```tsx
<span
  className="precipitation-now-marker"
  style={{ left: `${timeline.nowPercent}%` }}
  data-testid="precipitation-now"
>
  NOW
</span>
```

- [ ] **Step 5: Implement playback and readiness gates**

Use one constant frame interval, `900` ms. Playback advances through real frames with `step(1)` and loops.

Pause or block automatic advance when:

- `active` is false;
- `playing` is false;
- reduced motion is enabled;
- map is offscreen;
- page is hidden;
- fewer than two frames exist;
- the selected observation frame has not completed loading;
- observation imagery failed.

Forecast frames are ready when `forecastGrid` contains the selected `forecastIndex`.

When crossing `NOW`, the selected-frame state change must update the active renderer, badge, legend, timestamp, and accessible text together.

- [ ] **Step 6: Implement independent source failure states**

Observation failure with forecast data:

- keep forecast frames enabled;
- show `Radar observations could not be loaded.`;
- expose `Retry radar`;
- render `OBSERVED UNAVAILABLE` on the left segment.

Forecast failure with observations:

- keep observation frames enabled;
- disable both horizon controls;
- show `Modeled forecast precipitation could not be loaded.`;
- expose `Retry forecast`.

Both unavailable:

- leave base map, marker, pan, zoom, and tabs functional;
- disable timeline range and playback;
- show both actionable failures;
- do not imply zero precipitation.

Image failure:

- pause;
- retain the last complete same-context observation layer;
- show `Retry imagery`;
- do not move selection or substitute a forecast frame.

- [ ] **Step 7: Add timeline and forced-colors CSS**

Add focused classes to `src/index.css`:

```css
.precipitation-timeline-track {
  position: relative;
  padding-top: 1.25rem;
}
.precipitation-now-marker {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  border-left: 2px solid rgb(255 255 255 / 0.8);
  padding-left: 0.25rem;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.precipitation-segment-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.625rem;
  letter-spacing: 0.08em;
}
@media (forced-colors: active) {
  .precipitation-now-marker {
    border-color: CanvasText;
  }
  .precipitation-horizon[aria-pressed="true"] {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
```

Use existing glass-control classes and retain 44-pixel minimum heights.

- [ ] **Step 8: Integrate the panel into `ForecastMap`**

Make these exact changes:

- Rename `MapMode` to `"forecast" | "precipitation"`.
- Rename `radarTabRef` to `precipitationTabRef`.
- Rename `radarRequested` to `precipitationRequested`.
- Rename `radarHost` to `precipitationHost`.
- Lazy import `./PrecipitationTimelinePanel`.
- Keep `useForecastMap(spec, enabled)` in `ForecastMap`; pass its `state`, `grid`, and `retry` to the lazy panel.
- Change the card title to `Precipitation timeline map` in precipitation mode.
- Change the tab text to `Precipitation timeline`.
- Use IDs `precipitation-map-tab` and `precipitation-map-mode-panel`.
- Hide the existing forecast field and wind canvases when mode is precipitation.
- Keep base tiles, marker, pan, zoom, recenter, and attribution shared.
- Update the map region label from `radar map` to `precipitation timeline map`.
- Preserve the hidden placeholder tabpanel before the lazy chunk is first requested.
- Wrap the lazy panel in `PrecipitationTimelineBoundary`.

Pass the existing grid directly:

```tsx
<PrecipitationTimelinePanel
  key={radarKey(place)}
  place={place}
  timezone={timezone}
  viewport={viewport}
  overlayHost={precipitationHost}
  active={mode === "precipitation"}
  reducedMotion={reducedMotion}
  mapVisible={mapVisible}
  pageVisible={pageVisible}
  forecastState={state}
  forecastGrid={grid}
  onRetryForecast={retry}
/>
```

Do not call `useForecastMap` or `fetchMapForecast` anywhere inside the lazy panel.

- [ ] **Step 9: Implement the lazy error boundary**

Copy the existing containment pattern but change user-facing copy and IDs:

```tsx
<p>Precipitation timeline controls could not be loaded. Forecast fields remain available.</p>
<button onClick={onReturnToForecast}>Return to forecast</button>
```

Use `data-testid="precipitation-panel-error"`.

- [ ] **Step 10: Remove the old observation-only components**

After all references are moved:

```bash
git rm src/components/RadarPanel.tsx src/components/RadarPanelBoundary.tsx
```

Confirm:

```bash
rg -n "RadarPanel|RadarPanelBoundary|radar-map-tab|radar-map-mode-panel" src
```

Expected: no matches.

- [ ] **Step 11: Run the updated map-mode and lazy-load journeys**

```bash
npm run build
npx playwright test e2e/journeys.spec.ts --project=chromium --grep "map tabs|lazy radar|lazy precipitation|NOAA|RainViewer"
```

Expected: PASS after updating the test names and selectors to the new UI.

- [ ] **Step 12: Run typecheck and unit tests**

```bash
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 13: Commit the integrated panel**

```bash
git add src/components src/index.css e2e/journeys.spec.ts
git commit -m "feat(map): add unified precipitation timeline"
```

---

### Task 6: Add Deterministic Unified-Timeline Browser Journeys

**Files:**

- Create: `e2e/precipitation-timeline.spec.ts`
- Modify: `e2e/journeys.spec.ts`

**Interfaces:**

- Exercises the public IDs and accessible names defined in Task 5.
- Reuses real production rendering against deterministic network stubs.

- [ ] **Step 1: Create fixed provider fixtures**

Use one immutable clock:

```ts
const NOW = new Date("2026-08-13T16:00:00.000Z");
const OBSERVATIONS = [
  Date.parse("2026-08-13T15:50:00.000Z"),
  Date.parse("2026-08-13T15:55:00.000Z"),
  Date.parse("2026-08-13T16:00:00.000Z"),
];
const MAP_TIMES = Array.from({ length: 48 }, (_, index) =>
  new Date(NOW.getTime() + index * 3_600_000).toISOString().slice(0, 16)
);
```

Before navigation:

```ts
await page.clock.setFixedTime(NOW);
```

Stub:

- point forecast;
- GFS map grid;
- OpenStreetMap tiles;
- NOAA catalogue and export images;
- RainViewer metadata and tiles;
- air quality and ensemble calls.

Use the existing transparent one-pixel PNG fixture from `journeys.spec.ts`.

- [ ] **Step 2: Test lazy loading and the default observation**

```ts
test("opens at the latest observation without preloading radar", async ({ page }) => {
  let radarCatalogueRequests = 0;
  // increment only for NOAA query route
  await page.goto("/");
  await revealForecastMap(page);
  expect(radarCatalogueRequests).toBe(0);

  await page.getByRole("tab", { name: "Precipitation timeline" }).click();

  await expect(page.getByTestId("precipitation-source"))
    .toHaveText("OBSERVED · NOAA / NWS MRMS");
  await expect(page.getByTestId("precipitation-valid-time")).toContainText("Observed");
  await expect(page.getByTestId("precipitation-observation-overlay")).toBeVisible();
  await expect(page.getByTestId("precipitation-forecast-overlay")).toBeHidden();
  await expect(page.getByTestId("precipitation-horizon-24")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(radarCatalogueRequests).toBe(1);
});
```

- [ ] **Step 3: Test source switching on both sides of NOW**

Set the native range value through the DOM and dispatch `input` plus `change`:

```ts
async function setTimelineTime(page: Page, iso: string): Promise<void> {
  await page.getByTestId("precipitation-time").evaluate((input, value) => {
    const control = input as HTMLInputElement;
    control.value = String(Date.parse(value as string));
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, iso);
}
```

Assert right-of-NOW selection changes all semantics:

- badge: `MODEL FORECAST · Open-Meteo GFS`;
- timestamp begins `Forecast for`;
- forecast overlay visible;
- observation overlay hidden;
- legend contains `Modeled precipitation`;
- legend contains `not radar reflectivity`;
- accessible range value starts `Model forecast`.

Move left and assert observation semantics return.

- [ ] **Step 4: Test discrete playback across NOW**

Select the final observation, click `Play precipitation timeline`, and poll until:

```ts
await expect(page.getByTestId("precipitation-source"))
  .toHaveText("MODEL FORECAST · Open-Meteo GFS");
await expect(page.getByTestId("precipitation-observation-overlay")).toBeHidden();
await expect(page.getByTestId("precipitation-forecast-overlay")).toBeVisible();
```

Also collect a DOM sample during transition and assert there is never a state where both overlays are visible.

- [ ] **Step 5: Test 48-hour expansion and 24-hour clamping**

- Select `Next 48h`.
- Select a forecast frame between `+24h` and `+48h`.
- Assert the selected timestamp remains after expansion.
- Select `Next 24h`.
- Assert the value clamps to the latest retained frame at or before `NOW + 24h`.
- Assert observation count and earliest time are unchanged.

- [ ] **Step 6: Test independent degraded modes**

Radar metadata failure:

- abort NOAA/RainViewer metadata;
- leave GFS map route healthy;
- assert `Radar observations could not be loaded.`;
- assert `Retry radar`;
- select a future frame and verify forecast rendering remains usable.

Forecast failure:

- abort `/v1/gfs`;
- leave radar healthy;
- assert `Modeled forecast precipitation could not be loaded.`;
- assert `Retry forecast`;
- assert both horizon buttons are disabled;
- verify observation slider and imagery remain usable.

Both failure:

- assert base-map controls and marker remain;
- assert timeline playback/range are disabled;
- assert neither failure is presented as zero precipitation.

- [ ] **Step 7: Test reduced motion and manual controls**

```ts
await page.emulateMedia({ reducedMotion: "reduce" });
```

Assert:

- play is disabled;
- previous and next remain enabled;
- slider remains enabled;
- changing frames manually updates source semantics;
- no automatic frame change occurs after `1_200` ms.

- [ ] **Step 8: Test advancing NOW**

With browser clock support:

- open the timeline at `16:00`;
- record `NOW` marker position and future frame count;
- advance to `17:30`;
- wait for the minute timer;
- assert the `17:00` GFS frame is absent from the future segment;
- assert it did not appear as an observation;
- assert the `NOW` marker moved by elapsed-time proportion.

Use a test-only `data-now-percent` attribute on the marker for deterministic assertion.

- [ ] **Step 9: Test location isolation**

Switch from Palo Alto/NOAA to Tokyo/RainViewer:

- assert playback stops;
- assert horizon resets to `24h`;
- assert source changes to RainViewer for observations;
- assert no prior NOAA loaded image remains visible;
- assert the selected timestamp resets to the latest Tokyo observation.

- [ ] **Step 10: Update existing radar journeys**

Replace old selectors and terminology in `e2e/journeys.spec.ts`:

- `Radar observations` → `Precipitation timeline`
- `Radar observations map` → `Precipitation timeline map`
- `radar-map-tab` → `precipitation-map-tab`
- `radar-map-mode-panel` → `precipitation-map-mode-panel`
- `radar-panel-error` → `precipitation-panel-error`
- `radar-source` → `precipitation-source`
- `radar-time` → `precipitation-time`
- `Play radar animation` → `Play precipitation timeline`

Keep provider-origin, antimeridian, retained-image, no-background-image-request, and acquisition-time assertions intact.

- [ ] **Step 11: Run Chromium journeys**

```bash
npm run build
npx playwright test e2e/precipitation-timeline.spec.ts e2e/journeys.spec.ts --project=chromium
```

Expected: PASS.

- [ ] **Step 12: Run mobile and WebKit journeys**

```bash
npx playwright test e2e/precipitation-timeline.spec.ts --project=webkit
npx playwright test e2e/precipitation-timeline.spec.ts --project=iphone
npx playwright test e2e/precipitation-timeline.spec.ts --project=android
```

Expected: PASS.

- [ ] **Step 13: Commit E2E coverage**

```bash
git add e2e/precipitation-timeline.spec.ts e2e/journeys.spec.ts
git commit -m "test(map): cover unified precipitation journeys"
```

---

### Task 7: Add Deterministic Visual Regression States

**Files:**

- Create: `e2e/precipitation-timeline-liquid-glass.visual.spec.ts`

**Interfaces:**

- Uses the same fixed-time provider fixtures as Task 6.
- Captures `forecast-map-card`, not only the internal map viewport, so tabs, source badge, horizon, range, marker, legend, attribution, and status copy are included.

- [ ] **Step 1: Confirm the visual project discovers the new filename**

The current expression `/liquid-glass\.visual\.spec\.ts/` matches `precipitation-timeline-liquid-glass.visual.spec.ts`. Verify:

```bash
npx playwright test --project=visual --list
```

Expected: the new file appears because its filename contains `liquid-glass.visual.spec.ts`. Leave `playwright.config.ts` unchanged.

- [ ] **Step 2: Build a deterministic visual harness**

Use:

- fixed browser time;
- reduced motion;
- deterministic NOAA, GFS, map-tile, point-forecast, ensemble, and air-quality routes;
- hidden atmospheric animation;
- loaded transparent radar image;
- completed font and two-animation-frame settling.

Capture these states:

```ts
type TimelineVisualState =
  | "observed"
  | "boundary"
  | "forecast"
  | "forecast-only"
  | "observation-only"
  | "extended-48h";
```

Run each state at:

```ts
[
  { target: "phone", width: 390, height: 844 },
  { target: "tablet", width: 1180, height: 820 },
  { target: "cinema", width: 1920, height: 1080 },
]
```

- [ ] **Step 3: Reuse the repository perceptual-hash contract**

Copy the existing PNG decode, regional downsample, 8×8 dHash, dimension, and Hamming-distance helpers into this spec or extract them into one shared `e2e/support/perceptual-hash.ts` only if both existing visual specs are migrated in the same commit.

Do not return to isolated-pixel sampling.

Set:

```ts
const MAX_HASH_DISTANCE = 4;
```

- [ ] **Step 4: Add explicit state setup functions**

Implement exact setup functions:

- `showObserved`: click timeline and retain default latest observation.
- `showBoundary`: choose the last observation while both segment labels and `NOW` are visible.
- `showForecast`: select `NOW + 3h`.
- `showForecastOnly`: fail radar metadata before page load, select first future frame.
- `showObservationOnly`: fail GFS map retrieval, retain latest observation.
- `showExtended48h`: select `Next 48h`, then select `NOW + 36h`.

Each setup waits for its source badge and active overlay before screenshot.

- [ ] **Step 5: Calibrate baselines from the final markup**

The test must emit this exact line for every missing/mismatched baseline:

```ts
console.info(
  `precipitation-visual-signature ${target}-${state} ${actual.width}x${actual.height} ${actual.hash}`
);
```

Calibration workflow:

```bash
npm run build
npx playwright test e2e/precipitation-timeline-liquid-glass.visual.spec.ts --project=visual
```

Copy the 18 emitted width, height, and hash values into a typed `BASELINES` object in the same file. Do not commit zero, `1x1`, or all-zero placeholder entries.

Run the command again and require all 18 scenarios to pass before committing.

- [ ] **Step 6: Attach evidence on mismatch**

On dimension or hash mismatch, attach:

- PNG screenshot;
- JSON with expected/actual dimensions;
- expected/actual hash;
- Hamming distance;
- allowed distance;
- target and state.

- [ ] **Step 7: Run the complete visual project**

```bash
npm run visual
```

Expected: all existing Liquid Glass and new precipitation timeline visual tests PASS.

- [ ] **Step 8: Commit visual coverage**

```bash
git add e2e/precipitation-timeline-liquid-glass.visual.spec.ts
git commit -m "test(map): add precipitation timeline visual baselines"
```

---

### Task 8: Document the Decision and Future Reflectivity Seam

**Files:**

- Create: `docs/rfcs/0006-unified-precipitation-timeline.md`
- Modify: `docs/rfcs/0005-local-context-and-radar.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-13-unified-precipitation-timeline-design.md`

**Interfaces:**

- Documents the implemented contracts; introduces no runtime behavior.

- [ ] **Step 1: Write RFC 0006**

Include:

1. Decision: one timeline, two data classes.
2. Source table:
   - NOAA/NWS MRMS or RainViewer: observed reflectivity, past through now.
   - Open-Meteo GFS: modeled hour-ending precipitation, future.
3. Exact `+24h` default and `+48h` optional horizon.
4. Time-proportional `NOW` boundary.
5. No interpolation or semantic blending.
6. Independent source failures.
7. No duplicate GFS request.
8. Lazy observation metadata and selected-frame-only imagery.
9. Accessibility and reduced-motion rules.
10. Future provider interface and explicit `hrrr-simulated-reflectivity` non-implementation.

Set RFC status to `Implemented` only after Task 9 verification passes; use `Accepted` while coding.

- [ ] **Step 2: Amend RFC 0005**

Add an extension note near the decision:

```markdown
> **Extended by RFC 0006:** Observed radar remains provider-native and retains all
> source, safety, and failure guarantees described here, but its time controls now form
> the past segment of a unified precipitation timeline that continues into explicitly
> labeled GFS modeled precipitation.
```

Do not remove the provider safety details.

- [ ] **Step 3: Update README user and operator documentation**

Document:

- how to open `Precipitation timeline`;
- left side = radar observations;
- right side = model forecast;
- default `Next 24h` and optional `Next 48h`;
- radar coverage limitations;
- GFS precipitation is not simulated reflectivity;
- blank radar layer versus zero modeled precipitation;
- provider attribution;
- future HRRR simulated-reflectivity roadmap as non-current functionality.

- [ ] **Step 4: Record that the approved design is in implementation**

Change:

```text
Status: Approved design; awaiting written-spec review
```

to:

```text
Status: Approved for implementation
```

Do not add a PR number or merge commit before they exist.

- [ ] **Step 5: Run documentation checks through build and grep**

```bash
rg -n "Radar observations map|Radar observations\b" README.md docs src e2e
npm run typecheck
npm run build
```

Expected:

- remaining `Radar observations` references describe the observed segment or provider errors, not the removed tab name;
- typecheck and build exit `0`.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md docs/rfcs/0005-local-context-and-radar.md docs/rfcs/0006-unified-precipitation-timeline.md docs/superpowers/specs/2026-08-13-unified-precipitation-timeline-design.md
git commit -m "docs: record unified precipitation timeline"
```

---

### Task 9: Run Full Quality Gates and Open the Pull Request

**Files:**

- Review all changed files.
- No new implementation file should be introduced in this task.

**Interfaces:**

- Verifies every acceptance criterion against the exact branch head.

- [ ] **Step 1: Confirm no duplicate forecast request path exists**

```bash
rg -n "useForecastMap|fetchMapForecast|/v1/gfs" src/components/PrecipitationTimelinePanel.tsx src/components/ForecastPrecipitationLayer.tsx src/hooks/usePrecipitationTimeline.ts
```

Expected: no matches.

Confirm the only panel input is the existing `forecastGrid`/`forecastState` passed by `ForecastMap`.

- [ ] **Step 2: Confirm future data cannot carry observation terminology**

```bash
rg -n "OBSERVED|Radar observation|MRMS|reflectivity" src/lib/precipitation src/components/ForecastPrecipitationLayer.tsx src/components/PrecipitationTimelinePanel.tsx
```

Review every match. Expected:

- observation-only branches;
- the forecast disclaimer `not radar reflectivity`;
- tests that prohibit semantic regression.

No forecast branch may emit an observation badge or provider.

- [ ] **Step 3: Run static, unit, dependency, build, size, and smoke gates**

```bash
npm ci
npm run typecheck
npm test
npm run deps
npm run build
npm run size
npm run smoke
```

Expected: every command exits `0`; size output remains at or below `73 kB` initial and the owner-approved `99 kB` total gzip ceiling.

- [ ] **Step 4: Run the complete visual suite**

```bash
npm run visual
```

Expected: PASS with no baseline mismatch.

- [ ] **Step 5: Run the complete multi-browser E2E matrix**

```bash
npx playwright test --project=chromium
npx playwright test --project=webkit
npx playwright test --project=iphone
npx playwright test --project=android
```

Expected: every project exits `0`.

- [ ] **Step 6: Run adversarial acceptance checks**

Manually verify from automated evidence:

- no observation frame after `NOW`;
- no forecast frame at or before `NOW`;
- no future frame labelled observed;
- no source-overlay overlap at the boundary;
- no radar request before tab selection;
- no duplicate GFS request;
- `+48h` expansion and `+24h` contraction;
- forecast-only operation;
- observation-only operation;
- both-source failure preserves base-map controls;
- advancing clock removes elapsed forecast frames rather than reclassifying them;
- reduced motion preserves manual controls;
- location change cannot show prior-location imagery.

If any item lacks a direct test assertion, add that assertion before proceeding.

- [ ] **Step 7: Mark the architecture records implemented**

After Steps 1–6 are green:

- change RFC 0006 status from `Accepted` to `Implemented`;
- change the design-spec status from `Approved for implementation` to `Implemented`;
- do not add a merge SHA before merge.

Commit the documentation-only status transition:

```bash
git add docs/rfcs/0006-unified-precipitation-timeline.md docs/superpowers/specs/2026-08-13-unified-precipitation-timeline-design.md
git commit -m "docs: mark precipitation timeline implemented"
```

- [ ] **Step 8: Review the diff and commit graph**

```bash
git status --short
git diff --check
git log --oneline --decorate main..HEAD
git diff --stat main...HEAD
```

Expected:

- clean working tree;
- no whitespace errors;
- focused commits matching Tasks 1–8;
- no lockfile or runtime dependency change.

- [ ] **Step 9: Push the branch**

```bash
git push -u origin feature/unified-precipitation-timeline
```

- [ ] **Step 10: Open a pull request against `main`**

Use this PR title:

```text
feat(map): add unified precipitation timeline
```

Use a PR body containing:

```markdown
## Summary
- preserves NOAA/RainViewer observations through NOW
- continues into explicitly labeled Open-Meteo GFS precipitation
- defaults to +24h with an in-session +48h option
- keeps observation and forecast renderers, legends, attribution, and failures distinct
- leaves a typed seam for later HRRR simulated reflectivity

## Safety boundaries
- no duplicate GFS request
- no new runtime dependency
- no backend or persistence change
- no forecast-as-radar terminology
- selected observation imagery only; no bulk prefetch

## Verification
- typecheck
- unit/regression
- dependency and licence
- production build
- 73/99 kB gzip budgets
- production smoke
- Liquid Glass visual regression
- Chromium, WebKit, iPhone, and Android E2E

```

- [ ] **Step 11: Wait for CI and review before merge**

Do not merge from this task. Require:

- all PR CI jobs green on the latest head SHA;
- zero unresolved inline review threads;
- no unreviewed conversation comments;
- explicit user authorization to merge.

- [ ] **Step 12: Commit the plan-tracking completion update only if used**

If task checkboxes are updated during execution:

```bash
git add docs/superpowers/plans/2026-08-13-unified-precipitation-timeline.md
git commit -m "docs: complete precipitation timeline plan"
```
