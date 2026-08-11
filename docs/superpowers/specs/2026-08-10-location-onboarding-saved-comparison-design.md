# Location Onboarding, Saved Locations, and Comparison Design

| | |
| --- | --- |
| Status | Approved |
| Date | 2026-08-10 |
| Scope | First-run geolocation, saved-location quick switching, and lightweight comparison |
| Related | RFC 0003, RFC 0005, 2026-08-09 weather-context and radar design |

## 1. Outcome

Make the dashboard useful immediately for a visitor's physical location while preserving a
clear consent boundary. Add a small, browser-local saved-location list for fast switching
and an optional comparison view that remains useful on phones without multiplying the
dashboard's expensive ensemble, map, air-quality, and radar work.

The release adds:

- an immediate first-visit welcome card with **Use my location** and **Not now** actions;
- a browser-native geolocation request only after the user activates the primary action;
- actionable denied, unavailable, timeout, insecure-context, and unsupported states;
- a versioned, validated saved-location list stored only in the current browser;
- removable Palo Alto, New York, and London starter locations;
- one-action switching between saved locations and explicit saving of the active location;
- an optional **Compare** view labelled as best on tablet or desktop;
- independently loaded summaries for current conditions, high/low, rain, humidity, UV,
  the next six hours, and the next three days;
- a direct path from any summary to that location's complete dashboard.

The existing single-location dashboard remains the primary experience. Comparison does not
duplicate full dashboards, ensemble forecasts, air-quality requests, maps, or radar.

## 2. Chosen Approach

Use progressive, client-only enhancement with a dedicated lightweight comparison loader.

The saved-location strip is always available and loads one complete dashboard at a time.
Comparison code loads asynchronously only after the user activates Compare. It requests one
bounded point summary per saved location, runs no more than two requests concurrently, and
keeps a short in-memory cache so revisiting Compare does not return to an empty screen.

Alternatives were rejected:

- Loading a complete weather bundle for every saved location would download ensemble and
  air-quality data that comparison never displays and would unnecessarily multiply provider
  traffic.
- Comparing only previously visited locations would minimize traffic but produce confusing
  empty cards and make the feature appear unreliable.
- Rendering multiple complete dashboards would duplicate maps and radar, create an
  impractical phone layout, and weaken the existing bundle and request limits.

The saved list contains at most six locations. This is a product and operational boundary:
it keeps the quick-switch strip comprehensible, comparison grids useful, and provider work
bounded.

## 3. User Experience

### 3.1 First-visit location consent

On first visit, the app renders its existing Palo Alto sample behind an accessible welcome
dialog. It does not invoke geolocation during page load. The dialog states why location is
useful and accurately explains that coordinates are sent to weather and reverse-geocoding
providers, while saved locations remain in this browser.

The actions are:

- **Use my location** calls `navigator.geolocation.getCurrentPosition`, allowing the browser
  to show its native permission prompt. A successful position is reverse geocoded when
  possible and loaded as the complete active dashboard. It is not automatically saved.
- **Not now** dismisses the dialog and starts the normal Palo Alto live load.
- Escape has the same persistent dismissal behavior as **Not now**.

The app records that the first-run decision was completed and does not interrupt returning
users. The existing toolbar location control remains available after either choice. If
browser storage is unavailable, dismissal lasts for the current page session only.

The default Palo Alto network load is deferred while the first-visit dialog is unresolved.
This avoids a redundant request when the visitor immediately chooses their physical
location. The existing sample bundle remains visible behind the dialog.

### 3.2 Saved locations and quick switching

The saved strip sits below search and above the full dashboard. On first initialization it
contains these removable examples:

| Name | Region | Country | Coordinates |
| --- | --- | --- | --- |
| Palo Alto | California | United States | 37.4419, -122.1430 |
| New York | New York | United States | 40.7128, -74.0060 |
| London | England | United Kingdom | 51.5072, -0.1276 |

Each location has a quick-switch control and a separate, correctly labelled remove control;
interactive controls are not nested. The active location is exposed visually and with
`aria-current`. Selecting a saved location keeps the current dashboard visible while the
new complete forecast loads. The new location becomes active only after a successful load.
Failure retains the prior dashboard and offers a retry.

An explicit **Save current location** action stores the active place if it is not already in
the list. Saving never occurs implicitly after search or geolocation. Duplicate and
over-limit attempts return a clear status message. Removing a starter location persists
like any other removal.

On phones, the strip scrolls horizontally with full keyboard reachability and visible focus.
No saved-location action depends on hover. Mouse hover and keyboard focus may expose compact
supplementary tooltips for icon-only actions, while all essential text remains visible or in
the accessible name.

### 3.3 Compare mode

Compare is an explicit toggle with `aria-pressed` and adjacent guidance that it is best on
tablet or desktop. It remains functional on phones and is enabled when at least two places
are saved. With fewer than two places, the disabled control explains that another location
must be saved. Compare mode is session-only and starts closed after reload. When enabled,
search and the saved strip remain available, while the detailed single-location dashboard
is temporarily replaced by summary cards.

The layout is:

- one column on phones;
- two columns on tablets;
- up to three columns on wide screens.

Every summary contains:

- place name and location-local time;
- current temperature, apparent temperature, and condition;
- today's high and low;
- current humidity and daily peak UV;
- rain so far today and the next six hourly precipitation probabilities/totals;
- the next six hourly temperature/condition points;
- the next three daily high/low/condition summaries;
- source freshness and a clear **Open full forecast** action.

The dashboard's existing Fahrenheit/Celsius selection applies consistently to every
comparison card and does not change the canonical stored summary values.

Activating **Open full forecast** disables Compare and loads that place through the normal
complete dashboard path. It does not automatically add an unsaved place, although all
comparison inputs normally originate from the saved list.

## 4. Data Contracts and Boundaries

### 4.1 Browser-local state

Use independent versioned keys:

- `wx.location-onboarding.v1` stores only whether the first-run decision is complete;
- `wx.saved-locations.v1` stores normalized place metadata, never weather responses.

Saved data is parsed as untrusted input. Every entry must have finite latitude and longitude
within geographic bounds, bounded display strings, a normalized lowercase country code,
and a deterministic identifier derived from coordinates rounded to four decimal places.
Invalid entries are dropped. A missing store seeds the three defaults; an invalid document
that yields no valid entries is replaced with those defaults. A valid empty list remains
empty so removing every starter location is respected.

Writes are idempotent and preserve deterministic order. Storage exceptions fall back to an
in-memory list for the current session and produce a non-blocking status message. No
authentication, account synchronization, cookie, IndexedDB store, or backend is added.

### 4.2 Comparison summary

The comparison provider returns a small internal contract rather than `WeatherBundle`:

```ts
interface ComparisonSummary {
  place: Place;
  timezone: string;
  updatedAt: Date;
  current: {
    temperatureF: number;
    apparentF: number;
    code: number;
    isDay: boolean;
    humidityPercent: number;
  };
  today: {
    lowF: number;
    highF: number;
    uvMax: number;
    rainSoFarIn: number;
  };
  hourly: readonly ComparisonHour[]; // exactly the next six available hours
  daily: readonly ComparisonDay[];   // today plus the next two local calendar days
}
```

One Open-Meteo request per location obtains only the current, hourly, daily, and 15-minute
fields required by this contract with `timezone=auto`. A 26-hour 15-minute lookback provides
enough rain and shower intervals to filter the selected location's elapsed local calendar
day across timezone and daylight-saving boundaries. The provider validates aligned arrays,
finite numeric values, units, IANA timezone metadata, and required lengths at its boundary.
Rain-so-far semantics therefore match the full dashboard: elapsed liquid rain and showers
on the location-local calendar day, labelled as a provider model/analysis estimate rather
than a gauge observation.

Comparison does not call the ensemble, air-quality, forecast-map, NOAA MRMS, or RainViewer
paths. It does not write summaries to the forecast-verification archive or local storage.

### 4.3 Loading and cache behavior

Opening Compare starts a queue for the current saved list with concurrency capped at two.
Each card owns its loading, success, and failure state. Closing Compare aborts outstanding
work. Removing a location aborts or ignores its pending result. A request generation prevents
late responses from updating a newer saved list.

Successful summaries remain in memory for ten minutes. A fresh cached summary renders
immediately on the next Compare activation while revalidation runs in the background. A
failed revalidation retains the cached card, marks its freshness honestly, and exposes Retry.
Cache keys use normalized coordinates and do not include user-controlled URLs.

## 5. Components and Responsibilities

- `LocationOnboarding` owns dialog presentation, focus containment, consent copy, and the
  first-run actions. It does not call weather providers directly.
- The device-location provider continues to own geolocation and reverse geocoding and gains
  typed failure classification without exposing provider URLs in user messages.
- A saved-location store owns validation, seeding, deduplication, the six-item limit, and
  storage fallback. It has no React or network dependency.
- `SavedLocationsBar` owns quick-switch, save, remove, active, pending, and Compare controls.
- A comparison provider owns the remote schema boundary and normalization.
- A comparison hook owns queueing, cancellation, caching, generation checks, and per-card
  state.
- `ComparisonView` owns responsive summary presentation and the transition back to the full
  dashboard.
- `App` coordinates active and pending places but does not absorb storage, queue, or card
  rendering internals.

Comparison UI and its provider/hook load asynchronously. If required to preserve the initial
bundle ceiling, an existing below-the-fold component may receive a narrowly scoped lazy
boundary; this is a performance adjustment serving the feature, not a broad refactor.

## 6. Accessibility and Focus

- The welcome card uses dialog semantics, has a labelled title and description, moves focus
  to its primary action, contains focus while open, and restores focus to the search area
  after dismissal or successful location acquisition.
- Geolocation loading disables duplicate activation and exposes a polite status update.
- Quick-switch and comparison controls are real buttons with visible focus and at least a
  44 CSS-pixel touch target where practical.
- Enter and Space activate buttons through native behavior. Escape dismisses onboarding and
  does not acquire location.
- Loading uses `aria-busy`; status and error messages use appropriately polite live regions.
- Skeletons are hidden from accessibility APIs and never replace meaningful labels.
- Color is not the only indicator of the active, pending, failed, or stale state.
- Reduced-motion preferences disable ornamental transitions without removing content.
- Phone and touch users receive every action without hover. Tooltips are supplementary.

## 7. Failure, Privacy, and Operational Behavior

Geolocation errors are classified for actionable copy:

- permission denied: explain that access is off and suggest browser settings or manual
  search;
- timeout: offer Retry and manual search;
- position unavailable: retain the current dashboard and offer Retry;
- insecure context or unsupported API: explain that automatic location is unavailable and
  retain search;
- reverse-geocoding failure: use rounded coordinates as a valid display name and continue.

A denied or failed attempt closes and completes first-run onboarding so the app does not
repeatedly interrupt the user. The app then starts the normal Palo Alto live load, presents
the actionable location status outside the dialog, and keeps the toolbar location action
available for a deliberate retry.
The app cannot change browser permission settings and must not imply otherwise.

Comparison failures remain card-local. A provider failure cannot blank successful summaries
or the saved strip. Switching failures retain the prior full dashboard. User-facing messages
contain no request URL, raw provider body, stack trace, or coordinate beyond the rounded
place label already shown to the user.

Privacy documentation must state:

- geolocation is requested only after an explicit user action;
- coordinates are sent to BigDataCloud for optional reverse geocoding and to Open-Meteo for
  weather;
- selecting Radar separately discloses the visible map area under the existing radar policy;
- saved place metadata remains in browser local storage;
- no account, backend, or cross-device synchronization exists.

Rollback is file-level plus removal of the two new local-storage keys. Older builds ignore
the new keys, so no destructive migration or backend rollback is required.

## 8. Validation

### 8.1 Test-first implementation

Each behavior begins with a focused failing test. The test must fail for the intended reason
before production code is added, then pass with the smallest implementation. Refactoring
occurs only while the focused and full relevant suites remain green.

### 8.2 Unit and contract coverage

- Seed the three defaults only for a missing or unusable store.
- Preserve a valid empty list and removable defaults across reloads.
- Validate bounds and strings; reject duplicates; enforce six entries deterministically.
- Recover from malformed JSON and storage read/write exceptions.
- Classify geolocation failure codes without leaking internal detail.
- Parse and validate comparison units, timezone, time axes, day boundaries, rain semantics,
  and exact six-hour/three-day bounds.
- Prove cache freshness, background revalidation, two-request concurrency, abort behavior,
  per-card retry, and late-response suppression.
- Extend live contract probes for the comparison-specific Open-Meteo schema.

### 8.3 Browser coverage

- First visit shows the welcome dialog without requesting geolocation on page load.
- **Not now** and Escape dismiss it, persist the decision, restore focus, and load Palo Alto.
- Granted permission loads the supplied browser coordinates but does not save them.
- Denied, timeout, unavailable, and unsupported cases retain a usable dashboard and expose
  correct recovery guidance.
- Saving, duplicate rejection, removing defaults, the six-item limit, storage persistence,
  and storage failure fallback are exercised.
- Quick switching retains the old dashboard while pending and on failure, then marks the new
  active location only after success.
- Compare shows independent loading, success, cached, stale, failure, and retry states.
- Network assertions prove Compare does not request ensemble, air quality, map, or radar data
  and never runs more than two point-summary requests concurrently.
- Opening a summary exits Compare and loads that location's full dashboard.
- Keyboard-only, touch, iPhone, Pixel, tablet, desktop, and reduced-motion journeys have no
  hover dependency, focus loss, or horizontal page overflow.
- Existing search, units, local clock, drill-down, backdrop, verification, forecast-map, and
  radar journeys remain green.

### 8.4 Release commands and budgets

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

The pre-feature build used the complete 70 kB gzip initial-JavaScript allowance and 87.1 kB
of the 90 kB total allowance. Comparison remains async and the implementation measures both
budgets after every material slice. After measuring the completed feature at 72.0 kB initial
and 95.5 kB total, the owner explicitly approved updated ceilings of 73 kB initial and 96 kB
total on 2026-08-10. Future changes must not raise either ceiling silently.

## 9. Definition of Done

The change is complete only when:

- native location permission follows an understandable user action;
- denial and technical failures preserve a useful, recoverable dashboard;
- physical location is never automatically persisted;
- the three starter places are present for new users and remain removable;
- saved locations persist locally, validate safely, and never exceed six;
- quick switching and comparison meet the approved responsive and accessible behavior;
- comparison work is lazy, bounded, cancellable, and isolated from expensive providers;
- all required unit, contract, browser, build, smoke, dependency, and size checks pass;
- README documentation accurately describes consent, providers, storage, limits, and
  comparison behavior.

No commit, push, pull request, merge, deployment, or provider-account change is included
without separate authorization.
