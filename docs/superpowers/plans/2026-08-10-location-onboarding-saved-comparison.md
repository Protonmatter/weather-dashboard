# Location Onboarding, Saved Locations, and Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagent delegation is not authorized for this task.

**Goal:** Add explicit first-run geolocation consent, six browser-local saved locations with quick switching, and a lazy, bounded comparison view that opens any location in the full dashboard.

**Architecture:** Keep the existing full `WeatherBundle` path as the single-location source of truth. Add pure versioned location persistence, a typed device-location failure boundary, and an async comparison slice whose one-request-per-place provider, two-slot scheduler, ten-minute in-memory cache, hook, and UI remain isolated from ensemble, AQI, map, and radar code.

**Tech Stack:** React 18, TypeScript 5.5 strict mode, Vite 7, Vitest 3 in Node, Playwright 1.62 across Chromium/WebKit/iPhone/Pixel, Tailwind CSS, existing keyless Open-Meteo and BigDataCloud providers.

## Global Constraints

- Do not add dependencies, a backend, authentication, telemetry, cookies, IndexedDB, or cross-device synchronization.
- Invoke native geolocation only after **Use my location** or the existing toolbar location control is activated.
- Never automatically save a searched or device-derived location.
- Store only normalized place metadata in `wx.saved-locations.v1`; store only completion state in `wx.location-onboarding.v1`.
- Seed removable Palo Alto, New York, and London defaults only when saved storage is missing or unusable; preserve a valid empty list.
- Reject invalid and duplicate places and cap the list at exactly six.
- Compare requires at least two saved locations and starts closed after reload.
- Compare displays current conditions, local time, high/low, rain today, humidity, UV, six hours, and three days.
- Compare issues at most two summary requests concurrently and never calls ensemble, AQI, map, NOAA MRMS, or RainViewer paths.
- Keep the existing dashboard visible until a replacement full forecast succeeds; retain it on failure.
- Preserve the explicitly approved 73 kB initial and 96 kB total gzipped JavaScript ceilings.
- Preserve keyboard, touch, reduced-motion, focus-restoration, and no-hover-dependency behavior.
- Do not commit, push, open a pull request, merge, or deploy without separate explicit authorization.

## File Structure

### New files

- `src/lib/locations/store.ts` — saved-place normalization, IDs, default seeding, mutations, versioned storage, onboarding completion, and session fallback contracts.
- `src/lib/locations/__tests__/store.test.ts` — deterministic persistence and mutation tests.
- `src/lib/__tests__/device.test.ts` — device failure classification and reverse-geocoder abort tests.
- `src/components/LocationOnboarding.tsx` — accessible first-run dialog and focus containment.
- `src/components/SavedLocationsBar.tsx` — quick-switch, save, remove, pending, active, and Compare controls.
- `src/lib/comparison/types.ts` — erased shared TypeScript contracts for provider, cache, hook, and UI.
- `src/lib/comparison/provider.ts` — strict Open-Meteo summary parser and fetch boundary.
- `src/lib/comparison/scheduler.ts` — abort-aware two-slot FIFO scheduler.
- `src/lib/comparison/__tests__/provider.test.ts` — summary schema, time, rain, URL, and failure tests.
- `src/lib/comparison/__tests__/scheduler.test.ts` — concurrency and queued-abort tests.
- `src/hooks/useComparison.ts` — generation checks, ten-minute cache use, revalidation, card-local error state, and retry.
- `src/components/ComparisonView.tsx` — responsive summary cards and full-forecast transition.
- `src/components/ComparisonBoundary.tsx` — lazy-chunk failure containment and exit action.
- `e2e/location-management.spec.ts` — onboarding, permission, persistence, quick-switch, comparison, responsive, and network-isolation journeys.

### Modified files

- `src/lib/providers/device.ts` — emit typed device failures and preserve aborts through reverse geocoding.
- `src/components/SearchBar.tsx` — accept an input ref and expose location loading without changing its public search behavior.
- `src/App.tsx` — coordinate onboarding, saved state, pending full loads, Compare mode, cache lifetime, and lazy boundaries.
- `src/App.tsx` — establish a narrow lazy boundary for the existing named `VerificationPanel` export to recover initial-bundle headroom.
- `e2e/journeys.spec.ts` — mark onboarding complete for pre-existing journeys so their original purpose remains unchanged.
- `src/lib/__tests__/contract.test.ts` — live comparison response contract.
- `README.md` — consent, saved storage, comparison behavior, limits, providers, and privacy.

---

### Task 1: Versioned Location Persistence

**Files:**
- Create: `src/lib/locations/store.ts`
- Create: `src/lib/locations/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `Place` from `src/lib/types.ts`.
- Produces:

```ts
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SavedLocationsState {
  locations: Place[];
  persistent: boolean;
  warning: string | null;
}

export type AddSavedLocationResult =
  | { ok: true; locations: Place[] }
  | { ok: false; reason: "invalid" | "duplicate" | "limit"; locations: Place[] };

export const MAX_SAVED_LOCATIONS = 6;
export const SAVED_LOCATIONS_KEY = "wx.saved-locations.v1";
export const LOCATION_ONBOARDING_KEY = "wx.location-onboarding.v1";
export const DEFAULT_SAVED_LOCATIONS: readonly Place[];
export function savedPlaceId(place: Place): string;
export function readSavedLocations(storage: StorageLike | null): SavedLocationsState;
export function writeSavedLocations(storage: StorageLike | null, locations: readonly Place[]): SavedLocationsState;
export function addSavedLocation(locations: readonly Place[], place: Place): AddSavedLocationResult;
export function removeSavedLocation(locations: readonly Place[], id: string): Place[];
export function readLocationOnboardingComplete(storage: StorageLike | null): boolean;
export function writeLocationOnboardingComplete(storage: StorageLike | null): boolean;
```

- [ ] **Step 1: Write failing storage tests**

Cover missing, valid-empty, malformed, partially invalid, duplicate, over-limit, removal,
write-failure, and onboarding cases with an in-memory `StorageLike`:

```ts
const memoryStorage = (): StorageLike & { values: Map<string, string> } => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
};

const place = (index: number): Place => ({
  lat: index,
  lon: index,
  name: `Place ${index}`,
  admin: "",
  country: "Test Country",
  cc: "tc",
});

it("seeds defaults for a missing document but preserves a valid empty list", () => {
  const storage = memoryStorage();
  expect(readSavedLocations(storage).locations.map((place) => place.name)).toEqual([
    "Palo Alto", "New York", "London",
  ]);
  storage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify({ version: 1, locations: [] }));
  expect(readSavedLocations(storage).locations).toEqual([]);
});

it("rejects a rounded-coordinate duplicate and a seventh place", () => {
  const duplicate = addSavedLocation(DEFAULT_SAVED_LOCATIONS, {
    ...DEFAULT_SAVED_LOCATIONS[0]!, lat: 37.44191,
  });
  expect(duplicate).toMatchObject({ ok: false, reason: "duplicate" });
  const six = Array.from({ length: 6 }, (_, index) => place(index));
  expect(addSavedLocation(six, place(7))).toMatchObject({ ok: false, reason: "limit" });
});
```

- [ ] **Step 2: Verify the storage tests fail for the intended reason**

Run: `npx vitest run src/lib/locations/__tests__/store.test.ts`

Expected: FAIL because `src/lib/locations/store.ts` does not exist.

- [ ] **Step 3: Implement normalization and deterministic mutations**

Use a versioned document, four-decimal coordinate ID, latitude `[-90, 90]`, longitude
`[-180, 180]`, trimmed bounded strings, lowercase two-letter country code, cloned return
values, and stable insertion order. Distinguish an absent/unusable document from a valid
empty array. Catch storage reads and writes and return `persistent: false` plus a concise
warning without throwing.

```ts
const documentFor = (locations: readonly Place[]) => ({
  version: 1 as const,
  locations: locations.map(normalizePlace),
});

export function savedPlaceId(place: Place): string {
  return `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
}
```

- [ ] **Step 4: Run focused and full unit suites**

Run: `npx vitest run src/lib/locations/__tests__/store.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all existing and new unit/regression tests PASS.

- [ ] **Step 5: Review the scoped diff without committing**

Run: `git diff --check -- src/lib/locations/store.ts src/lib/locations/__tests__/store.test.ts`

Expected: no output and exit code 0.

### Task 2: Typed Device Location Failures

**Files:**
- Modify: `src/lib/providers/device.ts`
- Create: `src/lib/__tests__/device.test.ts`

**Interfaces:**
- Consumes: existing `fetchJson`, `isAbort`, `Place`, and browser geolocation.
- Produces:

```ts
export type DeviceLocationFailureKind =
  | "denied" | "timeout" | "unavailable" | "unsupported" | "insecure" | "unknown";

export class DeviceLocationError extends Error {
  constructor(readonly kind: DeviceLocationFailureKind, message: string);
}

export function classifyDeviceLocationError(error: unknown): DeviceLocationError;
export async function locateDevice(signal?: AbortSignal): Promise<Place>;
```

- [ ] **Step 1: Write failing classification and abort tests**

```ts
it.each([[1, "denied"], [2, "unavailable"], [3, "timeout"]] as const)(
  "maps browser code %s to %s",
  (code, kind) => {
    expect(classifyDeviceLocationError({ code })).toMatchObject({ kind });
  }
);

it("does not swallow an abort from reverse geocoding", async () => {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (resolve: PositionCallback) => resolve({
        coords: { latitude: 37.44, longitude: -122.14 },
      } as GeolocationPosition),
    },
  });
  vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("Aborted", "AbortError"); }));
  await expect(locateDevice(new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
});
```

- [ ] **Step 2: Verify the focused test fails**

Run: `npx vitest run src/lib/__tests__/device.test.ts`

Expected: FAIL because typed failures are not exported and reverse-geocoder abort is swallowed.

- [ ] **Step 3: Implement the typed boundary**

Check secure context and API support before calling geolocation. Translate only positioning
failures; preserve caller aborts. Keep reverse-geocoding failure cosmetic, except abort.

```ts
try {
  return await reverseGeocode(base, signal);
} catch (error) {
  if (isAbort(error)) throw error;
  return base;
}
```

- [ ] **Step 4: Run focused and provider unit suites**

Run: `npx vitest run src/lib/__tests__/device.test.ts src/lib/__tests__/http.test.ts`

Expected: PASS.

- [ ] **Step 5: Review the scoped diff without committing**

Run: `git diff --check -- src/lib/providers/device.ts src/lib/__tests__/device.test.ts`

Expected: no output and exit code 0.

### Task 3: First-Run Location Onboarding

**Files:**
- Create: `src/components/LocationOnboarding.tsx`
- Modify: `src/components/SearchBar.tsx`
- Modify: `src/App.tsx`
- Modify: `e2e/journeys.spec.ts`
- Create: `e2e/location-management.spec.ts`

**Interfaces:**
- Consumes: Task 1 onboarding persistence and Task 2 `locateDevice`/`DeviceLocationError`.
- Produces:

```ts
interface LocationOnboardingProps {
  open: boolean;
  busy: boolean;
  onUseLocation: () => void;
  onNotNow: () => void;
  restoreFocusRef: React.RefObject<HTMLInputElement>;
}
```

`SearchBar` additionally consumes `inputRef: React.RefObject<HTMLInputElement>` and
`locating: boolean` without changing existing search callbacks.

- [ ] **Step 1: Add failing browser journeys**

In `e2e/journeys.spec.ts`, set `wx.location-onboarding.v1` to complete before existing
journeys navigate. In the new spec, keep storage empty and stub only deterministic provider
routes required for location management.

```ts
test("first visit waits for an explicit action before requesting location", async ({ page }) => {
  let reverseRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("reverse-geocode-client")) reverseRequests += 1;
  });
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Use your local weather" })).toBeVisible();
  expect(reverseRequests).toBe(0);
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
```

Add granted, denied, timeout, unsupported, Escape, and focus-restoration journeys. Granted
permission uses Playwright context geolocation and verifies BigDataCloud plus the detected
coordinate forecast. Denied/failed cases verify the Palo Alto live load and toolbar retry.

- [ ] **Step 2: Build and run the focused journeys to verify failure**

Run: `npm run build`

Expected: PASS before feature code.

Run: `npx playwright test e2e/location-management.spec.ts --project=chromium`

Expected: FAIL because the first-run dialog does not exist.

- [ ] **Step 3: Implement dialog semantics and bootstrap orchestration**

Use an in-flow React overlay with `role="dialog"`, `aria-modal="true"`, labelled title and
description, focus on the primary action, Tab/Shift+Tab containment, Escape dismissal, and
focus restoration. Do not close on backdrop click.

In `App`, read onboarding state once. Returning users load Palo Alto on mount. First-time
users retain `fallbackBundle()` until Use or Not now. Success completes onboarding and loads
the device place without saving. Failure completes onboarding, closes the dialog, shows the
kind-specific message, and loads Palo Alto.

```ts
const locationMessage: Record<DeviceLocationFailureKind, string> = {
  denied: "Location access is off. Allow it in browser settings or search for a place.",
  timeout: "Location timed out. Try again or search for a place.",
  unavailable: "Your location is unavailable. Try again or search for a place.",
  unsupported: "This browser does not support automatic location. Search for a place.",
  insecure: "Automatic location requires a secure connection. Search for a place.",
  unknown: "Location is unavailable. Try again or search for a place.",
};
```

- [ ] **Step 4: Run focused browser and regression suites**

Run: `npm run build`

Expected: PASS.

Run: `npx playwright test e2e/location-management.spec.ts --project=chromium`

Expected: onboarding journeys PASS.

Run: `npx playwright test e2e/journeys.spec.ts --project=chromium`

Expected: existing Chromium journeys PASS with onboarding pre-completed.

- [ ] **Step 5: Run static checks and review without committing**

Run: `npm run typecheck`

Expected: PASS.

Run: `git diff --check`

Expected: no output and exit code 0.

### Task 4: Saved-Location Strip and Safe Quick Switching

**Files:**
- Create: `src/components/SavedLocationsBar.tsx`
- Modify: `src/App.tsx`
- Modify: `e2e/location-management.spec.ts`

**Interfaces:**
- Consumes: Task 1 store, active `weather.data.place`, `weather.busy`, and the existing full loader.
- Produces:

```ts
interface SavedLocationsBarProps {
  locations: readonly Place[];
  activeId: string;
  pendingId: string | null;
  canSaveCurrent: boolean;
  compare: boolean;
  compareButtonRef: React.RefObject<HTMLButtonElement>;
  onSelect: (place: Place) => void;
  onSaveCurrent: () => void;
  onRemove: (id: string) => void;
  onCompare: () => void;
}
```

- [ ] **Step 1: Add failing saved-location journeys**

```ts
test("seeds removable examples and quick-switches only after a successful load", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("button", { name: /Open Palo Alto/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: /Open New York/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open London/ })).toBeVisible();
  await page.getByRole("button", { name: /Open New York/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("New York");
  await expect(page.getByRole("button", { name: /Open New York/ })).toHaveAttribute("aria-current", "true");
});
```

Add save-after-geolocation, no implicit save, duplicate, remove/reload, valid-empty, six-item
limit, failed switch retention, horizontal phone strip, focus visibility, and mobile tap tests.

- [ ] **Step 2: Verify the focused saved-location journeys fail**

Run: `npm run build`

Expected: PASS.

Run: `npx playwright test e2e/location-management.spec.ts --project=chromium --grep "saved|quick-switch|six-item"`

Expected: FAIL because the saved-location strip does not exist.

- [ ] **Step 3: Implement the saved strip and App state**

Initialize from `readSavedLocations`, retain a session copy after storage failures, persist
every successful mutation, and surface warnings through the existing status region. Render
quick-switch and remove as sibling controls. Derive active state from `weather.data.place`.

Track pending full loads with a monotonic selection sequence so an earlier completion cannot
clear a newer pending indicator:

```ts
const selectSequence = useRef(0);
const selectPlace = useCallback(async (place: Place) => {
  const sequence = ++selectSequence.current;
  setPendingPlaceId(savedPlaceId(place));
  await weather.load(place);
  if (sequence === selectSequence.current) setPendingPlaceId(null);
}, [weather]);
```

Removing the active place leaves its already loaded dashboard visible but unsaved. Disable
Compare with an explanatory accessible description below two saved places.

- [ ] **Step 4: Run focused unit, browser, and static suites**

Run: `npx vitest run src/lib/locations/__tests__/store.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npx playwright test e2e/location-management.spec.ts --project=chromium`

Expected: onboarding and saved-location journeys PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review the scoped diff without committing**

Run: `git diff --check`

Expected: no output and exit code 0.

### Task 5: Lightweight Comparison Provider

**Files:**
- Create: `src/lib/comparison/types.ts`
- Create: `src/lib/comparison/provider.ts`
- Create: `src/lib/comparison/__tests__/provider.test.ts`

**Interfaces:**
- Consumes: `Place`, `fetchJson`, `assertTimeZone`, and `localDateKey`.
- Produces:

```ts
export interface ComparisonHour {
  time: Date;
  tempF: number;
  code: number;
  isDay: boolean;
  pop: number;
  precipitationIn: number;
}

export interface ComparisonDay {
  date: Date;
  lowF: number;
  highF: number;
  code: number;
}

export interface ComparisonSummary {
  place: Place;
  timezone: string;
  updatedAt: Date;
  current: { temperatureF: number; apparentF: number; code: number; isDay: boolean; humidityPercent: number };
  today: { lowF: number; highF: number; uvMax: number; rainSoFarIn: number };
  hourly: readonly ComparisonHour[];
  daily: readonly ComparisonDay[];
}

export function parseComparisonResponse(value: unknown, place: Place, nowMs?: number): ComparisonSummary;
export function comparisonUrl(place: Place): string;
export async function fetchComparison(place: Place, signal?: AbortSignal): Promise<ComparisonSummary>;
```

- [ ] **Step 1: Write failing strict-parser and URL tests**

```ts
const FIXTURE_NOW = Date.parse("2026-08-10T16:00:00Z");
const paloAlto: Place = {
  lat: 37.4419,
  lon: -122.143,
  name: "Palo Alto",
  admin: "California",
  country: "United States",
  cc: "us",
};

const response = () => ({
  timezone: "America/Los_Angeles",
  current_units: {
    time: "unixtime", temperature_2m: "°F", apparent_temperature: "°F",
    relative_humidity_2m: "%", weather_code: "wmo code", is_day: "",
  },
  current: {
    time: FIXTURE_NOW / 1000, temperature_2m: 72, apparent_temperature: 71,
    relative_humidity_2m: 48, weather_code: 1, is_day: 1,
  },
  hourly_units: {
    time: "unixtime", temperature_2m: "°F", weather_code: "wmo code",
    precipitation_probability: "%", precipitation: "inch", is_day: "",
  },
  hourly: {
    time: Array.from({ length: 6 }, (_, index) => FIXTURE_NOW / 1000 + index * 3600),
    temperature_2m: [72, 73, 74, 73, 71, 69],
    weather_code: [1, 1, 2, 2, 3, 3],
    precipitation_probability: [0, 0, 10, 20, 30, 20],
    precipitation: [0, 0, 0, 0.01, 0.02, 0],
    is_day: [1, 1, 1, 1, 1, 0],
  },
  minutely_15_units: { time: "unixtime", rain: "inch", showers: "inch" },
  minutely_15: {
    time: Array.from({ length: 105 }, (_, index) => FIXTURE_NOW / 1000 - (104 - index) * 900),
    rain: Array.from({ length: 105 }, (_, index) => index >= 101 ? 0.05 : 0),
    showers: Array.from({ length: 105 }, (_, index) => index >= 101 ? 0.025 : 0),
  },
  daily_units: {
    time: "unixtime", weather_code: "wmo code", temperature_2m_max: "°F",
    temperature_2m_min: "°F", uv_index_max: "",
  },
  daily: {
    time: [1_786_282_800, 1_786_369_200, 1_786_455_600],
    weather_code: [1, 2, 3],
    temperature_2m_max: [78, 76, 74],
    temperature_2m_min: [58, 59, 57],
    uv_index_max: [6, 5, 4],
  },
});

it("returns exactly six future hours, three days, local time, and elapsed liquid rain", () => {
  const summary = parseComparisonResponse(response(), paloAlto, FIXTURE_NOW);
  expect(summary.timezone).toBe("America/Los_Angeles");
  expect(summary.hourly).toHaveLength(6);
  expect(summary.daily).toHaveLength(3);
  expect(summary.today.rainSoFarIn).toBeCloseTo(0.3, 8);
});

it("requests no expensive side-channel fields", () => {
  const url = new URL(comparisonUrl(paloAlto));
  expect(url.searchParams.get("forecast_hours")).toBe("6");
  expect(url.searchParams.get("forecast_days")).toBe("3");
  expect(url.searchParams.get("past_minutely_15")).toBe("104");
  expect(url.hostname).toBe("api.open-meteo.com");
});
```

Add failures for invalid timezone, missing/misaligned arrays, non-finite values, short axes,
snow-only precipitation, local midnight, and incorrect units.

- [ ] **Step 2: Verify the focused provider tests fail**

Run: `npx vitest run src/lib/comparison/__tests__/provider.test.ts`

Expected: FAIL because the comparison provider does not exist.

- [ ] **Step 3: Implement strict parsing and one-request fetch**

Build one URL with only the approved current/hourly/daily/15-minute fields,
`past_minutely_15=104`, `forecast_minutely_15=1`, `forecast_hours=6`, `forecast_days=3`,
Fahrenheit, inches, Unix time, and `timezone=auto`. Validate response units and aligned
arrays before indexing. Use `circuitBreakerScope: "comparison"`, retries 1, and no HTTP
cache so the comparison layer controls freshness and revalidation.

- [ ] **Step 4: Run focused and full unit suites**

Run: `npx vitest run src/lib/comparison/__tests__/provider.test.ts src/lib/__tests__/openMeteo.test.ts`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Review the scoped diff without committing**

Run: `git diff --check -- src/lib/comparison`

Expected: no output and exit code 0.

### Task 6: Abort-Aware Scheduler and Comparison State

**Files:**
- Create: `src/lib/comparison/scheduler.ts`
- Create: `src/lib/comparison/__tests__/scheduler.test.ts`
- Create: `src/hooks/useComparison.ts`
- Modify: `src/lib/comparison/types.ts`

**Interfaces:**
- Consumes: Task 5 `fetchComparison`, `ComparisonSummary`, and Task 1 `savedPlaceId`.
- Produces:

```ts
export interface ComparisonScheduler {
  schedule<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}
export function createComparisonScheduler(limit?: number): ComparisonScheduler;

export type ComparisonCardState =
  | { id: string; place: Place; status: "loading" }
  | { id: string; place: Place; status: "refreshing"; summary: ComparisonSummary }
  | { id: string; place: Place; status: "ready"; summary: ComparisonSummary }
  | { id: string; place: Place; status: "stale"; summary: ComparisonSummary; error: string }
  | { id: string; place: Place; status: "error"; error: string };

export interface ComparisonCacheEntry { summary: ComparisonSummary; storedAt: number }
export type ComparisonCache = Map<string, ComparisonCacheEntry>;

export function useComparison(
  places: readonly Place[],
  cache: ComparisonCache
): { cards: readonly ComparisonCardState[]; retry: (place: Place) => void };
```

- [ ] **Step 1: Write failing scheduler tests**

```ts
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

it("never runs more than two tasks at once", async () => {
  const scheduler = createComparisonScheduler(2);
  let active = 0;
  let maximum = 0;
  const gates = Array.from({ length: 6 }, deferred);
  const tasks = gates.map((gate) => scheduler.schedule(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await gate.promise;
    active -= 1;
  }));
  await vi.waitFor(() => expect(maximum).toBe(2));
  gates.forEach((gate) => gate.resolve());
  await Promise.all(tasks);
  expect(maximum).toBe(2);
});

it("rejects an aborted queued task without starting it", async () => {
  const scheduler = createComparisonScheduler(1);
  const gate = deferred();
  const running = scheduler.schedule(async () => { await gate.promise; });
  const queuedWork = vi.fn(async () => undefined);
  const controller = new AbortController();
  const queued = scheduler.schedule(queuedWork, controller.signal);
  controller.abort();
  await expect(queued).rejects.toMatchObject({ name: "AbortError" });
  gate.resolve();
  await running;
  expect(queuedWork).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify scheduler tests fail**

Run: `npx vitest run src/lib/comparison/__tests__/scheduler.test.ts`

Expected: FAIL because the scheduler does not exist.

- [ ] **Step 3: Implement FIFO scheduling and the hook**

The scheduler checks abort before queueing and again before starting. Completion always
releases a slot in `finally`. The hook owns one two-slot scheduler, aborts the prior
generation on unmount or place-list change, emits cached entries as `refreshing`, and then
revalidates. A successful response records `{ summary, storedAt: Date.now() }`. Failure with
a cache entry becomes `stale`; failure without one becomes `error`. Retry uses the same
scheduler and current generation signal.

```ts
const CACHE_TTL_MS = 600_000;
const generation = ++generationRef.current;
const current = cache.get(id);
const fresh = current && Date.now() - current.storedAt < CACHE_TTL_MS;
```

- [ ] **Step 4: Run scheduler, provider, and full unit suites**

Run: `npx vitest run src/lib/comparison/__tests__`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Run typecheck and review without committing**

Run: `npm run typecheck`

Expected: PASS.

Run: `git diff --check -- src/lib/comparison src/hooks/useComparison.ts`

Expected: no output and exit code 0.

### Task 7: Lazy Responsive Comparison UI

**Files:**
- Create: `src/components/ComparisonView.tsx`
- Create: `src/components/ComparisonBoundary.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/SavedLocationsBar.tsx`
- Modify: `e2e/location-management.spec.ts`

**Interfaces:**
- Consumes: Task 6 hook/cache, saved places, global F/C unit, and App full-location selector.
- Produces a default-exported `ComparisonView` for React lazy loading:

```ts
interface ComparisonViewProps {
  places: readonly Place[];
  unit: "F" | "C";
  cache: ComparisonCache;
  onOpenFull: (place: Place) => void;
}
export default function ComparisonView(props: ComparisonViewProps): JSX.Element;

interface ComparisonBoundaryProps {
  children: React.ReactNode;
  onExit: () => void;
  restoreFocusRef: React.RefObject<HTMLButtonElement>;
}
```

- [ ] **Step 1: Add failing comparison journeys**

Cover toggle guidance, one/two/three-column targets, local clocks, F/C consistency, six
hours, three days, card-local failure/retry, cached-first revalidation, selecting a full
forecast, closing/unmount abort, lazy-chunk failure, and touch/keyboard activation.

```ts
test("comparison uses only bounded point-summary requests", async ({ page }) => {
  const requestedHosts: string[] = [];
  let comparing = false;
  page.on("request", (request) => {
    if (comparing) requestedHosts.push(new URL(request.url()).hostname);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText(/Live data from Open-Meteo/)).toBeVisible();
  comparing = true;
  await page.getByRole("button", { name: /Compare saved locations/ }).click();
  await expect(page.getByTestId("comparison-card")).toHaveCount(3);
  expect(requestedHosts).not.toContain("ensemble-api.open-meteo.com");
  expect(requestedHosts).not.toContain("air-quality-api.open-meteo.com");
  expect(requestedHosts).not.toContain("mapservices.weather.noaa.gov");
  expect(requestedHosts).not.toContain("api.rainviewer.com");
});
```

- [ ] **Step 2: Verify the focused comparison journeys fail**

Run: `npm run build`

Expected: PASS before UI code.

Run: `npx playwright test e2e/location-management.spec.ts --project=chromium --grep "comparison|Compare"`

Expected: FAIL because Compare is not implemented.

- [ ] **Step 3: Implement lazy UI and failure boundary**

Declare `ComparisonView` with `React.lazy` in `App`. Keep a `ComparisonCache` in an App ref
so closing and reopening the lazy component retains ten-minute entries. While Compare is
active, render `ComparisonBoundary` and `Suspense` in place of the full detail tree. Search
and `SavedLocationsBar` remain mounted.

Use semantic sections and buttons, `aria-busy`, polite card-local status, source freshness,
and `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`. Render icons already present in the bundle or
plain text; add no package. The boundary offers **Return to full dashboard** and restores
focus to the Compare toggle.

- [ ] **Step 4: Run focused multi-viewport comparison journeys**

Run: `npm run build`

Expected: PASS.

Run: `npx playwright test e2e/location-management.spec.ts --project=chromium`

Expected: PASS.

Run: `npx playwright test e2e/location-management.spec.ts --project=webkit`

Expected: PASS.

Run: `npx playwright test e2e/location-management.spec.ts --project=iphone`

Expected: PASS.

Run: `npx playwright test e2e/location-management.spec.ts --project=android`

Expected: PASS.

- [ ] **Step 5: Run static checks and review without committing**

Run: `npm run typecheck`

Expected: PASS.

Run: `git diff --check`

Expected: no output and exit code 0.

### Task 8: Provider Contract, Documentation, and Bundle Guardrails

**Files:**
- Modify: `src/lib/__tests__/contract.test.ts`
- Modify: `README.md`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 5 `comparisonUrl`/parser behavior and the completed UI.
- Produces: documented provider/privacy behavior and a build within both existing gzip budgets.

- [ ] **Step 1: Add the live comparison contract assertion**

Call `comparisonUrl` for Palo Alto and assert current fields, six hourly values, three daily
values, 105 15-minute intervals, Unix timestamps, Fahrenheit, inches, and an IANA timezone.
Keep the test inside the existing conditional contract suite and 30-second timeout.

- [ ] **Step 2: Update README behavior and privacy documentation**

Add first-run consent, local-only saved metadata, removable defaults, maximum six, quick
switching, Compare's responsive guidance and reduced provider set, failure behavior, and the
fact that coordinates reach BigDataCloud/Open-Meteo only for their described purposes.

- [ ] **Step 3: Build and measure before changing chunk boundaries**

Run: `npm run build`

Expected: PASS.

Run: `npm run size`

Expected: initial JavaScript at or below 73 kB and total JavaScript at or below 96 kB.

- [ ] **Step 4: Establish the scoped verification-panel lazy boundary**

Because the baseline initial bundle has no measurable headroom, replace the static
`VerificationPanel` import with a lazy named-export adapter and wrap its existing render in
`Suspense`. Do not change verification behavior or data flow.

```ts
const VerificationPanel = lazy(async () => ({
  default: (await import("./components/VerificationPanel")).VerificationPanel,
}));
```

Run: `npm run build`

Expected: PASS.

Run: `npm run size`

Expected: both existing budgets PASS. If either budget still fails, stop and report the
exact initial/total measurement and largest changed chunks as required by the approved
specification; do not change either ceiling.

- [ ] **Step 5: Run contract and documentation checks**

Run: `npm run contract`

Expected: all live provider contracts PASS; if external network access is unavailable,
record the exact failed endpoint and retain the deterministic parser coverage without
claiming contract validation.

Run: `git diff --check -- README.md src/lib/__tests__/contract.test.ts src/App.tsx`

Expected: no output and exit code 0.

### Task 9: Full Validation and Final Review

**Files:**
- Review every changed and new file; do not add unrelated edits.

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: a verified, uncommitted implementation ready for explicit Git authorization.

- [ ] **Step 1: Run static and unit validation**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run deps`

Expected: PASS with no high/critical vulnerability or licence-policy regression.

- [ ] **Step 2: Build, size, and smoke the production artifact**

Run: `npm run build`

Expected: PASS.

Run: `npm run size`

Expected: PASS at or below 73 kB initial and 96 kB total gzip JavaScript.

Run: `npm run smoke`

Expected: every artifact smoke assertion PASS.

- [ ] **Step 3: Run all browser projects**

Run: `npm run e2e`

Expected: all existing and new Chromium, WebKit, iPhone, and Android journeys PASS.

- [ ] **Step 4: Run live provider contracts once more after the production build**

Run: `npm run contract`

Expected: PASS, subject only to documented external provider availability.

- [ ] **Step 5: Inspect the complete diff and workspace**

Run: `git diff --check`

Expected: no output and exit code 0.

Run: `git status --short`

Expected: only the approved specification, implementation plan, source, tests, and README
changes; no generated `dist`, Playwright report, credentials, or unrelated files.

Run: `git diff --stat`

Expected: only the scoped feature and documentation files appear.

Run: `git diff`

Expected: focused changes matching the approved specification, with no credential, provider
URL, public-interface, or deployment drift beyond the documented feature.

- [ ] **Step 6: Report completion without Git publication**

List exact changed files, validation results, anything not validated, bundle measurements,
privacy limitations, and remaining risks. Leave the work uncommitted until explicit Git
authorization is received.
