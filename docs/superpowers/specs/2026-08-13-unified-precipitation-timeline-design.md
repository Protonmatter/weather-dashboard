# Unified Precipitation Timeline Design

**Status:** Implemented
**Date:** 2026-08-13
**Repository:** `Protonmatter/weather-dashboard`
**Branch:** `feature/unified-precipitation-timeline`

## 1. Summary

Replace the observation-only **Radar observations** experience with a unified **Precipitation timeline** that preserves provider-native radar history through the current time and continues into modeled forecast precipitation.

The default range is:

```text
available radar observations -> NOW -> +24 hours modeled forecast
```

Users may extend the future range to `+48 hours`. The interface must never describe forecast precipitation as observed radar. The transition at `NOW` is explicit in the timeline, source badge, timestamp label, legend, accessibility text, and rendering path.

Phase 1 uses the existing Open-Meteo GFS forecast grid for future precipitation. The architecture leaves a bounded provider seam for a later U.S.-focused HRRR simulated-reflectivity implementation without redesigning the timeline controls.

## 2. Context

The current application has two separate map modes:

- `Forecast fields` renders the existing 48-hour GFS grid for pressure, temperature, precipitation, and wind.
- `Radar observations` renders provider-native historical radar frames from NOAA/NWS MRMS for supported U.S. locations and RainViewer elsewhere.

Relevant implementation boundaries:

- `src/components/ForecastMap.tsx` owns the interactive map, forecast grid, forecast canvas, tabs, viewport, and forecast playback.
- `src/components/RadarPanel.tsx` owns observation playback, observation metadata, source attribution, observation imagery, and its independent timeline.
- `src/lib/providers/mapForecast.ts` requests 48 forecast hours and includes hourly precipitation.
- `src/lib/radar/*` owns radar-provider selection, frame catalogues, tile/export URLs, and source validation.
- `docs/rfcs/0005-local-context-and-radar.md` requires forecast and observation semantics to remain distinguishable.

This design combines the user-facing time navigation while keeping source-specific retrieval and rendering isolated.

## 3. Decision

### 3.1 Map tabs

The map retains two top-level tabs:

```text
Forecast fields | Precipitation timeline
```

`Forecast fields` continues to expose pressure, temperature, precipitation, and wind as it does today.

`Precipitation timeline` replaces `Radar observations` and displays:

- all currently available observation frames at or before `NOW`;
- modeled precipitation frames after `NOW`;
- a default future horizon of `+24h`;
- an optional extended horizon of `+48h`.

### 3.2 Semantic boundary

The unified timeline is visually continuous but semantically segmented:

```text
OBSERVED RADAR                NOW                 MODEL FORECAST
<-----------------------------|-------------------------------->
NOAA/NWS MRMS or RainViewer                      Open-Meteo GFS
```

Crossing the boundary changes all of the following atomically:

- renderer;
- source badge;
- timestamp prefix;
- legend title and units;
- accessible value text;
- explanatory copy.

There is no interpolation, morph, or crossfade between the last observed frame and the first forecast frame.

## 4. Goals

1. Preserve the existing provider-native radar history and observation controls.
2. Allow users to inspect modeled precipitation through `+24h` by default and `+48h` on demand.
3. Make the observed-versus-modeled distinction impossible to miss.
4. Reuse the existing forecast grid and radar-provider paths rather than adding a duplicate forecast request.
5. Keep location, timezone, map viewport, pan, zoom, marker, attribution, retry, and reduced-motion behavior consistent.
6. Establish a provider-neutral future-frame contract that can later support simulated radar reflectivity.
7. Maintain the existing client-only, keyless deployment model for Phase 1.

## 5. Non-goals

Phase 1 does not:

- generate or display simulated radar reflectivity;
- derive optical-flow radar nowcasts from recent observations;
- blend observation pixels with forecast pixels;
- claim that GFS precipitation is radar reflectivity;
- add a server-side tile-processing pipeline;
- add authentication, telemetry, cookies, or a new persistence schema;
- persist the `+24h`/`+48h` choice across browser sessions;
- change the underlying forecast model or the existing 48-hour GFS request contract.

## 6. Terminology and data semantics

### Observation frame

A provider-native radar image with a valid time at or before the current instant.

```ts
interface ObservationPrecipitationFrame {
  kind: "observation";
  id: string;
  validAt: Date;
  provider: "noaa-mrms" | "rainviewer";
  radarFrame: RadarFrame;
}
```

Visible terminology:

- `OBSERVED`
- `Radar reflectivity`
- `Observed <timestamp>`
- provider attribution from the selected radar source

### Forecast frame

A modeled precipitation field with a valid time after the current instant.

```ts
interface ForecastPrecipitationFrame {
  kind: "forecast";
  id: string;
  validAt: Date;
  provider: "open-meteo-gfs";
  forecastIndex: number;
}
```

Visible terminology:

- `MODEL FORECAST`
- `Hour-ending modeled precipitation`
- `Forecast for <timestamp>`
- `Open-Meteo GFS`

### Unified frame

```ts
type PrecipitationFrame =
  | ObservationPrecipitationFrame
  | ForecastPrecipitationFrame;
```

### Timeline model

```ts
interface PrecipitationTimeline {
  frames: readonly PrecipitationFrame[];
  now: Date;
  nowPercent: number;
  earliestAt: Date | null;
  latestAt: Date | null;
  latestObservationIndex: number | null;
  firstForecastIndex: number | null;
  defaultIndex: number | null;
  horizonHours: 24 | 48;
}
```

## 7. Timeline construction

Introduce a pure function:

```ts
buildPrecipitationTimeline(input: {
  observations: readonly RadarFrame[];
  observationProvider: "noaa-mrms" | "rainviewer" | "unavailable";
  forecastTimes: readonly string[];
  now: Date;
  horizonHours: 24 | 48;
}): PrecipitationTimeline
```

The function must:

1. reject invalid dates and duplicate frame identifiers;
2. parse the existing GMT forecast timestamps explicitly as UTC rather than as browser-local civil time;
3. retain observation frames only when `validAt <= now`;
4. retain forecast frames only when `validAt > now`;
5. retain forecast frames only through `now + horizonHours`;
6. preserve provider-native observation cadence;
7. preserve the existing hourly forecast cadence;
8. sort the merged frame list chronologically;
9. calculate the `NOW` marker from actual elapsed time, not frame count;
10. default to the latest valid observation;
11. default to the first forecast frame when no observations are available;
12. return an empty timeline only when neither source has a usable frame.

The function must not synthesize observation frames, forecast frames, or values across the boundary.

`now` is timer-driven and refreshed at least once per minute while the timeline is mounted. A forecast frame that becomes past due is removed from the future segment on rebuild; it is never reclassified as an observation.

## 8. Timeline control behavior

### 8.1 Default position

When the timeline opens or the selected place changes:

- select the latest observation at or before `NOW`;
- otherwise select the first available future forecast frame;
- stop playback;
- reset the future horizon to `+24h`.

Returning to the timeline tab for the same place during the same mounted session may preserve the prior selected frame if that frame still exists after source refresh.

### 8.2 Time-proportional slider

The slider represents elapsed time rather than equal frame slots.

- `min` is the earliest available observation timestamp, or `NOW` when observations are unavailable.
- `max` is `NOW + 24h` or `NOW + 48h`, capped by the latest loaded forecast frame.
- the `NOW` divider is positioned by timestamp percentage;
- dragging selects the nearest available frame of either kind;
- the thumb snaps to the selected frame's actual timestamp;
- a gap between the latest observation and first forecast remains visible as a time gap.

The native input remains the primary interaction primitive:

```text
input[type=range]
```

Its `aria-valuetext` includes frame kind, provider, and location-formatted timestamp.

Examples:

```text
Observed, NOAA/NWS MRMS, 12:20 PM EDT, Thu Aug 13
Model forecast, Open-Meteo GFS, 3:00 PM EDT, Thu Aug 13
```

### 8.3 Horizon control

Display two touch-sized options:

```text
Next 24h | Next 48h
```

Rules:

- `Next 24h` is selected by default.
- Changing the horizon does not alter the observation range.
- Expanding to `+48h` preserves the selected frame.
- Contracting to `+24h` clamps a later selection to the latest retained frame.
- The horizon preference is component state only and is not written to local storage.

### 8.4 Playback

Playback traverses the ordered frame list, not synthetic time increments.

- Observation frames play at their provider-native cadence as discrete frames.
- Forecast frames play at the existing forecast cadence as discrete hourly frames.
- The visual playback interval remains constant per rendered frame.
- Crossing `NOW` switches renderer and labeling without crossfade.
- Playback loops from the final selected-horizon frame to the first available frame: the earliest observation when observations exist, otherwise the first forecast frame.
- Playback pauses when the map is offscreen, the page is hidden, imagery fails, or reduced motion is requested.
- Reduced-motion users retain the slider and previous/next frame controls.

## 9. Presentation states

### 9.1 Observation state

Source badge:

```text
OBSERVED · NOAA/NWS MRMS
```

or:

```text
OBSERVED · RainViewer
```

Legend:

```text
Radar reflectivity
Light | Moderate | Heavy
Precipitation intensity, not a surface total
```

Timestamp:

```text
Observed 12:20 PM EDT · Thu, Aug 13
```

### 9.2 Forecast state

Source badge:

```text
MODEL FORECAST · Open-Meteo GFS
```

Legend:

```text
Modeled precipitation
0 | 1 | 5 | 10+ mm
Hour-ending modeled total, not radar reflectivity
```

Timestamp:

```text
Forecast for 3:00 PM EDT · Thu, Aug 13
```

### 9.3 NOW boundary

The boundary includes:

- a visible vertical tick or divider;
- a text label `NOW`;
- separate segment labels `OBSERVED` and `MODEL FORECAST`;
- a non-color cue so forced-colors and color-vision users retain the distinction.

### 9.4 Loading

The current rendered source remains visible while the other source loads.

- If radar metadata is loading, future forecast frames remain usable.
- If forecast data is loading, available observations remain usable.
- The selected frame is not cleared unless its source becomes invalid for the current place or viewport.

## 10. Component architecture

### 10.1 `ForecastMap`

`ForecastMap` remains the map composition root and owns:

- place and timezone;
- viewport and map controls;
- forecast grid;
- forecast canvas;
- top-level tab selection;
- visibility and reduced-motion state.

It will rename the `radar` mode to `precipitation` at the component boundary:

```ts
type MapMode = "forecast" | "precipitation";
```

### 10.2 `usePrecipitationTimeline`

Add a hook responsible only for orchestration state:

```ts
interface UsePrecipitationTimelineInput {
  observations: readonly RadarFrame[];
  observationProvider: RadarProviderId;
  forecastTimes: readonly string[];
  now: Date;
  initialHorizon?: 24 | 48;
  reducedMotion: boolean;
  mapVisible: boolean;
  pageVisible: boolean;
}
```

It returns:

- constructed timeline;
- selected frame;
- horizon;
- play/pause state;
- select-by-timestamp action;
- previous/next action;
- horizon action;
- boundary and source metadata.

The hook does not fetch data or render imagery.

### 10.3 `PrecipitationTimelinePanel`

Replace the observation-only control panel with a source-neutral panel responsible for:

- source badge;
- time-proportional slider;
- `NOW` divider;
- `+24h`/`+48h` horizon control;
- play/pause and previous/next controls;
- timestamp and accessibility text;
- source-specific legend selection;
- source-specific status and retry actions.

### 10.4 `ObservedRadarLayer`

Extract the observation imagery behavior from `RadarPanel` into a renderer that retains the current guarantees:

- NOAA export or RainViewer tiles;
- settled viewport;
- antimeridian handling;
- image-set atomic swap;
- retained last successful layer for the same context;
- imagery retry;
- provider attribution;
- no imagery request while an observation frame is not selected.

### 10.5 `ForecastPrecipitationLayer`

Use the existing map forecast grid and canvas renderer for forecast frames.

When selected through the precipitation timeline:

- force the rendered layer to `precipitation`;
- hide pressure and temperature controls;
- do not label the result as radar;
- retain the existing precipitation color scale and hour-ending-total semantics;
- keep base tiles and the selected-place marker unchanged.

### 10.6 Source-specific rendering

```ts
function renderSelectedFrame(frame: PrecipitationFrame): RendererKind {
  return frame.kind === "observation"
    ? "observed-radar-layer"
    : "forecast-precipitation-layer";
}
```

Only one source-specific precipitation overlay is visible at a time. Selecting a forecast frame hides the radar layer synchronously before the forecast canvas is exposed; selecting an observation frame hides the forecast precipitation overlay synchronously before radar imagery is exposed.

## 11. Data flow

```text
Open-Meteo GFS forecast grid -----------+
                                        |
                                        v
                              buildPrecipitationTimeline
                                        ^
                                        |
NOAA MRMS / RainViewer observations ----+
                                        |
                                        v
                           usePrecipitationTimeline
                                        |
                      +-----------------+-----------------+
                      |                                   |
               observation frame                    forecast frame
                      |                                   |
                      v                                   v
             ObservedRadarLayer              ForecastPrecipitationLayer
```

The forecast grid is fetched once through the existing `useForecastMap` path. The unified timeline must not issue a second Open-Meteo forecast request.

## 12. Failure behavior

### Observation unavailable, forecast available

- Timeline starts at `NOW` and continues into modeled forecast data.
- Observation segment is visibly unavailable.
- Source copy states that radar observations could not be loaded.
- Radar retry remains available.
- Forecast frames remain interactive.

### Forecast unavailable, observations available

- Timeline remains observation-only.
- Future segment and horizon controls are disabled.
- Copy states that modeled forecast precipitation could not be loaded.
- Forecast retry uses the existing forecast-map retry path.
- Observation playback remains functional.

### Both unavailable

- Keep the map shell, base map, marker, pan, and zoom available.
- Show separate source failures where actionable.
- Do not present an empty layer as successful zero precipitation.

### Image failure

- Preserve the current observation-layer behavior: keep the last complete image only when it belongs to the same place and viewport.
- Pause playback.
- Expose imagery retry.
- Do not substitute a forecast frame for a failed observation frame without moving the timeline selection and changing the source label.

### Location or viewport change

- Abort superseded source work.
- Reset playback.
- Rebuild the timeline for the new place.
- Prevent a prior place or viewport image from becoming visible in the new context.

## 13. Accessibility

1. Retain native tab semantics for `Forecast fields` and `Precipitation timeline`.
2. Retain a native range input for timeline navigation.
3. Include source kind, provider, and timestamp in `aria-valuetext`.
4. Announce source transitions with a polite live region when playback is paused; avoid repeated announcements during animation.
5. Label `NOW` in text and structure, not color alone.
6. Maintain minimum 44-pixel targets for play, pause, previous, next, horizon, retry, and tabs.
7. Preserve keyboard support for arrows, Home, End, and tab navigation.
8. Reduced-motion mode disables automatic playback but leaves all manual inspection controls available.
9. Forced-colors mode must preserve segment borders, source labels, selected horizon, and the `NOW` boundary.
10. Source and model attribution remain available to screen-reader and sighted users.

## 14. Performance and network constraints

- No new runtime dependency.
- No duplicate forecast-grid request.
- Do not preload all radar images.
- Load only the selected observation image set.
- Forecast frames reuse already parsed grid arrays.
- Timeline construction is pure and memoized.
- Horizon expansion filters existing 48-hour forecast data and does not refetch.
- Source refresh behavior remains within the existing cache, timeout, retry, circuit-breaker, and abort boundaries.
- The radar implementation remains lazy until the user selects `Precipitation timeline`.
- The JavaScript bundle must remain within the repository's enforced ceilings: 73 kB initial
  and the owner-approved 99 kB total, both measured gzipped.

## 15. Security and provenance

- Retain the existing fixed NOAA service origin and validated RainViewer origin/path restrictions.
- Retain provider attribution in every observation state.
- Identify forecast frames as `Open-Meteo GFS` and `MODEL FORECAST`.
- Never render forecast data beneath an `OBSERVED`, `RADAR OBSERVATION`, or `MRMS` label.
- Never infer radar coverage from a blank forecast field or infer forecast zero precipitation from a failed radar image.
- Preserve HTTPS-only source validation.

## 16. Testing strategy

### 16.1 Unit tests

Add deterministic tests for:

- observation and forecast chronological merge;
- explicit UTC parsing of forecast timestamps;
- exclusion of observation frames after `NOW`;
- exclusion of forecast frames at or before `NOW`;
- removal, rather than reclassification, of forecast frames as `NOW` advances;
- `+24h` and `+48h` horizon filtering;
- default selection of the latest observation;
- forecast-only default selection;
- time-proportional `NOW` percentage;
- duplicate and invalid timestamp rejection;
- nearest-frame selection by timestamp;
- horizon contraction clamping;
- source badge and legend selection;
- accessible value-text generation.

### 16.2 Component tests

Cover:

- observed-to-forecast source transition;
- forecast-to-observed reverse transition;
- synchronous hiding of the prior source overlay;
- no crossfade or simultaneous source overlays;
- horizon toggle behavior;
- reduced-motion behavior;
- observation-only and forecast-only degraded modes;
- separate retry actions;
- correct source and timestamp copy.

### 16.3 End-to-end tests

Across Chromium, WebKit, iPhone, and Android:

1. Open `Precipitation timeline` and confirm default selection is the latest observation.
2. Drag right of `NOW` and confirm the map, legend, source badge, and timestamp switch to model-forecast semantics.
3. Drag left and confirm observation semantics return.
4. Play across `NOW` and verify the discrete renderer transition.
5. Select `Next 48h`, choose a frame after `+24h`, then contract to `Next 24h` and verify clamping.
6. Fail radar metadata and verify forecast operation remains available.
7. Fail forecast retrieval and verify observation operation remains available.
8. Verify no radar request occurs before the timeline tab is selected.
9. Verify touch targets and manual controls under reduced motion.
10. Verify location changes cannot display a prior location's selected frame.
11. Advance the browser clock and verify the `NOW` marker and future-frame set rebuild without relabeling forecast data as observed.

### 16.4 Visual regression

Capture deterministic phone, tablet, and cinema states for:

- latest observed frame;
- `NOW` boundary with both timeline segments visible;
- future model-forecast frame;
- forecast-only degraded mode;
- observation-only degraded mode;
- `+48h` horizon selected.

The full-dashboard baseline must include the map tabs, timeline controls, legend, source badge, horizon control, and map surface.

## 17. Rollout and compatibility

Implementation will be delivered through a dedicated pull request from `feature/unified-precipitation-timeline`.

The change is presentation and orchestration focused:

- existing point forecasts remain unchanged;
- existing forecast-grid parsing remains unchanged;
- existing radar-provider selection remains unchanged;
- existing radar source validation remains unchanged;
- existing local storage schemas remain unchanged;
- the old observation-only behavior remains available as the past segment and as a forecast-failure fallback.

The implementation must update or supersede the observation-only wording in `docs/rfcs/0005-local-context-and-radar.md`. A new RFC may be used if the implementation plan determines that the combined timeline warrants an independent architectural decision record.

## 18. Future simulated-reflectivity extension

Phase 1 defines a future-source interface without implementing reflectivity:

```ts
interface SourceAttribution {
  label: string;
  url: string;
}

interface FuturePrecipitationFrame {
  id: string;
  validAt: Date;
  sourceIndex: number;
}

interface FuturePrecipitationSource {
  provider: "open-meteo-gfs" | "hrrr-simulated-reflectivity";
  kind: "modeled-precipitation" | "simulated-reflectivity";
  frames: readonly FuturePrecipitationFrame[];
  attribution: SourceAttribution;
  coverage: "available" | "unavailable";
}
```

The later HRRR implementation may:

- add `hrrr-simulated-reflectivity` for supported U.S. coverage;
- use a dedicated raster/tile renderer;
- preserve GFS modeled precipitation as a global fallback;
- add a future-layer selector when more than one future source is available;
- reuse the same timeline model, `NOW` boundary, playback controls, horizon controls, failure states, and accessibility contract.

It must not silently replace GFS with simulated reflectivity without changing the visible source and legend.

## 19. Acceptance criteria

The feature is complete when:

1. The map exposes `Forecast fields` and `Precipitation timeline` tabs.
2. The precipitation timeline includes all usable observations and future GFS precipitation.
3. The default future horizon is `+24h` and `+48h` is user-selectable.
4. The default selected frame is the latest observation when available.
5. The `NOW` boundary is timer-driven, time-proportional, visible, textual, and accessible.
6. Observation frames retain provider-specific radar rendering and attribution.
7. Forecast frames use the existing GFS precipitation grid and are visibly labeled as modeled forecast data.
8. Playback crosses the boundary discretely without blending or semantic ambiguity.
9. Either source remains usable when the other source fails.
10. No duplicate forecast request is introduced.
11. Reduced-motion, forced-colors, keyboard, screen-reader, and touch-target requirements pass.
12. Unit, regression, visual, and multi-browser E2E suites pass.
13. Bundle-size, dependency, build, and smoke gates remain green.
14. Documentation accurately describes observed radar, modeled precipitation, and the future simulated-reflectivity seam.
