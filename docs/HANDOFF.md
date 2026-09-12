# Weather Dashboard engineering handoff

The 2026-09-12 review remediation starts from `9e7ad980210e222ec13da3ec27d2c3d9fcb861e8`.
This document records behavior, validation entry points, and the dated remediation history.
[BUILD_STATE.md](BUILD_STATE.md) identifies the current application artifact and evidence;
the README and RFCs describe the current contracts and distinguish historical proposals.
Neither local screenshots nor historical test results establish hosted deployment or calibration.

## Data and time invariants

- Open-Meteo hourly and verification timestamps are numeric Unix seconds parsed as absolute
  instants. Civil labels use the provider IANA timezone without changing those instants.
- Point and ensemble selection share one request reference. Precipitation covers 24 complete
  provider-hour intervals starting at the next source-axis boundary. Native fractional UTC
  phases are preserved; do not round Kolkata `:30` or Chatham `:15` to whole UTC hours.
- `EnsembleSummary.validTimes` contains precipitation endpoints. The archive uses that axis,
  with matching temperature rows. The hourly temperature band instead follows the point
  strip's instantaneous axis. Do not replace either mapping with positional array slices.
- Missing required precipitation data cannot become zero. A live ensemble requires at least
  three complete finite member rows; optional temperature may be unavailable independently.
  Missing optional point UV/visibility also stays unavailable, with no derived advice.
- The deterministic fallback is illustrative. Its amount scale is heuristic; it supplies no
  temperature band and is excluded from verification. Caller cancellation propagates,
  including cache hits; an internal provider timeout may trigger an availability fallback.
- Rain today uses the current local calendar day at response time, including requests that
  cross midnight. Its liquid-rain/shower model estimates are distinct from the ensemble's
  future total-precipitation window and from a physical rain gauge.

## Archive and scoring invariants

- New scoring uses only `wx.verification.v2`. Existing `wx.verification.v1` bytes remain
  untouched and are not migrated, scored, or removed by the v2 clear action.
- `issued` is retrieval/sealing time, not model initialization. New records carry the GFS
  source, hour interval, reference source, and per-variable original response retrieval time.
- A reference hour must precede both the current time and its response retrieval time.
  Reusing a cached full-day response cannot promote a former forecast into a reference.
- Precipitation and temperature references fill independently; null/nonfinite values remain
  pending, finite zero is valid, and previously filled values are never overwritten.
  Sealed forecast members are never backfilled from a later forecast.
- Reconciliation rotates through a sorted pending-location list, attempting at most five
  distinct locations per pass. `wx.verification.cursor.v1` stores the last scheduled
  location separately from sealed evidence; successful writes resume progress after reload,
  and failed writes still advance the current session. An already-aborted call does not
  claim a batch. The cap is per pass, and the cursor is not a cross-tab lock.
- Reference requests retain `past_days=14`. Eligibility follows the actual returned
  timestamps and original retrieval time, without an exact fourteen-elapsed-day cutoff
  that could discard part of a provider-local calendar window.
- Fair CRPS and empirical CRPS are separate. Hersbach sums to empirical CRPS, combining
  member-count groups by sample weight. `[60,64]` with reference `62` gives fair zero and
  empirical one. Spread/skill uses per-record `(n+1)/n` times sample member variance and is
  undefined at zero RMSE. Ties distribute rank mass fractionally; mixed counts use rank PIT.
- These are local diagnostics against elapsed Open-Meteo operational model values, not an
  independent observation study. A 100-sample UI threshold does not establish calibration.

## Validation entry points

Run from the repository root using the existing npm lockfile and supported Node runtime:

```bash
npm ci
npm run typecheck
npm test
npm run test:tooling
npm run build
npm run size
npm run smoke
npm run e2e
npm run deps
npm run contract
```

The focused numerical/archive suite is `npm test -- src/lib/verification`. Provider-window,
missingness, midnight, and cancellation cases are in `provider-lifecycle.test.ts` and the
existing Open-Meteo/ensemble suites. Browser journeys use deterministic provider fixtures;
live contracts require the public providers to be available. Smoke launches Chromium, so
its Playwright browser must be installed. CI E2E must consume the build job's exact `dist`
artifact. Dependency audit or licence evidence failures must fail the gate.

## Storage and rollback limits

v2 retains at most 4,000 records from the last 30 days. v1 still consumes browser storage,
and quota denial can prevent new scores from persisting without stopping forecast display.
There is no automatic legacy cleanup or quota recovery. Browser site-data removal clears
both series and `wx.verification.cursor.v1`; preserve needed local evidence first. The
verification clear action resets the in-session cursor and independently attempts to remove
v2 and its persisted cursor, leaving legacy v1 untouched. Unavailable storage can prevent
either persisted removal or new reference/cursor writes. In-session scheduling progress
does not guarantee that newly filled archive values were saved.

Rolling application code back leaves v2 data intact. An older version may display its old
v1 scores again; that is not a valid comparison with corrected v2 scores. Do not merge or
rename the keys to simulate continuity. Release status, hosted checks, platform-specific
visual results, and deployment evidence must be recorded separately for the exact artifact.
Reverting only the bounded scheduling fix `eb1ae83` leaves v2 evidence compatible; the
preceding implementation ignores the separate cursor key and resumes its old batch selection.

## Remediation coverage

The working branch is `protonmatter/fix-main-review`, based on GitHub main
`9e7ad980210e222ec13da3ec27d2c3d9fcb861e8`. The original local checkout is preserved.
The implementation and local validation are complete. [PR #10](https://github.com/Protonmatter/weather-dashboard/pull/10)
contains the commits and review responses. The current instruction permits merging after
the final commit's checks and review complete without blocking issues. Recheck the exact head,
base, unresolved threads, and all applicable CI jobs before merging; do not infer readiness
from an earlier commit's green run. A merge triggers the configured main-branch delivery
workflow, whose deployment and post-deploy smoke results remain separate evidence.

| Review issue | Implemented change | Regression evidence |
| --- | --- | --- |
| F01 Internal timeout treated as cancellation | Caller abort and provider timeout are distinct; active requests settle with usable failure state. | `provider-lifecycle.test.ts`, `http.test.ts` |
| F02 Observation timezone shift | Unix timestamps retain absolute verification instants across viewer timezones. | `verification/__tests__/verify.test.ts` |
| F03 Missing members/references became zero | Complete finite member sets; missing precipitation/temperature stays pending independently. | Provider, ensemble, store and verification tests |
| F04 Unsafe moderate-UV advice | UV 3–5 recommends protection; missing UV has no invented risk level. | `ReviewRemediation.test.ts` |
| F05 Point/ensemble axes could shift | Shared acquisition reference and explicit timestamp joins for separate display/archive axes. | `provider-lifecycle.test.ts` |
| F06 Wrong precipitation window | Complete future provider-hour intervals, exact bounds and hour-ending labels, including fractional zones. | Provider, ensemble, component and browser regressions |
| F07 Wrong finite-ensemble spread correction | Per-record unbiased variance multiplied by `(n+1)/n`; zero-error ratio unavailable. | Exact eight-case exchangeable population in `advanced.test.ts` |
| F08 Tied ranks implied false dispersion | Fractional admissible rank mass and normalized rank PIT for differing member counts. | `advanced.test.ts`, `metrics.test.ts`, `verify.test.ts` |
| F09 Incompatible CRPS quantities displayed together | Fair score and empirical Hersbach decomposition are separately labeled. | `[60,64]` / `62` numerical regression |
| F10 Temperature-only backlog was ignored | Independent pending-variable reconciliation and visible temperature track. | `verify.test.ts`, temperature browser journey |
| F11 Hourly band/cells were misaligned | One shared width based on hourly cell geometry. | `review-remediation.spec.ts` |
| F12 Enter could select stale search results | Query-bound results, active combobox selection and arrow-key handling. | `review-remediation.spec.ts` |
| F13 Failed local save claimed persistence | Preserve and display the storage warning. | `review-remediation.spec.ts` |
| F14 Informational notice hid forecast failure | Separate status and alert regions; retained-data freshness is visible. | Browser failure and storage journeys |
| F15 Postal 404s disabled healthy provider | Expected client responses do not trip the provider breaker. | `provider-lifecycle.test.ts` |
| F16 TSX tests were not collected | Normal Vitest glob includes `.test.ts` and `.test.tsx`. | Full unit/component suite |
| F17 Percentiles were described as all/none | Captions use actual member exceedance; central ranges are labeled accurately. | `ReviewRemediation.test.ts` |
| F18 Forecast narrative ignored chronology | Narrative follows ordered hourly conditions and removes unsupported causal claims. | Hero/component regressions |
| F19 Busy modal leaked keyboard focus | Inert background, dialog focus and bounded Tab/Shift-Tab handling. | `review-remediation.spec.ts` |

Independent cross-review also reproduced and corrected midnight-response rain totals,
already-aborted cache hits, cached future values becoming references, missing optional
UV/visibility, mixed-member histogram sample loss, and a perpetual map-loading indicator
after a failed replacement. The established GPU/NOAA compatibility surfaces are retained.
Confirmed unused constants/tokens were removed; tested trend/glass helpers now serve the UI.

The delivery gates now fail incomplete audit/licence evidence, launch a real Chromium
startup smoke, verify relative deployment subpaths, and test the same built artifact in
E2E, visual and deployment jobs. No package dependency or lockfile changes were made.

## Initial remediation validation (0f9a7c1)

All final local checks below passed on the completed source and built artifact. Windows
used Node 24.18.0 and npm 11.16.0. Linux checks used WSL Ubuntu ARM64, Node 20.20.2,
and Chromium 151.0.7922.34; this is separate from hosted Linux x64 CI evidence.

| Command / check | Final result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 403 passed; 11 live contract tests skipped in the ordinary offline run |
| `npm run contract` | All 11 live provider contracts passed separately |
| `npm run test:tooling` | All 11 passed on Windows and all 11 passed on Linux Node 20 |
| `npm run build` | Passed |
| `npm run size` | Gzipped JavaScript: initial 72.9 KiB / 73 KiB; total 103.5 KiB / 105 KiB |
| `npm run smoke` | Real Chromium startup/mount passed on Windows and Linux against the same final artifact |
| `npm run deps` | Passed configured gate: 0 critical, 0 high, 2 moderate; 177 installed package paths passed licence checks |
| `npx playwright test --project=chromium --project=webkit --project=iphone --project=android --workers=3` | 466 passed, 8 existing platform skips, no failures; 20.8 minutes |
| `npx playwright test --project=visual --workers=1` | Windows: 10 passed; Linux ARM64: 10 passed; unchanged tolerances |
| Original-main Linux visual control | All 10 passed against original baselines in the same Linux environment before accepting new measurements |
| CI workflow static validation | YAML parsed; all 11 job dependency references resolved; artifact consumption checked |
| `git -c core.safecrlf=false diff --check` | Passed |

The eight browser skips are the two existing hover-style checks on WebKit, iPhone and
Android, plus forced-colors emulation on WebKit and iPhone. Existing iPhone project
selection also excludes two desktop-resize cases. New regression journeys passed on all
four projects. Per-project totals are Chromium 119/0, WebKit 116/3, iPhone 114/3 and Android
117/2 (passed/skipped). Visual baselines were updated only after inspection of intended layout and
copy changes; the hash distance, height drift, and dimension checks were not relaxed.

The first live contract attempt encountered a Photon HTTP 503; a later complete final run
passed all 11. Fixture-driven browser results do not establish continuous provider uptime.
Original-main and final Linux artifacts were copied byte-for-byte from their Windows builds,
not rebuilt for the Linux checks. The final entry is `dist/assets/index-Cp5_q5il.js`, SHA-256
`904be54db34ce1d378ec0310784c25ff8373c765f58c96b5626cd1bc03a621bf`.

Hosted GitHub Actions, Linux x64 CI, production deployment, and an independent station
observation/calibration study were not run. The existing two moderate development-only
Vitest / `@vitest/mocker` audit entries remain (`GHSA-82fw-gwwq-j7x9`); remediation requires
a separately scoped dependency upgrade. The lockfile is unchanged. The initial bundle
ceiling remains 73 KiB; the total ceiling changed from 99 to 105 KiB to accommodate the
verified correctness and recovery work, with verification orchestration loaded lazily.

Logs and captures are retained under the ignored `output/` directory. The independent
Linux evidence is in the parent workspace's `output/linux-visual-review/evidence.json`.
Temporary validation preview servers have been stopped. Linux runtime libraries and fonts
were extracted into a task-local directory without apt installation or global configuration
changes. These runtime artifacts are not repository changes.

## PR 10 review follow-up: offline precipitation alignment (521ffd9)

The review identified that the cold/offline sample labeled complete future intervals but
synthesized probabilities from the start of the current-hour template. Exact-hour startup
was one source row behind; partial-hour startup was two rows behind, and the final required
source endpoints were absent. The sample now has two explicit dry terminal hours and joins
each precipitation endpoint to its source timestamp before generating synthetic members.
Missing/nonfinite matches produce an unavailable spread, never a fabricated zero. The first
24 displayed hourly rows are preserved, and sample output remains excluded from verification.

Six regressions failed before implementation and pass after it. They cover exact and partial
hours, the spring DST gap, both fall-fold occurrences, complete endpoint coverage, dry tails,
and all quantiles/totals against an independently specified probability vector.

Follow-up validation: 409 unit/component tests passed (11 live contracts remain separately
selected), the focused provider/component/fallback group passed 41 tests, and all 12 existing
sample/fallback browser journeys passed across Chromium, WebKit, iPhone and Android.
Typecheck, build, real Chromium startup smoke, and diff checks passed. Gzipped JavaScript is
72.9 KiB initial and 103.6 KiB total, within the unchanged 73/105 KiB limits. The new entry is
`dist/assets/index-Xm8ugzzL.js`, SHA-256
`5b32b2a4a96a23f8240518e491c89c6e08bd8b45221140acc03b9ee7fe1203ad`.
The previous full browser/visual/live-contract results above belong to the initial remediation;
they were not rerun in full for this sample-only correction. Hosted checks are attached to
the current PR commit. Independent review found no additional issue in the two-file code/test
diff. That commit changed 60 repository files relative to the reviewed main commit.

## PR 10 review follow-up: pending replacement map feedback (0a8de45)

The review identified that a new viewport hid the mismatched old grid immediately, while
`useForecastMap` waited until the 400 ms debounce elapsed to report loading. The hook now
dispatches `start` as soon as acquisition is scheduled. Only cache lookup/network acquisition
is debounced. Repeated panning therefore retains pending feedback, and Retry clears the old
error immediately. Existing success, failure and reset transitions remain unchanged, so
terminal error/stale states do not restore the perpetual-loading defect.

The strengthened replacement-grid browser regression failed on the old build because the
loading indicator was absent before acquisition. It now checks immediate feedback, a second
pan after 200 ms, no request until 400 ms after that second pan, terminal failure, and Retry's
own 399+1 ms debounce before successful completion. This exercises superseded queued timers;
it does not introduce a separate late in-flight transport-abort regression.

Independent review found no additional issue in the hook/test diff. All 12 targeted browser
journeys passed across Chromium, WebKit, iPhone and Android: replacement/retry debounce,
stationary-grid expiry, and retained current-viewport data after a failed refresh. The full
unit/component suite passed 409 tests (11 separately selected live contracts skipped), and
typecheck, build, startup smoke, bundle budgets and diff checks passed. Gzipped JavaScript is
72.9 KiB initial and 103.5 KiB total, within the unchanged 73/105 KiB limits. The `0a8de45` entry
is `dist/assets/index-B05xrsZh.js`, SHA-256
`e94654f3299452ea8b14d51484d78c7424a53e13e4f646f8ac34d4a5f6696e08`.
The full hosted functional/visual suite passed on the preceding commit `521ffd9`; its results
are separate from the targeted local validation of this change and the new commit's CI.
At `0a8de45`, the PR changed 61 repository files relative to the reviewed main commit.

## Separate late transport settlement coverage

Four additional browser cases control the map fetch promise after its real linked signal
has been aborted. Production HTTP, provider parsing, map hook, reducer and UI code remain
unchanged. A response-body completion marker and a browser MessageChannel task drain the
promise chain before assertions, without advancing the paused acquisition clock.

The cases verify that a late AbortError cannot clear a replacement's debounce/loading state,
cannot stop a newer in-flight request, and cannot clear a newer failure or its Retry control.
A fourth case releases a successful response despite cancellation, checks that the current
grid still displays its own distinct pressure data, then returns to the canceled viewport
and requires a fresh request. This also detects canceled responses entering the hook cache,
even if the reducer independently rejects their obsolete success action.

All 20 targeted browser cases passed across Chromium, WebKit, iPhone and Android (16 new
case/platform combinations and four existing debounce/failure journeys). The full unit suite
passed 409 tests with 11 separately selected live contracts skipped. The E2E file passed a
separate strict TypeScript check because application typecheck does not include `e2e/`.
At that coverage-only stage, application source and the `0a8de45` build artifact above
were hash-verified unchanged.

Independent sensitivity checks used an ignored archive of that commit. Bypassing only
the reducer's stale-abort guard made all three abort cases fail at their intended loading
or Retry assertions. Removing the hook's pre-cache success guard made the fourth case fail
because revisiting the canceled viewport incorrectly reused its cache entry. Restoring both
files and rebuilding made all four cases pass. No mutation touched the working application
or its build output; evidence and logs are in `output/late-transport-sensitivity/`.

Commands for this coverage update:

```sh
npx playwright test e2e/review-remediation.spec.ts --grep 'late transport abort|late canceled success|a failed replacement map grid' --project=chromium --project=webkit --project=iphone --project=android --workers=2
npm test
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --strict --skipLibCheck --types node e2e/review-remediation.spec.ts
git -c core.safecrlf=false diff --check
```

These are deterministic browser integration checks with controlled transport responses.
They do not exercise live provider cancellation behavior. The complete functional and
visual matrix was not rerun locally for this test/documentation-only update; new hosted
results are attached to its PR commit separately.

## Documentation, screenshots, and hosted setup follow-up

The documentation refresh reconciles all 18 existing Markdown files and adds
[BUILD_STATE.md](BUILD_STATE.md) plus [screenshot provenance](screenshots/README.md).
The README embeds three actual production-build browser captures: a live Palo Alto desktop
overview, the GFS pressure map, and the responsive phone view. All image hashes and local
links were checked; historical plans and test records remain explicitly dated.

The hosted `8eb002f` run exposed a Linux WebKit setup race in the four new transport cases:
the lazy map's viewport remained unmeasured while the helper polled for a request. Traces
retained the zero-width state or showed measurement arriving too late for its 400 ms debounce.
Commit `aa1f651` waits for the actual viewport, positive measured width, and loading state
before the original request-count check. Existing cancellation, cache, request timing, and
Retry assertions are unchanged; no timeout was increased. The 20-case Windows browser matrix
and strict E2E typecheck passed afterward. The hosted run of `6c129c5` subsequently passed
all applicable PR checks, including WebKit and iPhone. That setup/documentation stage kept
the `0a8de45` application source, lockfile, and original screenshot artifact unchanged;
the following reconciliation fix introduces a new application artifact.

## PR 10 review follow-up: fair bounded reconciliation (eb1ae83)

Two duplicate P2 review comments identified that taking the first five pending locations
on every pass could indefinitely exclude a sixth location. The first five can remain
pending because their references are missing, their provider requests fail, or their
records are outside the returned history window. The fix sorts pending location keys and
selects up to five distinct locations after the last scheduled key, wrapping at the end.
It advances the cursor before awaiting I/O, so another pass in the same session moves on
even when earlier requests are still pending. This does not provide cross-tab locking or
a global five-request cap across overlapping passes.

Scheduling metadata is one location key under `wx.verification.cursor.v1`; it does not
modify sealed forecast members, valid times, reference provenance, or scoring conventions.
Successful storage writes retain the cursor across reloads. If writes fail, the next pass
still advances in the current session. Clearing the archive resets that session cursor and
tries to remove both the v2 archive and persisted cursor independently. Legacy v1 stays
untouched. Pre-aborted calls return before claiming a batch.

The provider request remains `past_days=14`, and no exact elapsed-day age filter was added.
A returned reference older than fourteen elapsed days can still be eligible within the
provider's local-calendar response, subject to the existing valid-time and retrieval-time
checks. Rotation prevents older or otherwise unfillable records from monopolizing the
first batch without deleting those records or fabricating references.

Nine regressions were added. Eight failed against the preceding implementation; all 34
tests in `verify.test.ts` passed after the fix. Cases cover fresh and 20-day unfillable
backlogs, failed requests, persisted reload progress, write failure, wraparound with no more
than five distinct locations per pass, pre-aborted calls, cursor clearing, and an eligible
returned reference older than fourteen elapsed days. Independent review ran all 60
verification tests successfully. The full unit/component suite passed 418 tests with
11 separately selected live contracts skipped; typecheck, build, bundle budgets, and real
Chromium startup smoke also passed.

The `eb1ae83` entry is `dist/assets/index-Ds4kO-jC.js`, SHA-256
`49ec86d56bcbecadf80c113c08559ef01989c2f3084f93af22f5c48c1fb46b6c`.
Gzipped JavaScript is 72.9 KiB initial and 103.7 KiB total, within unchanged 73/105 KiB
ceilings. The dependency lockfile is unchanged. The three README screenshots were refreshed
against this artifact; [capture provenance](screenshots/README.md) retains the initial
provider failure and the successful UI refresh rather than implying uninterrupted availability.

Reproduce the focused checks with `npm test -- src/lib/verification/__tests__/verify.test.ts`
and `npm test -- src/lib/verification`; use the validation entry points above for the full
suite and build gates. The preceding green hosted run does not validate this source change.
The final PR commit requires its own completed hosted checks and review before merge;
deployment remains a separate main-branch outcome.

## Final WebKit bootstrap follow-up

The `81c23b4` hosted run completed successfully and automated review found no new issues.
The complete log nevertheless reported one flaky WebKit result in the existing
`review: a failed replacement map grid stops announcing loading` case. It timed out at
the initial pressure-image visibility assertion, before clock pausing or the actual
pan/debounce/failure/Retry checks. The four separate late-transport cases passed.

This older case still scrolled only the lazy map shell. It now scrolls the mounted viewport
and waits for a positive `data-viewport-width` before the original image assertion, matching
the readiness condition introduced for the separate transport tests. The successful hosted
job did not upload failure artifacts, so its exact layout timing is not independently
proven; the failure is consistent with the earlier traced lazy-layout race. No timeout,
skip, cancellation assertion, debounce boundary, or Retry check changed.

All 20 targeted browser cases passed locally across Chromium, WebKit, iPhone and Android
afterward, and the standalone strict E2E TypeScript check passed. Application source,
dependencies, and the screenshot build remain unchanged. The final head must finish CI
and automated review without this retry before merge.

## Changed-file inventory

The current PR revision changes 77 repository paths relative to reviewed main
`9e7ad980210e222ec13da3ec27d2c3d9fcb861e8`. The three intentional README PNG captures
and their provenance are tracked documentation assets. Generated builds, test captures,
runtime files, CLI snapshots, and validation logs remain excluded from source control.

- [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- [.gitignore](../.gitignore)
- [docs/adr/0002-no-webgpu-yet.md](adr/0002-no-webgpu-yet.md)
- [docs/BUILD_STATE.md](BUILD_STATE.md)
- [docs/design/liquid-glass.md](design/liquid-glass.md)
- [docs/HANDOFF.md](HANDOFF.md)
- [docs/rfcs/0001-verification-and-delivery.md](rfcs/0001-verification-and-delivery.md)
- [docs/rfcs/0002-temperature-verification.md](rfcs/0002-temperature-verification.md)
- [docs/rfcs/0003-inspection-and-drill-down.md](rfcs/0003-inspection-and-drill-down.md)
- [docs/rfcs/0004-interactive-forecast-map.md](rfcs/0004-interactive-forecast-map.md)
- [docs/rfcs/0005-local-context-and-radar.md](rfcs/0005-local-context-and-radar.md)
- [docs/rfcs/0006-unified-precipitation-timeline.md](rfcs/0006-unified-precipitation-timeline.md)
- [docs/screenshots/dashboard-desktop.png](screenshots/dashboard-desktop.png)
- [docs/screenshots/dashboard-mobile.png](screenshots/dashboard-mobile.png)
- [docs/screenshots/forecast-map.png](screenshots/forecast-map.png)
- [docs/screenshots/README.md](screenshots/README.md)
- [docs/superpowers/plans/2026-08-09-weather-context-radar.md](superpowers/plans/2026-08-09-weather-context-radar.md)
- [docs/superpowers/plans/2026-08-10-location-onboarding-saved-comparison.md](superpowers/plans/2026-08-10-location-onboarding-saved-comparison.md)
- [docs/superpowers/plans/2026-08-12-liquid-glass-frontend.md](superpowers/plans/2026-08-12-liquid-glass-frontend.md)
- [docs/superpowers/plans/2026-08-13-unified-precipitation-timeline.md](superpowers/plans/2026-08-13-unified-precipitation-timeline.md)
- [docs/superpowers/plans/2026-09-12-main-review-remediation.md](superpowers/plans/2026-09-12-main-review-remediation.md)
- [docs/superpowers/specs/2026-08-09-weather-context-radar-design.md](superpowers/specs/2026-08-09-weather-context-radar-design.md)
- [docs/superpowers/specs/2026-08-10-location-onboarding-saved-comparison-design.md](superpowers/specs/2026-08-10-location-onboarding-saved-comparison-design.md)
- [docs/superpowers/specs/2026-08-13-unified-precipitation-timeline-design.md](superpowers/specs/2026-08-13-unified-precipitation-timeline-design.md)
- [e2e/full-dashboard-liquid-glass.visual.spec.ts](../e2e/full-dashboard-liquid-glass.visual.spec.ts)
- [e2e/journeys.spec.ts](../e2e/journeys.spec.ts)
- [e2e/liquid-glass.visual.spec.ts](../e2e/liquid-glass.visual.spec.ts)
- [e2e/location-management.spec.ts](../e2e/location-management.spec.ts)
- [e2e/review-remediation.spec.ts](../e2e/review-remediation.spec.ts)
- [package.json](../package.json)
- [README.md](../README.md)
- [scripts/__tests__/deps-check.test.mjs](../scripts/__tests__/deps-check.test.mjs)
- [scripts/__tests__/smoke.test.mjs](../scripts/__tests__/smoke.test.mjs)
- [scripts/deps-check.mjs](../scripts/deps-check.mjs)
- [scripts/size-budget.mjs](../scripts/size-budget.mjs)
- [scripts/smoke.mjs](../scripts/smoke.mjs)
- [src/App.tsx](../src/App.tsx)
- [src/components/__tests__/ReviewRemediation.test.ts](../src/components/__tests__/ReviewRemediation.test.ts)
- [src/components/Card.tsx](../src/components/Card.tsx)
- [src/components/ForecastMap.tsx](../src/components/ForecastMap.tsx)
- [src/components/ForecastOverview.tsx](../src/components/ForecastOverview.tsx)
- [src/components/Hero.tsx](../src/components/Hero.tsx)
- [src/components/LocationOnboarding.tsx](../src/components/LocationOnboarding.tsx)
- [src/components/OverviewCards.tsx](../src/components/OverviewCards.tsx)
- [src/components/Panels.tsx](../src/components/Panels.tsx)
- [src/components/PrecipitationCard.tsx](../src/components/PrecipitationCard.tsx)
- [src/components/SavedLocationsBar.tsx](../src/components/SavedLocationsBar.tsx)
- [src/components/SearchBar.tsx](../src/components/SearchBar.tsx)
- [src/components/VerificationPanel.tsx](../src/components/VerificationPanel.tsx)
- [src/components/VerificationSession.ts](../src/components/VerificationSession.ts)
- [src/components/WeatherFreshness.tsx](../src/components/WeatherFreshness.tsx)
- [src/components/WeatherMetrics.tsx](../src/components/WeatherMetrics.tsx)
- [src/hooks/useForecastMap.ts](../src/hooks/useForecastMap.ts)
- [src/hooks/useSearch.ts](../src/hooks/useSearch.ts)
- [src/index.css](../src/index.css)
- [src/lib/__tests__/contract.test.ts](../src/lib/__tests__/contract.test.ts)
- [src/lib/__tests__/ensemble.test.ts](../src/lib/__tests__/ensemble.test.ts)
- [src/lib/__tests__/fallback.test.ts](../src/lib/__tests__/fallback.test.ts)
- [src/lib/__tests__/openMeteo.test.ts](../src/lib/__tests__/openMeteo.test.ts)
- [src/lib/__tests__/provider-lifecycle.test.ts](../src/lib/__tests__/provider-lifecycle.test.ts)
- [src/lib/ensemble.ts](../src/lib/ensemble.ts)
- [src/lib/fallback.ts](../src/lib/fallback.ts)
- [src/lib/http.ts](../src/lib/http.ts)
- [src/lib/presentation/precipitation.ts](../src/lib/presentation/precipitation.ts)
- [src/lib/providers/openMeteo.ts](../src/lib/providers/openMeteo.ts)
- [src/lib/types.ts](../src/lib/types.ts)
- [src/lib/units.ts](../src/lib/units.ts)
- [src/lib/verification/__tests__/advanced.test.ts](../src/lib/verification/__tests__/advanced.test.ts)
- [src/lib/verification/__tests__/metrics.test.ts](../src/lib/verification/__tests__/metrics.test.ts)
- [src/lib/verification/__tests__/store.test.ts](../src/lib/verification/__tests__/store.test.ts)
- [src/lib/verification/__tests__/verify.test.ts](../src/lib/verification/__tests__/verify.test.ts)
- [src/lib/verification/advanced.ts](../src/lib/verification/advanced.ts)
- [src/lib/verification/metrics.ts](../src/lib/verification/metrics.ts)
- [src/lib/verification/store.ts](../src/lib/verification/store.ts)
- [src/lib/verification/verify.ts](../src/lib/verification/verify.ts)
- [src/lib/weather.ts](../src/lib/weather.ts)
- [vite.config.ts](../vite.config.ts)
