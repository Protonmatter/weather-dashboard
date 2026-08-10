# Weather Context and Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add location-correct time, interactive weather metrics, precipitation-aware scenes, and provider-isolated observed radar while preserving the dashboard's forecast and verification contracts.

**Architecture:** Extend the typed Open-Meteo boundary with timezone and precipitation context, derive view models through pure utilities, and keep the UI presentational. Add observed radar behind a lazy provider adapter inside the existing map viewport, with NOAA MRMS selected for US locations and RainViewer elsewhere.

**Tech Stack:** React 18, TypeScript 5.5 strict mode, Vite 7, Vitest 3, Playwright, Canvas 2D, DOM raster tiles, Open-Meteo, NOAA MRMS ArcGIS ImageServer, RainViewer Weather Maps API.

## Global Constraints

- Keep the app client-only and keyless; add no backend or runtime dependency.
- Initial JavaScript must remain at or below 70 kB gzip; total JavaScript at or below 90 kB gzip.
- Preserve all existing public UI behavior unless this plan explicitly enhances it.
- Forecast precipitation, estimated accumulation, and observed radar must remain distinctly labelled.
- Every hover capability must have keyboard and touch parity with 44 CSS-pixel touch targets.
- `prefers-reduced-motion` disables atmospheric travel, lightning animation, and automatic radar playback.
- Radar requests are bounded to visible imagery and short-lived metadata; no bulk prefetch or persistence.
- RainViewer use is non-commercial, best-effort, visibly attributed, and has no SLA.
- Do not commit, stage, push, deploy, or modify provider accounts without separate authorization.

---

## File Structure

**Create**

- `src/lib/time.ts`: timezone validation, instant/day formatting, and local calendar keys.
- `src/lib/scene.ts`: pure weather-scene classification and deterministic particle layout.
- `src/lib/radar/types.ts`: provider-neutral radar contracts.
- `src/lib/radar/provider.ts`: deterministic provider selection and metadata orchestration.
- `src/lib/radar/noaa.ts`: NOAA frame parsing and export-image URL construction.
- `src/lib/radar/rainViewer.ts`: RainViewer frame parsing and tile URL construction.
- `src/lib/radar/state.ts`: radar lifecycle reducer with stale-same-viewport protection.
- `src/lib/__tests__/time.test.ts`: DST, timezone, and calendar-key coverage.
- `src/lib/__tests__/scene.test.ts`: scene threshold and determinism coverage.
- `src/lib/radar/__tests__/provider.test.ts`: provider selection and response parsing.
- `src/lib/radar/__tests__/state.test.ts`: lifecycle, retry, and stale-data coverage.
- `src/components/LocationClock.tsx`: second-aligned wall clock.
- `src/components/WeatherMetrics.tsx`: preview tooltip and pinned detail explorer.
- `src/components/RadarOverlay.tsx`: lazy radar metadata, imagery, timeline, and status UI.
- `src/hooks/useRadar.ts`: abortable, generation-gated radar lifecycle.

**Modify**

- `src/lib/types.ts`: normalized timezone, precipitation, and cloud fields.
- `src/lib/providers/openMeteo.ts`: request/parse new fields and Unix timestamps.
- `src/lib/weather.ts`: carry normalized forecast metadata.
- `src/lib/fallback.ts`: deterministic sample time and weather context.
- `src/lib/units.ts`: timezone-explicit formatting compatibility wrappers.
- `src/lib/__tests__/contract.test.ts`: live schema contract for new fields.
- `src/lib/__tests__/query.test.ts` or a new provider unit test: point response regression fixture.
- `src/components/Hero.tsx`: render `LocationClock` and location-time summary.
- `src/components/Backdrop.tsx`: render `WeatherScene` instead of boolean rain state.
- `src/components/Panels.tsx`: remove the old duplicate `DetailsGrid` implementation.
- `src/components/ForecastMap.tsx`: add Forecast/Radar modes and lazy overlay.
- `src/App.tsx`: derive scene, pass timezone, and place `WeatherMetrics` above the map.
- `src/index.css`: bounded rain/snow/cloud/star/lightning animations and reduced-motion rules.
- `src/vite-env.d.ts`: radar build-time environment fields only if an override is implemented.
- `e2e/journeys.spec.ts`: timezone, tooltip, tap, scene, provider, playback, and failure journeys.
- `README.md`: data sources, semantics, privacy, coverage, attribution, and limitations.

---

### Task 1: Location-Time and Precipitation Data Boundary

**Files:**

- Create: `src/lib/time.ts`
- Create: `src/lib/__tests__/time.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/providers/openMeteo.ts`
- Modify: `src/lib/weather.ts`
- Modify: `src/lib/fallback.ts`
- Modify: `src/lib/units.ts`
- Modify: `src/lib/__tests__/contract.test.ts`

**Interfaces:**

- Produces: `formatLocalTime(date, timezone, options?)`, `localDateKey(date, timezone)`, `timezoneLabel(date, timezone)`, `WeatherBundle.timezone`, `WeatherBundle.updatedAt`, `CurrentConditions.precipRateMmH`, `CurrentConditions.precipitationIn`, `CurrentConditions.cloudCover`, `WeatherBundle.rainTodayIn`.
- Consumes: existing `fetchJson`, `WeatherBundle`, `HourPoint`, `DayPoint`, and ensemble contracts.

- [ ] **Step 1: Add failing DST and viewer-zone-independent unit tests**

```ts
import { describe, expect, it } from "vitest";
import { formatLocalTime, localDateKey, timezoneLabel } from "../time";

describe("location time", () => {
  it("formats one instant in the selected location", () => {
    const instant = new Date("2026-08-09T16:30:00Z");
    expect(formatLocalTime(instant, "America/Los_Angeles")).toBe("9:30 AM");
    expect(formatLocalTime(instant, "America/New_York")).toBe("12:30 PM");
  });

  it("derives DST-aware labels", () => {
    expect(timezoneLabel(new Date("2026-01-15T12:00:00Z"), "America/Los_Angeles")).toBe("PST");
    expect(timezoneLabel(new Date("2026-08-15T12:00:00Z"), "America/Los_Angeles")).toBe("PDT");
  });

  it("groups UTC instants by the location calendar", () => {
    const instant = new Date("2026-08-10T02:00:00Z");
    expect(localDateKey(instant, "America/Los_Angeles")).toBe("2026-08-09");
    expect(localDateKey(instant, "Asia/Tokyo")).toBe("2026-08-10");
  });
});
```

- [ ] **Step 2: Run the new unit test and verify missing-module failure**

Run: `npx vitest run src/lib/__tests__/time.test.ts`

Expected: FAIL because `src/lib/time.ts` does not exist.

- [ ] **Step 3: Implement pure timezone helpers**

```ts
export function assertTimeZone(value: string): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); }
  catch { throw new Error("forecast: invalid timezone"); }
  return value;
}

export function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone,
  }).format(date);
}

export function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone,
  }).format(date);
}
```

- [ ] **Step 4: Extend the provider fixture contract before production parsing**

Add a point response fixture with `timezone`, `timezone_abbreviation`,
`utc_offset_seconds`, `current.time`, `current.interval`, `current.precipitation`,
`current.rain`, `current.showers`, `current.snowfall`, `current.cloud_cover`, and hourly
`precipitation`, plus 15-minute `rain` and `showers`. Assert invalid timezones and nonnumeric
required series fail rather than silently default.

- [ ] **Step 5: Run the focused provider and time tests to observe contract failures**

Run: `npx vitest run src/lib/__tests__/time.test.ts src/lib/__tests__/contract.test.ts`

Expected: time helper tests PASS; updated provider expectations FAIL.

- [ ] **Step 6: Implement the minimal typed point-provider changes**

Request `timeformat=unixtime`, current precipitation/rain/showers/snowfall/cloud cover,
hourly precipitation, 15-minute rain/showers with a 26-hour lookback, and
`precipitation_unit=inch`. Parse all Unix seconds with:

```ts
const instant = (seconds: number, label: string): Date => {
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(seconds) || Number.isNaN(date.getTime())) throw new Error(`forecast: invalid ${label}`);
  return date;
};

const precipRateMmH = current.interval > 0
  ? current.precipitation * 25.4 * (3600 / current.interval)
  : 0;
```

Compute `rainTodayIn` from 15-minute liquid rain and shower intervals whose location calendar
key matches `localDateKey(updatedAt, timezone)` and whose instant is not later than `updatedAt`.

- [ ] **Step 7: Update fallback and all formatter call sites enough to typecheck**

Use `America/Los_Angeles`, a current `updatedAt`, bounded sample precipitation, and cloud
cover. Preserve `fmtClock` temporarily as a wrapper accepting an optional timezone so later
UI tasks can migrate without breaking existing components.

- [ ] **Step 8: Run focused and existing unit tests**

Run: `npm run typecheck`

Run: `npm test`

Expected: PASS.

- [ ] **Step 9: Review Task 1 diff**

Run: `git diff --check`

Confirm no browser-local `getHours()`, `toDateString()`, or ISO local-time parsing remains on
the point-forecast path.

### Task 2: Deterministic Weather Scene

**Files:**

- Create: `src/lib/scene.ts`
- Create: `src/lib/__tests__/scene.test.ts`
- Modify: `src/components/Backdrop.tsx`
- Modify: `src/index.css`
- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `CurrentConditions` and `decodeWMO` output from Task 1.
- Produces: `WeatherScene`, `deriveWeatherScene(current)`, and `sceneParticles(scene, count)`.

- [ ] **Step 1: Write failing scene classification and determinism tests**

```ts
it("scales rain from drizzle through downpour", () => {
  expect(deriveWeatherScene(current({ code: 51, precipRateMmH: 0.2 })).intensity).toBe("drizzle");
  expect(deriveWeatherScene(current({ code: 61, precipRateMmH: 1.2 })).intensity).toBe("light");
  expect(deriveWeatherScene(current({ code: 63, precipRateMmH: 4 })).intensity).toBe("moderate");
  expect(deriveWeatherScene(current({ code: 95, precipRateMmH: 12 })).intensity).toBe("heavy");
});

it("generates byte-stable bounded particles", () => {
  const scene = deriveWeatherScene(current({ code: 65, precipRateMmH: 9 }));
  expect(sceneParticles(scene, 12)).toEqual(sceneParticles(scene, 12));
  expect(sceneParticles(scene, 12)).toHaveLength(12);
});
```

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run: `npx vitest run src/lib/__tests__/scene.test.ts`

- [ ] **Step 3: Implement the pure scene model**

Use explicit scene types (`clear`, `partly-cloudy`, `overcast`, `fog`, `rain`, `snow`,
`storm`), intensity types (`none`, `drizzle`, `light`, `moderate`, `heavy`), bounded particle
counts, and a small seeded PRNG. WMO code determines precipitation kind; rate determines
only visual intensity.

- [ ] **Step 4: Replace boolean backdrop props with `scene: WeatherScene`**

Render deterministic stars, clouds, haze, rain, snow, and a non-strobing storm wash. Add
`data-scene` and `data-intensity` for E2E assertions. Keep every layer `aria-hidden`.

- [ ] **Step 5: Add reduced-motion CSS and run focused validation**

Run: `npx vitest run src/lib/__tests__/scene.test.ts`

Run: `npm run typecheck`

Expected: PASS; no `Math.random()` remains in `Backdrop.tsx` or `scene.ts`.

- [ ] **Step 6: Review Task 2 diff**

Run: `rg -n "Math\.random|animation" src/components/Backdrop.tsx src/lib/scene.ts src/index.css`

Confirm motion selectors are disabled under `prefers-reduced-motion`.

### Task 3: Location Clock and Metric Explorer

**Files:**

- Create: `src/components/LocationClock.tsx`
- Create: `src/components/WeatherMetrics.tsx`
- Modify: `src/components/Hero.tsx`
- Modify: `src/components/Panels.tsx`
- Modify: `src/App.tsx`
- Modify: `e2e/journeys.spec.ts`

**Interfaces:**

- Consumes: Task 1 timezone/precipitation data and existing ensemble quantiles.
- Produces: accessible metric buttons with `data-testid="weather-metric-*"`, one
  `role="tooltip"` preview, and one persistent `data-testid="weather-metric-detail"` panel.

- [ ] **Step 1: Add failing Playwright journeys for timezone and interaction parity**

Add timezone metadata to the mocked Open-Meteo response and assert:

```ts
await expect(page.getByTestId("location-clock")).toContainText(/PDT|PST/);
await page.getByTestId("weather-metric-humidity").hover();
await expect(page.getByRole("tooltip")).toBeVisible();
await page.getByTestId("weather-metric-humidity").click();
await expect(page.getByTestId("weather-metric-detail")).toContainText("Relative humidity");
await page.keyboard.press("Escape");
await expect(page.getByTestId("weather-metric-detail")).toBeHidden();
```

Add a touch-device journey that taps UV and verifies the same detail without hover.

- [ ] **Step 2: Run the focused Chromium journeys and verify missing UI failures**

Run: `npx playwright test e2e/journeys.spec.ts --project=chromium --grep "location clock|weather metric"`

- [ ] **Step 3: Implement `LocationClock` with second-aligned cleanup**

Schedule the first update after `1000 - (Date.now() % 1000)`, then use a one-second interval.
Render time, local date, and `timezoneLabel(now, timezone)` with `dateTime={now.toISOString()}`.

- [ ] **Step 4: Implement data-driven metric definitions and preview/pin state**

Use a closed `MetricId` union and one definition per required metric. Reset on location key.
Buttons set preview on pointer enter/focus, pin on click/Enter, and close on Escape. Render the
preview beside its button without allowing it to become the only carrier of information.

- [ ] **Step 5: Integrate the clock and move enhanced metrics above the map**

Remove the old bottom `DetailsGrid` call and implementation only after the new explorer
contains humidity, UV, rain today, next-24-hour rain, wind, visibility, and pressure.

- [ ] **Step 6: Run UI validation**

Run: `npm run typecheck`

Run: `npx playwright test e2e/journeys.spec.ts --project=chromium --grep "location clock|weather metric"`

Expected: PASS for pointer, keyboard, and touch fixtures.

- [ ] **Step 7: Review Task 3 accessibility**

Confirm every metric button has an accessible value, `aria-describedby` only references a
mounted tooltip, the persistent panel is in-flow, and all mobile targets are at least 44 px.

### Task 4: Radar Provider Boundary and Lifecycle

**Files:**

- Create: `src/lib/radar/types.ts`
- Create: `src/lib/radar/provider.ts`
- Create: `src/lib/radar/noaa.ts`
- Create: `src/lib/radar/rainViewer.ts`
- Create: `src/lib/radar/state.ts`
- Create: `src/lib/radar/__tests__/provider.test.ts`
- Create: `src/lib/radar/__tests__/state.test.ts`
- Create: `src/hooks/useRadar.ts`

**Interfaces:**

- Produces: `radarProviderFor(place): RadarProviderId`, `loadRadarSource(place, signal)`,
  `noaaImageUrl(frame, viewport, size)`, `rainViewerTileUrl(frame, tile)`, `radarReducer`,
  and `useRadar(place, enabled)`.
- Consumes: `Place`, `MapViewport`, `visibleTiles`, and `fetchJson`.

- [ ] **Step 1: Write failing provider-selection and parser tests**

```ts
expect(radarProviderFor(place({ cc: "us" }))).toBe("noaa-mrms");
expect(radarProviderFor(place({ cc: "jp" }))).toBe("rainviewer");
expect(parseRainViewer({ host: "https://tilecache.rainviewer.com", radar: { past: [
  { time: 100, path: "/v2/radar/100" }, { time: 100, path: "/v2/radar/100" },
]}}).frames).toHaveLength(1);
expect(parseNoaaFrames({ features: [
  { attributes: { idp_validtime: 200_000 } }, { attributes: { idp_validtime: 100_000 } },
]}).frames.map((frame) => frame.validAt.getTime())).toEqual([100_000, 200_000]);
```

- [ ] **Step 2: Write failing reducer tests**

Cover dormant, loading, ready, refreshing, stale-same-key, error-new-key, retry generation,
and late-success rejection.

- [ ] **Step 3: Run focused radar tests and verify missing modules**

Run: `npx vitest run src/lib/radar/__tests__`

- [ ] **Step 4: Implement strict parsers and URL builders**

Validate HTTPS hosts, frame timestamps, nonempty paths, attribution, NOAA bbox ordering,
image dimensions, and RainViewer z/x/y bounds. Encode all query values with `URL` and
`URLSearchParams`; never concatenate user input into a provider origin.

- [ ] **Step 5: Implement provider selection and loading**

Use NOAA for normalized `us`, `pr`, `vi`, `gu`, and `mp` codes when its metadata has frames;
use RainViewer for other country codes. Do not fall through from a failed NOAA request to
RainViewer.

- [ ] **Step 6: Implement reducer and hook generation guards**

Abort superseded loads, scope provider circuit breakers separately, cache frame metadata for
two minutes, and retain stale data only when the location/provider key matches.

- [ ] **Step 7: Run focused and global unit validation**

Run: `npx vitest run src/lib/radar/__tests__`

Run: `npm run typecheck`

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Probe live provider metadata and one bounded image per provider**

Use the documented NOAA and RainViewer endpoints. Verify status, content type, nonzero image
bytes, and CORS response headers without logging full coordinate URLs.

### Task 5: Lazy Radar Mode in the Existing Map

**Files:**

- Create: `src/components/RadarOverlay.tsx`
- Modify: `src/components/ForecastMap.tsx`
- Modify: `src/lib/map/types.ts`
- Modify: `e2e/journeys.spec.ts`

**Interfaces:**

- Consumes: Task 4 radar hook/source, existing viewport/tiles/marker/controls, and reduced
  motion state.
- Produces: `Forecast`/`Radar` mode control, independent radar frame/playback state, visible
  provider attribution, legend, freshness, retry, and unavailable state.

- [ ] **Step 1: Add failing mocked NOAA and RainViewer browser journeys**

Assert Radar is dormant before selection, selecting Radar fetches only the correct provider,
the selected location determines provider, the observed label is visible, playback changes
frames without point/grid refetch, and returning to Forecast preserves forecast time.

- [ ] **Step 2: Add failing reduced-motion and provider-failure journeys**

Assert autoplay is disabled, manual scrubbing works, a radar error exposes Retry, and Forecast
mode remains usable with its prior field.

- [ ] **Step 3: Run the focused journeys and verify missing Radar control failures**

Run: `npx playwright test e2e/journeys.spec.ts --project=chromium --grep "radar"`

- [ ] **Step 4: Add map mode state and lazy import**

```ts
type MapMode = "forecast" | "radar";
const RadarOverlay = lazy(() => import("./RadarOverlay"));
```

Keep base tiles, viewport gestures, navigation controls, and location marker in
`ForecastMap`. Hide forecast canvases and controls in Radar mode without unmounting forecast
state.

- [ ] **Step 5: Implement provider-specific observed imagery**

For NOAA, render the active bounded export image over the viewport. For RainViewer, render
only visible radar tiles aligned to existing DOM base tiles. Set imagery decorative and put
the complete observed-time/provider summary on the map region.

- [ ] **Step 6: Implement independent timeline, legend, attribution, and status**

Radar autoplay advances available historical frames, stops on manual scrub, pauses when the
map/page is hidden, and never runs under reduced motion. Copy must say "Observed radar" and
show provider plus valid time.

- [ ] **Step 7: Run map/radar validation**

Run: `npm run typecheck`

Run: `npm test`

Run: `npx playwright test e2e/journeys.spec.ts --project=chromium --grep "forecast map|radar"`

Expected: PASS and no point weather or GFS grid refetch during radar playback.

- [ ] **Step 8: Build and enforce the bundle budget immediately**

Run: `npm run build`

Run: `npm run size`

Expected: initial JavaScript at or below 70 kB gzip and total at or below 90 kB gzip; radar is
an async chunk absent from the initial dependency graph.

### Task 6: Documentation and Full Release Validation

**Files:**

- Modify: `README.md`
- Modify: `e2e/journeys.spec.ts`
- Modify: implementation files only for defects exposed by validation.

**Interfaces:**

- Consumes: all prior task deliverables.
- Produces: documented provider/privacy/semantics contract and a fully validated working tree.

- [ ] **Step 1: Update documentation**

Document location-local/DST time, metric semantics, scene intensity, NOAA versus RainViewer
selection, observed-versus-forecast distinction, coverage gaps, RainViewer non-commercial
terms, attribution, provider disclosure, radar dormancy, no SLA, and rollback.

- [ ] **Step 2: Run static and unit validation**

Run: `npm run typecheck`

Run: `npm test`

- [ ] **Step 3: Run build, budget, and artifact smoke validation**

Run: `npm run build`

Run: `npm run size`

Run: `npm run smoke`

- [ ] **Step 4: Run all browser targets**

Run: `npm run e2e`

Verify Chromium, WebKit, iPhone 15, Pixel 7, and cinema target results with no horizontal
overflow or hover-only behavior.

- [ ] **Step 5: Run dependency and live provider contracts**

Run: `npm run deps`

Run: `npm run contract`

If network or provider availability prevents completion, record the exact failing endpoint
category and retain the successful offline validations without claiming the contract passed.

- [ ] **Step 6: Review the final diff and working tree**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --stat`

Confirm no secrets, credentials, unrelated churn, generated `dist` files, staged files, or
unauthorized git operations are present.

- [ ] **Step 7: Prepare the handoff**

Report exact changed files, commands and outcomes, unvalidated items, remaining provider and
licensing risks, and rollback. Do not claim deployment or live-host behavior.
