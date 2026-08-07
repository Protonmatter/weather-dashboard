# Weather Dashboard

An ensemble-aware weather dashboard. Apple Weather's information density, with forecast
uncertainty treated as a first-class citizen rather than collapsed into a single number.

Runs entirely in the browser. **No API keys, no backend, no server-side secrets.**

## What it does

- **Current conditions** — temperature, feels-like, daily high/low, condition summary
- **24-hour strip** — hourly temperature and conditions, with an ensemble temperature band
  (p10–p90 with the median line) drawn beneath it. Shown only when a live ensemble is
  available — a synthetic fallback never fabricates the band.
- **10-day forecast** — gradient min/max range bars scaled to the week, with a "now" marker on today
- **Precipitation (ensemble)** — p10–p90 fan chart with the median traced through it, plus 24h
  accumulation quantiles. The headline percentage is the share of ensemble members whose 24h
  total clears 0.01″, not a deterministic PoP.
- **Air quality, UV index, sunset arc**, humidity / wind / visibility / pressure
- **Backdrop reacts to conditions** — night city bokeh, rain streaks on glass when it's actually
  raining. Respects `prefers-reduced-motion`.

## Specification

Design decisions live in `docs/`, written before implementation:

- [RFC 0001 — Verification Depth, Delivery Pipeline, and Presentation Targets](docs/rfcs/0001-verification-and-delivery.md)
- [RFC 0002 — Temperature Verification Track](docs/rfcs/0002-temperature-verification.md)
- [ADR 0002 — Defer WebGPU; ship a capability probe](docs/adr/0002-no-webgpu-yet.md)

## Pipeline

Eight jobs, each answering one question, so a red build says *what kind* of thing broke
before you open the log.

| Job | Question | When |
| --- | --- | --- |
| Static | Does it typecheck? | every push |
| Unit + regression | Is the math right, and did fixed defects stay fixed? | every push |
| Dependency | Any high/critical CVEs or licence drift? | every push + nightly |
| Build + budget + smoke | Does it build, fit the budget, and boot? | every push |
| Functional (E2E) | Do real journeys work in Chromium, WebKit, iPhone, Pixel? | every push |
| Contract | Do live provider schemas still match our parsers? | main + nightly |
| Deploy | — | main only |
| Post-deploy smoke | Did the deployed site actually mount? | after deploy |

Contract and dependency jobs run nightly because provider schemas and CVE disclosures
happen on someone else's schedule. Contract tests are excluded from PR runs so an upstream
hiccup cannot block an unrelated contributor.

```bash
npm run typecheck   # static
npm test            # unit, validation, regression — 171 tests
npm run contract    # live provider schemas — 5 tests, network required
npm run e2e         # functional journeys — 14 per browser project
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
| [Open-Meteo Ensemble](https://open-meteo.com/en/docs/ensemble-api) | GFS ensemble members for the precipitation fan, the temperature band, and temperature verification |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | US AQI |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | City search, population-ranked |
| [Zippopotam.us](https://api.zippopotam.us/) | Exact postal code lookup (~60 countries) |
| [Photon](https://photon.komoot.io/) (Komoot / OSM) | Postcodes, addresses, villages, landmarks |
| [BigDataCloud](https://www.bigdatacloud.com/) | Reverse geocoding for "use my location" |

Photon and Zippopotam are OpenStreetMap-derived. **ODbL attribution is required** if you
deploy this publicly — see [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright).

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
    weather.ts       forecast assembly; ensembleFor() is the provider seam
    verification/
      metrics.ts     Brier, Murphy decomposition, CRPS, rank histogram
      advanced.ts    spread–skill, Hersbach split, PIT, bootstrap, Diebold–Mariano
      store.ts       localStorage forecast archive, sealed before outcomes
      verify.ts      observation reconciliation and scorecard assembly
    units.ts         conversion, colour ramp, formatting
    wmo.ts           WMO 4677 code decoding
    providers/       one adapter per external service, typed at the boundary
  hooks/useSearch.ts abort-on-supersede + sequence guarding
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

## Verification

```bash
npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
npm test            # 171 tests
npm run build
npm run size        # gzipped JS budget, currently 65 kB against a 90 kB ceiling
```

CI runs all four on every push and pull request.

Tests cover the parts where being wrong is silent: quantile interpolation against known
type-7 values, ensemble threshold semantics, postal-shape classification including the
ambiguous 5-digit case, abort and retry policy, circuit-breaker behaviour, and the
de-duplication merge, and every verification metric against hand-computed analytic
values — CRPS reducing to absolute error for a single member, the decomposition identity
reconstructing the Brier score, and the rank histogram's tie handling.

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

The job creates the Pages project on first run. (Connecting the repo in the Cloudflare
dashboard works too — build command `npm run build`, output `dist` — but then Cloudflare
builds outside the pipeline's gates.)

**Netlify / Vercel** — auto-detected; no configuration needed.

## Rate limits worth knowing

- Open-Meteo: roughly 10k calls/day for non-commercial use
- Photon: free community service, no published SLA

Both are fine for personal traffic. Under real load, put a caching proxy in front — a
Cloudflare Worker on the free tier (100k requests/day) handles this without changing the
client, since every outbound call already goes through `lib/http.ts` and the provider
adapters in `lib/providers/`.

## License

MIT
