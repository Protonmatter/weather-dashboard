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
- A NOAA failure is shown as a NOAA failure. The application does not silently switch a U.S.
  user to RainViewer because doing so would conceal a source and terms change.

## 2. Time and precipitation contracts

Open-Meteo is requested with `timezone=auto` and `timeformat=unixtime`. Provider timestamps
are parsed as instants and every visible civil-time label is formatted with the returned IANA
timezone. The wall clock updates once per second and follows daylight-saving transitions for
the selected location independently of the viewer's system timezone.

Current precipitation is a provider interval amount. The scene classifier normalises it to
millimetres per hour before selecting drizzle, light, moderate, or heavy effects. WMO weather
codes provide a fallback when the interval amount is absent or zero.

The metric strip deliberately separates:

- **Rain today:** sum of Open-Meteo hourly precipitation estimates through the current
  provider timestamp within the location's local calendar day. This is not a rain gauge.
- **Next 24h rain:** ensemble median accumulation, with p10–p90 and member count in the
  expanded detail.

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
is hidden. Manual sliders remain available. Background particles are deterministic and
bounded; no random particle churn occurs during React renders.

## 4. Radar lifecycle and safety

Radar provider code is split into a second lazy chunk. Neither metadata endpoint is contacted
until the user first selects Radar. Requests use the common abort, timeout, transient retry,
circuit-breaker, and two-minute response-cache boundary.

NOAA image requests use a fixed service origin, a Web Mercator viewport bounding box, a fixed
frame time, transparency, and an image size capped at 4096 pixels per dimension. RainViewer
accepts only `https://tilecache.rainviewer.com`, validates frame paths against the documented
`/v2/radar/<id>` shape, rejects traversal/query material, and caps tiles at zoom 7.

Both providers retain visible attribution. The UI distinguishes observed radar from forecast
precipitation and states that a blank layer can mean no precipitation or no radar coverage.

## 5. Failure and verification

Provider failures stay inside radar mode and expose a touch-sized retry without unmounting the
forecast dashboard. Location changes abort superseded metadata requests and generation guards
prevent late responses from replacing the current place.

Deterministic tests cover timezone/DST formatting, Open-Meteo schema parsing, local-day
accumulation, scene classification, provider selection, NOAA frame de-duplication, RainViewer
origin/path validation, and bounded image URLs. Production-build browser journeys cover lazy
network dormancy, U.S. NOAA selection, global RainViewer selection, local clock changes,
forecast/radar switching, mobile interaction, and reduced-motion playback. Nightly live
contracts exercise both radar catalogues and representative imagery in addition to the
weather providers.
