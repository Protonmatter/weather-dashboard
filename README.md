# Weather Dashboard

An ensemble-aware weather dashboard. Apple Weather's information density, with forecast
uncertainty treated as a first-class citizen rather than collapsed into a single number.

Runs entirely in the browser. **No API keys, no backend, no server-side secrets.**

## What it does

- **Current conditions** — temperature, feels-like, daily high/low, condition summary
- **Location-local clock** — a live, seconds-resolution wall clock in the selected place's
  IANA timezone. Daylight-saving changes follow the place, not the viewer's computer. At
  local midnight, Rain today resets immediately and fresh point data is requested for the
  new day.
- **Inspectable weather details** — humidity, daily peak UV, estimated rain since local
  midnight, next-24-hour ensemble rain, wind, visibility, and pressure sit directly above
  the map. Hover or keyboard focus opens a compact tooltip; click, tap, or Enter pins the
  same expanded explanation, and Escape closes it.
- **24-hour strip** — hourly temperature and conditions, with an ensemble temperature band
  (p10–p90 with the median line) drawn beneath it. Shown only when a live ensemble is
  available — a synthetic fallback never fabricates the band. Hover, tap, or tab to any
  hour for its detail and exact ensemble range; click pins it.
- **10-day forecast** — gradient min/max range bars scaled to the week, with a "now" marker
  on today. Any day expands in place to its hourly detail, UV, and sun times — served from
  data already fetched, never a new request.
- **48-hour forecast map** — a keyless, client-side GFS view with mean-sea-level-pressure
  isobars and H/L centres, temperature and hour-ending precipitation layers, data-driven
  animated wind particles, and a play/pause UTC timeline. Playback advances the 48 already
  loaded hourly frames without another request; manual scrubbing pauses it. Reduced-motion
  users get static directional arrows and manual time control. Viewport grids are bounded
  to 63–117 samples and load only when the map approaches the screen; an active stationary
  grid revalidates when its 10-minute in-memory cache window expires.
- **Observed radar mode** — the same map switches to recent radar observations without
  losing pan, zoom, or the selected-place marker. U.S. and territory locations use NOAA/NWS
  MRMS; other countries use RainViewer's public non-commercial feed. Radar code and network
  calls remain dormant until the mode is selected, and a loaded catalogue revalidates every
  two minutes from its original network acquisition time. While Forecast is active, the last
  complete radar layer is retained but replacement imagery is not requested until Radar is
  selected again. Radar chunk failures stay inside radar mode; wide maps enforce a one-world
  minimum zoom, NOAA views that cross the dateline use aligned in-world image segments, and
  imagery failures retain the
  last complete layer only for the same viewport, with its matching observation time, and
  expose an explicit retry.
  Both timelines are independently
  scrubbable and respect reduced-motion, offscreen, and background-tab pause states.
- **Precipitation (ensemble)** — p10–p90 fan chart with the median traced through it, plus 24h
  accumulation quantiles. The headline percentage is the share of ensemble members whose 24h
  total clears 0.01″, not a deterministic PoP. Scrub the fan (pointer or arrow keys) to read
  any hour's rate quantiles and wet-member share.
- **Air quality, UV index, sunset arc**, humidity / wind / visibility / pressure
- **Backdrop reacts to conditions** — deterministic clear-day sun, clear-night stars,
  cloud, overcast, fog, snow, rain, and thunderstorm scenes. Rain density and speed scale
  from drizzle through heavy rain. Respects `prefers-reduced-motion`.

## Specification

Design decisions live in `docs/`, written before implementation:

- [RFC 0001 — Verification Depth, Delivery Pipeline, and Presentation Targets](docs/rfcs/0001-verification-and-delivery.md)
- [RFC 0002 — Temperature Verification Track](docs/rfcs/0002-temperature-verification.md)
- [RFC 0003 — Inspection and Drill-Down](docs/rfcs/0003-inspection-and-drill-down.md)
- [RFC 0004 — Interactive Forecast Map](docs/rfcs/0004-interactive-forecast-map.md)
- [RFC 0005 — Local Weather Context and Observed Radar](docs/rfcs/0005-local-context-and-radar.md)
- [ADR 0002 — Defer WebGPU; ship a capability probe](docs/adr/0002-no-webgpu-yet.md)

## Pipeline

Each job answers one question, so a red build says *what kind* of thing broke
before you open the log.

| Job | Question | When |
| --- | --- | --- |
| Static | Does it typecheck? | every push |
| Unit + regression | Is the math right, and did fixed defects stay fixed? | every push |
| Dependency | Any high/critical CVEs or licence drift? | every push + nightly |
| Build + budget + smoke | Does it build, fit the budget, and boot? | every push |
| Functional (E2E) | Do real journeys work in Chromium, WebKit, iPhone, Pixel? | every push |
| Contract | Do live provider schemas still match our parsers? | main + nightly |
| Deploy | Does each host receive the exact tested artefact? | main only |
| Post-deploy smoke | Did each configured host actually mount its entry chunk? | after deploy |

Contract and dependency jobs run nightly because provider schemas and CVE disclosures
happen on someone else's schedule. Contract tests are excluded from PR runs so an upstream
hiccup cannot block an unrelated contributor.

```bash
npm run typecheck   # static
npm test            # unit, validation, regression — 247 tests
npm run contract    # live provider schemas — 10 tests, network required
npm run e2e         # functional journeys — 34 per browser project
npm run smoke       # built artefact boots
npm run deps        # audit + licence allow-list
npm run size        # gzip budget
```

## Presentation targets

One codebase, three targets, selected by `matchMedia` — never user-agent sniffing.

| Target | Viewport | Treatment |
| --- | --- | --- |
| Phone | ≤767px | Single column, 44px minimum tap targets (WCAG 2.5.5), scroll-snap on the hourly strip |
| Tablet / laptop | 768–1599px | Two-column auto-fit grid |
| Desktop 16:9 | ≥1600px and ≥16:10 | Denser panels, wider gutters, full-bleed presentation |

E2E asserts each: iPhone 15 and Pixel 7 viewports render without horizontal overflow, and
1920×1080 switches to the cinema layout.

**WebGPU is deliberately not used.** See ADR 0002 — the current scene is CSS gradients and
sub-100-element SVG, which the compositor already handles on the GPU. A capability probe
(`lib/gpu/capability.ts`) ships so the decision can be revisited with measurement. The
falsifiable threshold is specified: a particle advection field at ≥50k particles, 60fps.

## Verification

Most weather apps render a probability and never revisit it. This one scores its own
forecasts.

Every live forecast is archived per-hour **before the outcome is knowable**. Once an hour
elapses, the observed value is fetched and the archive is scored:

| Metric | Question it answers |
| --- | --- |
| **Brier score** | Are the stated probabilities accurate? |
| **Brier skill score** | Does the forecast beat climatology, or would ignoring it be better? |
| **Murphy decomposition** | Is it miscalibrated (reliability) or merely uninformative (resolution)? |
| **CRPS** | Is the whole predictive distribution honest, not just the headline probability? |
| **Reliability diagram** | Of every time it said 30%, did it happen 30% of the time? |
| **Rank histogram** | Is the ensemble spread right, or is the truth landing outside it? |
| **PIT histogram** | The continuous analogue, handling precipitation's atom at zero |
| **Spread–skill ratio** | Is dispersion right, with the (n+1)/n finite-size correction? |
| **Hersbach decomposition** | CRPS = reliability + potential: miscalibrated, or just hard? |
| **Block bootstrap CI** | How much of this score is sampling noise? |
| **Diebold–Mariano** | Is one forecast *significantly* better, under autocorrelation? |
| **ROC / AUC** | Can it discriminate events at all, independent of calibration? |
| **Ignorance score** | A strictly proper local rule, clipped so one miss can't dominate |

Three deliberate choices worth calling out:

- **The decomposition reports its residual.** `BS = REL − RES + UNC` is exact only when
  bins group identical probabilities. Binning a continuous forecast leaves a within-bin
  variance/covariance term. It is reported rather than absorbed, because a decomposition
  that doesn't sum to the score it decomposes isn't one.
- **CRPS uses the fair (Ferro) estimator by default.** The biased form systematically
  rewards small ensembles for being under-dispersed, so it can't compare a 31-member
  ensemble against a 51-member one like for like.
- **Rank histogram ties resolve to the middle of the tied block.** Precipitation produces
  many exactly-zero members; always breaking ties one way manufactures an edge spike that
  reads as under-dispersion when it's an artefact.
- **Spread–skill applies the Fortin et al. (2014) (n+1)/n correction.** Without it every
  finite ensemble looks under-dispersed — a 5-member one by 10%.
- **Confidence intervals use a moving-block bootstrap**, not i.i.d. Consecutive hourly
  scores share weather regimes; resampling individual observations destroys the dependence
  that inflates the true variance and yields intervals that are far too narrow.
- **Diebold–Mariano carries the Harvey–Leybourne–Newbold small-sample correction** and a
  Newey–West HAC variance. Without HLN the test over-rejects badly below a few hundred
  observations — exactly the regime a personal archive occupies.

Scores below 100 samples are labelled provisional in the UI. Synthetic members are never
scored — only real ensemble forecasts enter the archive.

**The temperature ensemble is scored too** ([RFC 0002](docs/rfcs/0002-temperature-verification.md)).
The same archive seals per-hour temperature members (°F, rounded to 0.1) alongside
precipitation, reconciled from the same observation fetch. The panel's temperature track
reports the fair CRPS in °F with a moving-block bootstrap interval, the Hersbach
reliability/potential split, the Fortin-corrected spread–skill ratio, and a PIT histogram.
A temperature band on the hourly strip that was never checked against outcomes would be
decoration; this is the check.

**Limitations, stated plainly.** Verification uses Open-Meteo's best-estimate analysis
rather than station observations, and the archive lives in `localStorage`, so scores
reflect one device's usage rather than a shared record.

## Data sources

Every source is keyless and CORS-enabled, which is why this needs no backend.

| Source | Used for |
| --- | --- |
| [Open-Meteo Forecast](https://open-meteo.com/) | Current conditions, hourly, 10-day, UV, sunrise/sunset |
| [Open-Meteo GFS](https://open-meteo.com/en/docs/gfs-api) | Bounded 48-hour map grids: temperature, mean-sea-level pressure, precipitation, and wind |
| [Open-Meteo Ensemble](https://open-meteo.com/en/docs/ensemble-api) | GFS ensemble members for the precipitation fan, the temperature band, and temperature verification |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | US AQI |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | City search, population-ranked |
| [Zippopotam.us](https://api.zippopotam.us/) | Exact postal code lookup (~60 countries) |
| [Photon](https://photon.komoot.io/) (Komoot / OSM) | Postcodes, addresses, villages, landmarks |
| [BigDataCloud](https://www.bigdatacloud.com/) | Reverse geocoding for "use my location" |
| [OpenStreetMap standard tiles](https://operations.osmfoundation.org/policies/tiles/) | Interactive map base layer; visible tiles only, no prefetch or proxy |
| [NOAA/NWS MRMS](https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer) | Recent base-reflectivity radar frames for U.S. and territory locations |
| [RainViewer public maps](https://www.rainviewer.com/api/weather-maps-api.html) | Recent radar tiles outside the U.S.; non-commercial use only, maximum zoom 7 |

Photon and Zippopotam are OpenStreetMap-derived. **ODbL attribution is required** if you
deploy this publicly — see [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright).
The map also renders visible attribution directly over its tile layer.

Radar provider selection is deterministic from the selected place's ISO country code:
`US`, `PR`, `VI`, `GU`, and `MP` use NOAA MRMS; all other codes use RainViewer. There is no
silent fallback from NOAA to a global provider, so an outage cannot quietly change source
or terms. If the country code cannot be determined, radar fails closed as unavailable instead
of silently assigning RainViewer. RainViewer attribution remains visible in the radar detail area. A blank radar
layer can mean either no precipitation or no provider coverage; the UI says so rather than
claiming a clear sky. Image delivery failures are reported separately and are never described
as valid blank coverage.

"Rain today" sums Open-Meteo's 15-minute liquid rain and shower estimates through the current
provider timestamp in the selected place's local calendar day. The 26-hour lookback covers
DST-length days; snowfall is excluded. Point forecasts are not served from the short shared
HTTP cache, so a local-midnight refresh cannot reuse a pre-midnight response. It is not a
physical rain-gauge observation.
"Next 24h precip" is the ensemble total-precipitation
median, which can include snow water equivalent, and its expanded panel reports p10–p90; the
two values intentionally answer different questions.

Opening the map sends its bounded coordinate grid to Open-Meteo and requests the visible
tile range from the configured tile provider. Map grids are held only in a four-entry
memory cache and are never written to the verification archive or `localStorage`.

## Search

`parseQuery` inspects the input shape before dispatching, so one field handles everything:

| Input | Behaviour |
| --- | --- |
| `Tokyo` | City search, population-ranked |
| `94301` | Postal lookup; ambiguous 5-digit shapes are queried across US/DE/FR/ES/IT |
| `10115 Germany` | Trailing country token strips off and constrains results |
| `SW1A 1AA UK` | UK postcode shape matched by regex |
| `35.68, 139.69` | Coordinates resolved directly, no network call |

Results from all sources are de-duplicated on a ~1 km grid (lat/lon to 2dp), merged field-wise,
and ranked exact-postal-first then by population. Type-ahead is debounced at 350 ms.

## Ensemble handling

`loadEnsemble` pulls 31 GFS members from Open-Meteo's ensemble endpoint and `ensembleStats`
computes per-hour quantiles with linear interpolation between order statistics.

If that endpoint is unreachable, `synthMembers` generates deterministic pseudo-members seeded
from the hourly precipitation probability, so the chart keeps a plausible shape. **This is
labeled honestly wherever it surfaces** — the card reads "modeled members" and the footer reads
"modeled spread" instead of "GFS ensemble." A fan chart never implies real ensemble data when
there isn't any.

`ensembleFor(lat, lon, hourly)` is the only function that knows where members come from. Point
it at a different provider and everything downstream works unchanged. Adding IFS ENS or AIFS
alongside GFS means concatenating member arrays before `ensembleStats` — though at that point
you want dependence-aware weighting rather than treating members as exchangeable across centers.

## Architecture

```
src/
  lib/
    http.ts          abort, timeout, backoff, circuit breaking, TTL cache
    query.ts         query shape classification (city / postal / coords)
    search.ts        provider fan-out, merge, de-duplication, ranking
    ensemble.ts      quantiles and ensemble summarisation
    map/             Web Mercator, grids, contours, H/L detection, rendering state
    radar/           NOAA/RainViewer selection, schema validation, bounded image URLs
    weather.ts       forecast assembly; ensembleFor() is the provider seam
    verification/
      metrics.ts     Brier, Murphy decomposition, CRPS, rank histogram
      advanced.ts    spread–skill, Hersbach split, PIT, bootstrap, Diebold–Mariano
      store.ts       localStorage forecast archive, sealed before outcomes
      verify.ts      observation reconciliation and scorecard assembly
    units.ts         conversion, colour ramp, formatting
    wmo.ts           WMO 4677 code decoding
    providers/       one adapter per external service, typed at the boundary
  hooks/             search, forecast-map, and radar request lifecycles
  components/        presentational only
```

Every network call goes through `lib/http.ts`. It aborts superseded requests, times out
hung sockets, retries only transient faults (never a 4xx, never an abort), opens a circuit
breaker after repeated provider failures, and caches within published rate limits.

`hooks/useSearch.ts` carries two independent guards against out-of-order resolution: the
previous request is aborted when a new one starts, and a monotonic sequence number gates
the `setState`. Abort alone is insufficient — an in-flight response can still resolve — so
the sequence check is what actually guarantees only the newest query writes to state.

## Running locally

```bash
npm install
npm run dev
```

Optional map provider settings are documented in `.env.example`. The default calls
Open-Meteo directly and uses OpenStreetMap standard raster tiles. A configured
`VITE_MAP_FORECAST_BASE_URL` must expose an Open-Meteo-compatible `/v1/gfs` path; transient
proxy failure falls back to the direct provider. Tile and weather endpoint values are
build-time configuration, never search-box input.

## Verification

```bash
npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test            # 247 tests
npm run build
npm run size        # initial JS ≤70 kB; total JS ≤90 kB gzip
```

CI runs all four on every push and pull request.

Tests cover the parts where being wrong is silent: quantile interpolation against known
type-7 values, ensemble threshold semantics, postal-shape classification including the
ambiguous 5-digit case, abort and retry policy, circuit-breaker behaviour, and the
de-duplication merge, and every verification metric against hand-computed analytic
values — CRPS reducing to absolute error for a single member, the decomposition identity
reconstructing the Brier score, and the rank histogram's tie handling.
The map suite additionally covers projection round-trips and the antimeridian, adaptive
grid bounds, missing-data interpolation, marching-squares saddles, H/L suppression,
provider schema and unit drift, timeout-versus-cancellation fallback, bounded cache
freshness, responsive height changes, lazy-chunk containment, stale request generations,
stationary-grid revalidation, stable tile identity while panning, polar viewport bounds,
touch-sized error recovery and attribution, isolated optional-map circuit breaking, and
retry recovery for a failed viewport. Wheel-input coverage verifies coalesced zoom while
preventing document scroll, and responsive tests preserve pan and forecast-time state.
Pressure-extrema tests preserve missing cells and keep nearby opposite H/L systems while
still suppressing duplicate labels of the same kind.
Wind-flow tests interpolate vector components across the north-bearing wrap, fail closed on
missing samples, and verify deterministic bounded particle budgets. Browser journeys also
verify forecast playback does not refetch, reduced-motion fallback stays manual, and the
decision summary precedes the exploratory map.

## Deploying

The build output is static with a relative base (`base: "./"`), so the same artefact
serves from a domain root or any subpath, and no host needs a paid tier.

**GitHub Pages** — deployed automatically by `.github/workflows/ci.yml` on every push to
`main` (enable Pages in repo settings with source *GitHub Actions* once). Live at
<https://protonmatter.github.io/weather-dashboard/>.

**Cloudflare Pages** — the same workflow carries a `deploy-cloudflare` job that skips
itself until two repository secrets exist:

```bash
gh secret set CLOUDFLARE_API_TOKEN    # API token with Cloudflare Pages: Edit
gh secret set CLOUDFLARE_ACCOUNT_ID   # dash.cloudflare.com → Workers & Pages → account ID
```

The job creates the Pages project on first run, deploys the exact `dist` artefact already
built, budgeted, smoke-tested, and exercised by E2E, then independently fetches the
Cloudflare entry chunk. The Linux-only deployment step pins an exact Wrangler version and
its compatible Node 22 runtime; Wrangler is deliberately not a dev dependency because its
`workerd` binary does not support Windows ARM64. Connecting the repo in the Cloudflare
dashboard is intentionally avoided
because that would build outside these gates. The isolated project name is
`protonmatter-weather-dashboard`, yielding
<https://protonmatter-weather-dashboard.pages.dev/> after first activation.

**Netlify / Vercel** — auto-detected; no configuration needed.

## Rate limits worth knowing

- Open-Meteo: roughly 10k calls/day for non-commercial use
- Photon: free community service, no published SLA
- OpenStreetMap standard tiles: policy-limited community service; no bulk or background
  prefetch and no availability guarantee
- RainViewer public weather maps: non-commercial use only, maximum zoom 7, recent past
  observations only, and no availability guarantee
- NOAA MRMS: public operational service for supported U.S. areas; availability and frame
  cadence are provider-controlled

These defaults are suitable only for bounded, non-commercial traffic. Commercial
Open-Meteo use requires an appropriate licence. Under real load, put a caching proxy in
front of weather requests only — never the OpenStreetMap standard tile service. RFC 0004
keeps the weather base URL pluggable, while a production Worker remains a separate design
and security change.

## License

MIT
