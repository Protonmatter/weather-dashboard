# RFC 0005 — Local Weather Context and Observed Radar

**Status:** Implemented

**Date:** 2026-08-09

## 1. Decision

The dashboard exposes selected-place local time, inspectable weather metrics, deterministic
condition-aware background scenes, and an observed-radar mode in the existing interactive
map. These additions remain client-only and keyless.

Radar source selection is explicit and deterministic:

- `US`, `PR`, `VI`, `GU`, and `MP` use the NOAA/NWS time-enabled MRMS base-reflectivity
  ImageServer.
- Every other country code uses RainViewer's public weather-maps API, which is restricted to
  non-commercial use in this project.
- A missing country code leaves radar explicitly unavailable; it is never interpreted as
  non-U.S. coverage.
- A NOAA failure is shown as a NOAA failure. The application does not silently switch a U.S.
  user to RainViewer because doing so would conceal a source and terms change.

## 2. Time and precipitation contracts

Open-Meteo is requested with `timezone=auto` and `timeformat=unixtime`. Provider timestamps
are parsed as instants and every visible civil-time label is formatted with the returned IANA
timezone. The wall clock updates once per second and follows daylight-saving transitions for
the selected location independently of the viewer's system timezone. A timezone-aware
boundary timer resets Rain today and refreshes point data at the selected location's local
midnight; a throttled background timer performs the same action when the page resumes.

Current precipitation is a provider interval amount. The scene classifier normalises it to
millimetres per hour before selecting drizzle, light, moderate, or heavy effects. WMO weather
codes provide a fallback when the interval amount is absent or zero.

The metric strip deliberately separates:

- **Rain today:** sum of Open-Meteo 15-minute liquid rain and shower estimates through the
  current provider timestamp within the location's local calendar day. A 26-hour lookback
  covers DST-length days; snowfall and future intervals are excluded. Intervals ending
  exactly at local midnight belong to the preceding day. This is not a rain gauge.
- **Next 24h precip:** live total-precipitation ensemble accumulation, including snow water
  equivalent when applicable, includes p10–p90 and member count. When the ensemble provider
  is unavailable, the deterministic fallback is labelled as a modeled estimate and never
  described as live ensemble uncertainty.

## 3. Interaction and accessibility

Every metric is a native button with a minimum 44-pixel target:

- pointer hover or keyboard focus shows a compact tooltip;
- click, tap, or Enter toggles a persistent explanation;
- Escape closes the persistent explanation while the trigger retains focus;
- changing the selected place clears stale preview and pinned state.

The map's Forecast and Radar controls are tabs. Pan, zoom, keyboard arrows, `+`, `-`, Home,
base tiles, and the selected-place marker are shared. Each mode owns its timeline so switching
modes does not reinterpret forecast hours as observation frames.

Animation stops when reduced motion is requested, when the map is offscreen, or when the page
is hidden. Manual sliders remain available. Reduced motion also disables star, cloud, and fog
animations. Background particles are deterministic and bounded; no random particle churn
occurs during React renders.

## 4. Radar lifecycle and safety

Radar provider code is split into a second lazy chunk. Neither metadata endpoint is contacted
until the user first selects Radar. Requests use the common abort, timeout, transient retry,
circuit-breaker, and two-minute response-cache boundary. Once loaded, radar schedules
revalidation when that freshness window expires. Cache hits preserve the original network
acquisition timestamp, so changing locations cannot postpone provider refresh indefinitely.

NOAA image requests use a fixed service origin, a Web Mercator viewport bounding box, a fixed
frame time, transparency, and an image size capped at 4096 pixels per dimension. Viewport
changes settle for 200 milliseconds before swapping the image, and antimeridian-crossing
longitudes are normalised into one ordered projected extent. The shared map raises its
minimum zoom on wide layouts so the visible viewport never spans more than one projected
world and NOAA imagery retains the same longitude scale as base tiles. RainViewer
accepts only `https://tilecache.rainviewer.com`, validates frame paths against the documented
`/v2/radar/<id>` shape, rejects traversal/query material, and caps tiles at zoom 7.

Both providers retain visible attribution. The UI distinguishes observed radar from forecast
precipitation and states that a blank layer can mean no precipitation or no radar coverage.
Image sets become visible only after the complete layer loads. A failed replacement retains
the prior successful layer and its matching observation time when it belongs to the same
place and viewport, exposes an imagery retry, and pauses playback until a complete replacement
loads. A pan, zoom, or resize removes a prior-viewport layer if its replacement fails.

## 5. Failure and verification

Provider and lazy radar-chunk failures stay inside radar mode and expose touch-sized recovery
without unmounting the forecast map or dashboard. Location changes abort superseded metadata
requests and generation guards prevent late responses from replacing the current place.

Deterministic tests cover timezone/DST formatting, Open-Meteo schema parsing, local-day
accumulation, scene classification, provider selection, NOAA frame de-duplication, RainViewer
origin/path validation, antimeridian extents, and bounded image URLs. Production-build browser
journeys cover lazy network dormancy, U.S. NOAA selection, global RainViewer selection, radar
catalogue refresh and acquisition timestamps, settled/retained NOAA image swaps and
prior-viewport rejection, scoped lazy
chunk failure, imagery retry, local clock changes, forecast/radar switching, mobile interaction,
and reduced-motion playback and scenes. Nightly live
contracts exercise both radar catalogues and representative imagery in addition to the
weather providers.
