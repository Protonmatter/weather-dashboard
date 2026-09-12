# RFC 0004 — Interactive Forecast Map

| | |
| --- | --- |
| Status | Implemented; cancellation and recovery contracts reviewed 2026-09-12 |
| Author | ProtonMatter |
| Supersedes | — |
| Related | RFC 0001 §2 and §5; RFC 0003 |

**Current build:** [Build state and evidence](../BUILD_STATE.md) records the PR 10
application at `0a8de45` and the separate late-transport coverage at `8eb002f`, including
validation limits. [RFC 0006](0006-unified-precipitation-timeline.md) extends the map with
the unified precipitation timeline without duplicating its forecast request.

## 1. Problem

The dashboard explains the forecast at one selected place but does not show the weather
systems around it. A spatial view should make pressure patterns, temperature gradients,
forecast precipitation, and wind direction inspectable without weakening the repository's
client-only, keyless, and small-bundle constraints.

The map must not imply more precision than its sampled forecast grid supports. In
particular, synoptic contours need mean-sea-level pressure: surface pressure would turn
terrain into false low-pressure centres.

## 2. Product contract

- The map centres on the selected place and initially shows mean-sea-level pressure.
- Temperature and forecast-precipitation fields are selectable; wind flow is an
  independent overlay.
- A play/pause timeline advances the 48 hourly forecast frames and loops at the end. The
  UTC scrubber changes only the displayed frame and pauses playback. Neither path initiates
  a request.
- Panning or zooming loads a new bounded viewport grid after interaction settles.
- Clicking the map does not change the dashboard's selected place in this version.
- Forecast-grid samples never enter the local verification archive. Only the selected
  place continues through `recordForecast`.
- Forecast precipitation is an hour-ending model total, not radar or an observation.

## 3. Data contract

The provider requests Open-Meteo's global GFS model with a comma-separated coordinate
grid and these hourly variables:

```text
temperature_2m,pressure_msl,precipitation,wind_speed_10m,wind_direction_10m
```

`forecast_hours=48`, `timezone=GMT`, and `models=gfs_global` are fixed. Canonical values
remain degrees Celsius, millimetres, kilometres per hour, and hectopascals. Display-unit
changes are pure conversions and do not refetch.

Grid sizes are bounded by presentation target:

| Target | Columns × rows | Samples |
| --- | ---: | ---: |
| Phone | 9 × 7 | 63 |
| Tablet/laptop | 11 × 9 | 99 |
| Cinema | 13 × 9 | 117 |

Responses are validated at the boundary. Missing values remain missing and render as
gaps; they are never coerced to zero. A four-entry in-memory LRU bounds retained grid
payloads with a ten-minute freshness window. An active stationary grid schedules
revalidation when that window expires. The hook owns one current request generation;
superseded transports receive cancellation, even if their promises settle later.

A replacement becomes pending immediately, while acquisition alone waits for a
400-millisecond debounce. The reducer rejects older generation actions, including late
aborts, so they cannot clear a newer loading state or failure's Retry control. Successful
transport responses also check cancellation and generation before inserting into the cache
or updating state. This prevents an obsolete grid from reappearing on a later visit to its
viewport even when the transport ignored cancellation.

## 4. Rendering

- Raster base tiles are positioned DOM images so browser caching and tile-provider policy
  remain intact. Weather fields render on a separate canvas.
- Web Mercator latitude is clamped to ±85.0511°; longitude and tile X wrap across the
  antimeridian.
- Pressure contours use marching squares at globally anchored four-hPa intervals.
  Ambiguous saddles use the cell-centre value as a deterministic decider.
- H/L centres come from one smoothed grid pass, exclude border cells, require prominence,
  and suppress weaker nearby duplicates.
- Open-Meteo wind direction is meteorological "from" direction. The animated Canvas 2D
  particles advect through bilinearly interpolated east/south vector components; converting
  to vectors before interpolation avoids the 359°/1° bearing-wrap error. Particle direction
  and relative speed come from the forecast, while screen velocity is explicitly a visual
  scale rather than a geographic-distance claim.
- Particle count is bounded by presentation target, and animation stops while the map or
  page is hidden. Reduced-motion mode renders static arrows rotated 180° toward motion.
- No map-library or rendering runtime dependency is added. Initial and total JavaScript
  budgets remain explicit release gates.

## 5. Interaction and accessibility

Pointer drag, wheel zoom, and two-pointer pinch have keyboard equivalents. Arrow keys pan,
`+`/`-` zoom, and `Home` recentres. All controls keep a 44 CSS-pixel minimum target on
touch layouts. The time slider exposes its valid UTC time.

The field canvas has a changing textual summary and `role="img"`; the particle canvas and
base tiles are decorative. Numeric legends, contour labels, H/L glyphs, and wind direction
prevent colour from being the only carrier of meaning. Reduced-motion preference disables
wind and timeline animation while preserving manual scrubbing and static arrows.

## 6. Failure and privacy boundaries

Lifecycle states are dormant, loading, ready, refreshing, stale, and error. A failed
refresh may retain only data for the same normalized viewport and must label it stale. A
different viewport never displays the previous field as if it belonged there. Base-tile
failure does not invalidate weather data; the canvas remains usable over a neutral field.

Only the hook's caller signal identifies cancellation; an internal transport timeout
becomes a failure/retry path. Requests use a 15-second timeout and one transient retry per
configured base. The map circuit-breaker scope is separate from point forecasts. A
successful HTTP response with an invalid schema fails closed instead of silently changing
sources.

The weather endpoint and tile template are build-time configuration, validated as HTTPS
(with localhost permitted for development). User input cannot supply a URL. Provider
errors shown in the UI omit request URLs and coordinates.

Loading the map discloses the requested viewport to Open-Meteo and the visible tile range
to the configured tile provider. The README must state this, preserve attribution, and
describe the providers' no-SLA and usage-policy limits.

## 7. Non-goals

- Radar was outside this RFC and is implemented by RFCs 0005–0006. Satellite imagery,
  fronts, storm tracks, and severe-weather alerts remain outside its scope.
- A Cloudflare Worker in this change. The client has a base-URL seam, but direct
  Open-Meteo remains the default and degraded path.
- Proxying or bulk-prefetching OpenStreetMap tiles.
- A shared verification archive or any client write endpoint. That requires a separate
  RFC, storage model, scheduled reconciliation, monitoring, migration, and rollback plan.
- WebGPU. The bounded canvas field does not meet ADR 0002's adoption threshold.

## 8. Release gates

- Current initial JavaScript ≤ 73 KiB gzip and total JavaScript ≤ 105 KiB gzip, enforced
  by `scripts/size-budget.mjs`. The original 70/90 KiB targets predate later features and
  the PR 10 correctness fixes; see RFC 0001 and build state for the current evidence.
- One acquisition for a settled viewport when its cache entry is absent or expired;
  explicit Retry and freshness revalidation can acquire it again. Playback and time
  scrubbing issue no forecast requests. Transport retries remain bounded as described above.
- Projection, contour, extrema, parser, reducer, interaction, responsive, and failure-path
  tests pass.
- Visible data and tile attribution, UTC labelling, and forecast-versus-observation wording
  are present.
- Map acquisition and playback do not add selected-place verification records or alter
  their scoring. The PR 10 v2 archive corrections are specified separately in RFC 0002.
- Separate browser cases cover late transport aborts during replacement debounce, during
  replacement transport, and after a newer failure; another case rejects a canceled
  success from both the displayed field and the cache. These tests control transport
  settlement while exercising HTTP parsing, provider, hook, reducer, and UI behavior.
