# Weather Dashboard

An ensemble-aware weather dashboard. Apple Weather's information density, with forecast
uncertainty treated as a first-class citizen rather than collapsed into a single number.

Runs entirely in the browser. **No API keys, no backend, no server-side secrets.**

## What it does

- **Current conditions** — temperature, feels-like, daily high/low, condition summary
- **24-hour strip** — hourly temperature and conditions
- **10-day forecast** — gradient min/max range bars scaled to the week, with a "now" marker on today
- **Precipitation (ensemble)** — p10–p90 fan chart with the median traced through it, plus 24h
  accumulation quantiles. The headline percentage is the share of ensemble members whose 24h
  total clears 0.01″, not a deterministic PoP.
- **Air quality, UV index, sunset arc**, humidity / wind / visibility / pressure
- **Backdrop reacts to conditions** — night city bokeh, rain streaks on glass when it's actually
  raining. Respects `prefers-reduced-motion`.

## Data sources

Every source is keyless and CORS-enabled, which is why this needs no backend.

| Source | Used for |
| --- | --- |
| [Open-Meteo Forecast](https://open-meteo.com/) | Current conditions, hourly, 10-day, UV, sunrise/sunset |
| [Open-Meteo Ensemble](https://open-meteo.com/en/docs/ensemble-api) | GFS ensemble members for the precipitation fan |
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

## Running locally

```bash
npm install
npm run dev
```

## Deploying

The build output is static, so any static host works and none of them need a paid tier.

**Cloudflare Pages** — connect the repo, then:

- Build command: `npm run build`
- Output directory: `dist`

**GitHub Pages** — a workflow is included at `.github/workflows/deploy.yml`. Enable Pages in
repo settings with source set to *GitHub Actions*. If you serve from a project subpath, set
`base: "/<repo-name>/"` in `vite.config.js`.

**Netlify / Vercel** — auto-detected; no configuration needed.

## Rate limits worth knowing

- Open-Meteo: roughly 10k calls/day for non-commercial use
- Photon: free community service, no published SLA

Both are fine for personal traffic. Under real load, put a caching proxy in front — a
Cloudflare Worker on the free tier (100k requests/day) handles this without changing the
client, since the fetch helpers are isolated in `WeatherDashboard.jsx`.

## License

MIT
