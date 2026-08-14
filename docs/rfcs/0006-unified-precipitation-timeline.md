# RFC 0006 — Unified Precipitation Timeline

**Status:** Implemented

**Date:** 2026-08-13

## 1. Decision

The interactive map exposes one **Precipitation timeline** with two source-specific segments:

```text
provider-native radar observations -> NOW -> Open-Meteo GFS modeled precipitation
```

The default future horizon is 24 hours. Users may extend it to 48 hours for the current panel
session. The timeline is time-proportional, so `NOW` is positioned from elapsed wall time rather
than from the number of frames on either side.

Observation frames at or before `NOW` retain their NOAA/NWS MRMS or RainViewer imagery,
reflectivity legend, attribution, and observation language. Forecast frames strictly after
`NOW` use the existing Open-Meteo GFS grid, a modeled-precipitation canvas, Open-Meteo
attribution, and forecast language. Phase 1 does not simulate radar reflectivity, blend the two
sources, interpolate between frames, or treat a modeled zero as evidence of blank radar.

## 2. Data and timeline contract

`ForecastMap` remains the owner of the bounded `MapForecastGrid`. The lazy precipitation panel
receives that same grid and must not issue a duplicate GFS request. GFS timestamps are parsed as
UTC wall times, duplicate timestamps are rejected, and each forecast frame retains its original
grid index. Observations are deduplicated by provider frame ID and filtered to valid times at or
before the current instant. Forecasts are filtered to valid times after the current instant and
inside the selected 24- or 48-hour horizon.

The default selection is the latest available observation. If observations are unavailable, it
is the first future forecast. Automatic default selection remains implicit until the user
scrubs, steps, or starts playback; therefore a radar catalogue that arrives after the GFS grid
can still establish the latest observation as the default. Explicit user selections reconcile
by stable frame ID and then by nearest valid time when sources refresh or the horizon changes.

Advancing `NOW` removes elapsed forecast frames; it does not relabel them as observations.
Changing place remounts the panel and resets selection, horizon, playback, image failures, and
retained imagery.

## 3. Rendering and terminology

Only one precipitation overlay is active at a time:

- observation frames render through `ObservedRadarLayer`;
- forecast frames render through `ForecastPrecipitationLayer` using the selected GFS grid index.

The source badge, timestamp, legend, attribution link, accessible slider value, and explanatory
copy all derive from the selected source contract. Observation copy uses `OBSERVED`, provider
identity, and radar reflectivity. Forecast copy uses `MODEL FORECAST`, Open-Meteo GFS, and
hour-ending modeled precipitation, including the explicit warning that it is not radar
reflectivity.

The boundary is textual as well as visual. No color-only indication is required to determine
which source is active. Reduced-motion users retain manual range, previous, and next controls;
automatic playback remains disabled.

## 4. Radar retention and context safety

Radar provider requests retain RFC 0005's fixed origins, selection rules, cache, retry, timeout,
abort, antimeridian, maximum-zoom, and attribution boundaries. Viewport requests settle for 200
milliseconds to avoid request churn, but the live viewport is authoritative for visibility and
event acceptance.

Every imagery load/error event carries the settled place/viewport context, source generation,
and selected frame ID. The panel compares that identity to a live ref before updating readiness
or failure state. A prior-viewport layer is hidden immediately while a new viewport settles, so
an old completion cannot be attributed to the new map context. Retention is allowed only within
the same live context and source generation.

An explicit empty radar catalogue is different from a failed replacement. Empty coverage clears
the retained layer and its load progress. A failed same-context replacement may retain the last
complete same-context frame and its matching timestamp while exposing an imagery retry.

## 5. Failure isolation and lifecycle

Radar metadata is still lazy: neither NOAA nor RainViewer is contacted until the timeline tab is
first selected. The radar catalogue revalidates on its existing two-minute freshness boundary.
Hidden/offscreen/page-background state prevents automatic imagery replacement and playback.

Failures remain source-local:

- radar metadata failure exposes **Retry radar** and leaves future GFS frames usable;
- radar imagery failure pauses playback, retains only eligible same-context imagery, and exposes
  **Retry imagery**;
- GFS grid failure exposes **Retry forecast** and leaves radar observations usable;
- failure of both sources leaves the base map and navigation controls usable;
- lazy timeline-chunk failure remains inside the precipitation tab and can restore focus to
  Forecast fields.

## 6. Privacy, performance, and scope

The feature remains client-only, keyless, and free of telemetry or new persistence. Selecting
the timeline discloses the visible observation area to the deterministic radar provider under
RFC 0005. Forecast data uses the bounded grid already requested for Forecast fields.

Radar imagery remains selected-frame-only; the client does not preload all historical frames.
The implementation adds no runtime dependency. The optional 48-hour horizon is an in-memory UI
choice and does not change storage schemas.

The initial JavaScript ceiling remains 73 kB gzip. The complete timeline increases total
JavaScript from the prior 96 kB ceiling to 98.4 kB gzip, so the repository owner approved a
bounded 99 kB total ceiling on 2026-08-14. The adjustment covers this feature's lazy timeline
logic and retains less than 1 kB of total-bundle headroom; it does not relax the initial-load
ceiling or authorize unrelated dependency growth.

Out of scope for this RFC are optical-flow nowcasting, HRRR or other forecast products,
simulated reflectivity, source blending, backend caching, accounts, alerts, and persistent
timeline preferences. A future simulated-reflectivity provider must implement a distinct typed
future-source contract and may not silently replace the modeled-precipitation semantics defined
here.

## 7. Verification

Pure tests cover UTC timestamp parsing, source partitioning at `NOW`, duplicate rejection,
time-proportional marker placement, horizon filtering, selection reconciliation, stepping, and
terminology. Radar regression tests cover live-versus-settled context identity and explicit
empty-catalogue retention clearing.

Production-build browser journeys cover lazy loading, latest-observation defaulting, crossing
`NOW`, 24/48-hour horizon changes without another GFS request, reduced motion, source-local
metadata failures, NOAA/RainViewer provider selection, catalogue refresh, retained timestamps,
viewport settling, stale-context rejection, imagery retry, and empty-catalogue clearing. Release
validation also includes typecheck, unit tests, production build, gzip size budgets, smoke,
visual regression, and every configured Chromium, WebKit, iPhone, and Android E2E project.

## 8. Rollback

Rollback is file-level and does not require data migration: restore the Forecast/Radar tab
composition, remove the precipitation domain/hook/panel/forecast renderer, and restore the old
E2E selectors. Radar provider adapters, the forecast grid, and browser storage remain compatible.
