# Weather Context, Drill-Down, and Radar Design

| | |
| --- | --- |
| Status | Accepted |
| Date | 2026-08-09 |
| Scope | Location time, metric exploration, condition-aware scenes, and observed radar |
| Related | RFC 0003, RFC 0004, ADR 0002 |

## 1. Outcome

Extend the dashboard so it answers both "what is happening here now?" and "what is
happening around this location?" without weakening its existing forecast semantics,
accessibility, client-only architecture, or bundle limits.

The release adds:

- a DST-aware wall clock for the selected location;
- location-time formatting across hourly, daily, sunrise, sunset, and update labels;
- a compact metric explorer above the map;
- hover/focus previews with persistent click/tap/keyboard details;
- deterministic weather scenes whose intensity follows current precipitation and cloud
  data;
- a distinct observed-radar mode using NOAA MRMS for supported US locations and
  RainViewer elsewhere;
- explicit attribution, coverage, freshness, and degraded states.

Observed radar remains separate from the existing 48-hour forecast map. The UI must not
describe radar history as a forecast or describe model precipitation as observed radar.

## 2. Chosen Approach

Use a progressive extension of the existing React, Open-Meteo, Canvas 2D, and DOM-tile
architecture.

Alternatives were rejected:

- A second radar card would duplicate the base map, gestures, viewport, and controls.
- A third-party map runtime would simplify layer composition but add unnecessary bundle,
  dependency, and migration cost against the existing 90 kB gzip limit.

Radar-specific code and provider adapters load only after the user selects Radar. The
existing forecast-map chunk remains independently usable if radar code or providers fail.

## 3. Data Contracts

### 3.1 Location time

The point forecast response becomes the source of truth for the location's IANA timezone.
The provider requests Unix timestamps so every hourly and astronomical time is retained as
an instant instead of being parsed in the browser's timezone.

The weather bundle carries:

- `timezone`: validated IANA identifier;
- `timezoneAbbreviation`: provider label when valid, otherwise derived for display;
- `utcOffsetSeconds`: retained for provider daily-calendar decoding;
- `updatedAt`: the current-condition validity instant.

All visible formatting accepts the location timezone explicitly. Calendar-day grouping
uses a timezone-aware `YYYY-MM-DD` key, not `Date.toDateString()`. The wall clock uses
`Intl.DateTimeFormat` and therefore changes between PST/PDT, EST/EDT, and equivalent
regional daylight rules automatically.

The offline Palo Alto sample uses `America/Los_Angeles` and remains labelled as sample
data.

### 3.2 Current condition and precipitation

The Open-Meteo point request adds current precipitation, rain, showers, snowfall, cloud
cover, and the provider interval, plus hourly precipitation and 15-minute rain and shower
intervals with a 26-hour lookback. Canonical
precipitation is stored in inches to match the existing ensemble summary; scene-rate
calculations convert from the returned interval total to millimetres per hour before
classifying visual intensity. The Rain today metric sums only elapsed 15-minute liquid rain
and shower intervals on the location-local day.

The weather bundle exposes:

- current precipitation type and rate;
- total cloud cover;
- estimated accumulation since local midnight;
- the existing next-24-hour ensemble accumulation p10, p50, and p90.

"Today so far" is labelled as an Open-Meteo model/analysis estimate, not a rain-gauge
observation. "Next 24h" is labelled as an ensemble forecast and shows the median and
10th-90th percentile range. The two quantities are never combined into one total.

### 3.3 Radar

Radar uses a small internal provider interface:

```ts
interface RadarFrame {
  validAt: Date;
  id: string;
}

interface RadarSource {
  provider: "noaa-mrms" | "rainviewer";
  attribution: RadarAttribution;
  frames: readonly RadarFrame[];
  coverage: "available" | "unavailable" | "unknown";
}
```

The rendering adapter is provider-specific:

- NOAA MRMS uses the official time-enabled base-reflectivity image service for supported
  US locations. It requests only the settled visible viewport and active historical frame.
- RainViewer uses its public Weather Maps metadata and visible XYZ radar tiles outside the
  US. Its public timeline contains two hours of historical frames at ten-minute intervals
  and is capped at its published maximum zoom.

The provider decision is deterministic from the normalized country code. Known NOAA MRMS
territories are included only when the official service advertises coverage. A US radar
failure does not silently substitute a non-NOAA provider; it presents the failure and
leaves Forecast mode available.

No radar URL is accepted from search input. Build-time overrides, if added for testing or
licensed future providers, receive the same HTTPS/localhost validation as the forecast-map
configuration.

## 4. Components and Boundaries

### 4.1 Location clock

`LocationClock` renders local time with seconds, local weekday/date, and a short timezone
label beside the selected place. It updates on the next whole-second boundary and clears
its timer on unmount or location change.

Clock formatting lives in a pure time utility so hourly strips, daily expansion, sun
times, radar frames, forecast-map labels, and the footer use one contract.

### 4.2 Metric explorer

The existing detail cards become a compact `WeatherMetrics` explorer immediately above
the map. It contains:

- Humidity
- UV index
- Rain today
- Next 24h precipitation
- Wind
- Visibility
- Pressure

Each metric is a real button with a 44 CSS-pixel touch target.

- Pointer hover and keyboard focus show a compact tooltip preview.
- Click, tap, or Enter pins one persistent in-flow detail panel.
- Escape or activating the selected metric again closes it.
- Changing location clears preview and pinned state.
- Mobile exposes every value and detail through tap; no information depends on hover.

The tooltip is supplementary. The button's accessible name includes the headline value,
and the persistent panel contains the complete explanation. Tooltip content uses
`role="tooltip"` and `aria-describedby`; the persistent panel is an `aria-live` region.

Details explain units, category thresholds, timing, provenance, and forecast versus
estimate semantics. They do not initiate new requests.

### 4.3 Weather scene

`Backdrop` consumes a pure `WeatherScene` description rather than booleans. The scene is
derived from current WMO code, day/night, precipitation rate and type, storm state, and
cloud cover.

Supported treatments include:

- clear day: brighter sky and sunlight glow;
- clear night: dark sky and deterministic stars;
- partly cloudy or cloudy night: bounded cloud layers;
- overcast: muted full-cloud treatment;
- fog: low-contrast haze;
- drizzle/light/moderate/heavy rain: increasing drop count, opacity, length, and speed;
- snow: bounded flakes distinct from rain;
- thunderstorm: heavy cloud/rain treatment plus a slow, non-strobing ambient flash.

Particle positions and timing come from a seeded deterministic generator. Render output
must not depend on `Math.random()`. Visual thresholds are an explicit perceptual mapping,
not a meteorological reclassification of the provider's WMO code.

`prefers-reduced-motion` disables particle travel, lightning animation, and automatic
radar playback while retaining a static visual state.

### 4.4 Map modes

The existing card gains a top-level segmented control:

- **Forecast** preserves pressure, temperature, precipitation, wind, and the 48-hour UTC
  forecast timeline.
- **Radar** displays observed reflectivity history, provider attribution, freshness, a
  radar legend, manual scrubber, and play/pause when motion is allowed.

The base tiles, selected-place marker, pan, zoom, keyboard controls, viewport state, and
attribution remain shared. Switching modes does not recenter or refetch the point forecast.

Forecast and radar each retain their own active frame. A radar provider refresh may update
the available frame catalogue, but playback and scrubbing never request point weather or
forecast-grid data.

## 5. Data Flow

1. A location selection starts the existing abortable weather load.
2. Open-Meteo returns point conditions, local timezone metadata, hourly precipitation,
   daily data, air quality, and ensemble data through existing provider boundaries.
3. The normalized bundle drives the local clock, metrics, scene, forecast summaries, and
   forecast map.
4. The map remains lazy and dormant until near the viewport.
5. Radar remains dormant until selected.
6. Selecting Radar chooses NOAA MRMS or RainViewer from the normalized location, fetches
   bounded frame metadata, and renders only the active frame over shared base tiles.
7. Panning or zooming settles before any provider-specific radar imagery request is
   replaced.
8. Superseded radar metadata and imagery are aborted or ignored by a request generation.

Radar payloads never enter the verification archive or local storage.

## 6. Failure, Privacy, and Operational Behavior

- Point forecast remains required; air quality, ensemble, and radar remain optional side
  channels.
- Invalid timezone or required forecast schema is a provider-boundary failure, never a
  silent browser-time fallback.
- A radar metadata failure produces a retry action and keeps Forecast mode operational.
- A failed radar refresh may retain only imagery for the same viewport/frame and labels it
  stale. It never paints an old viewport as current.
- Tile/image errors expose no request URL, coordinate, or internal provider response.
- Provider requests use the existing timeout, abort, retry, cache, and circuit-breaker
  machinery where response types permit it.
- Radar metadata is cached briefly in memory. Radar imagery relies on browser caching and
  is not bulk-prefetched.
- Opening Radar discloses the visible tile range or viewport to NOAA or RainViewer. The
  README states this and displays required provider attribution.
- RainViewer is explicitly documented as non-commercial, best-effort, and without an SLA.

Rollback is file-level: remove Radar mode and its lazy import, revert the point-provider
fields and metric/scene consumers, and retain the existing forecast map. No persisted data
migration or backend rollback is required.

## 7. Validation

### Unit and contract coverage

- Parse and validate timezone metadata and Unix instants.
- Format DST-aware local clocks and day keys across spring/fall transitions.
- Preserve hourly, daily, sunrise, and sunset labels when the viewer timezone differs.
- Compute estimated-today liquid rain and showers without including snowfall or future
  local-day hours.
- Preserve ensemble next-24-hour quantiles and unit semantics.
- Classify clear/cloud/fog/rain/snow/storm scenes at intensity boundaries.
- Prove deterministic scene generation and bounded element counts.
- Select NOAA versus RainViewer from normalized geography.
- Parse, sort, de-duplicate, and bound NOAA and RainViewer frames.
- Validate HTTPS configuration, attribution, maximum radar zoom, missing coverage, stale
  refresh, abort, retry, and late-response behavior.

### Browser coverage

- The Palo Alto clock shows Pacific time and New York shows Eastern time regardless of the
  browser timezone.
- Tooltip preview works with hover and focus.
- Click/tap/Enter pins details; Escape closes them.
- Mobile exposes all metric details without hover and has no horizontal overflow.
- Rain intensity changes with fixture precipitation while reduced motion stays static.
- Forecast and Radar preserve independent timelines and shared viewport.
- Radar playback does not refetch point weather or the forecast grid.
- NOAA, RainViewer, unavailable-coverage, and provider-failure paths render truthful
  labels and attribution.
- Existing summary-before-map, search, units, drill-down, verification, and forecast-map
  journeys remain green.

### Release commands

```text
npm run typecheck
npm test
npm run build
npm run size
npm run smoke
npm run e2e
npm run deps
npm run contract
```

Live provider probes verify metadata schemas, CORS, representative NOAA and RainViewer
imagery, attribution, and a no-coverage location. The implementation is not complete until
the app still meets the initial 70 kB and total 90 kB gzip JavaScript budgets.

## 8. Documentation and Delivery

Update README data sources, privacy behavior, radar coverage, RainViewer non-commercial
terms, observed-versus-forecast wording, local-time behavior, and validation commands.

No commit, push, merge, deployment, or provider-account change is part of implementation
without separate authorization.
