# Weather Dashboard engineering handoff

The 2026-09-12 review remediation starts from `9e7ad980210e222ec13da3ec27d2c3d9fcb861e8`.
This document records behavior and validation entry points, not a hosted deployment or
calibration qualification. The README and RFCs 0001–0003/0005 describe the current contracts.

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
both series; preserve any needed local evidence before such an action.

Rolling application code back leaves v2 data intact. An older version may display its old
v1 scores again; that is not a valid comparison with corrected v2 scores. Do not merge or
rename the keys to simulate continuity. Release status, hosted checks, platform-specific
visual results, and deployment evidence must be recorded separately for the exact artifact.

## Remediation coverage

The working branch is `protonmatter/fix-main-review`, based on GitHub main
`9e7ad980210e222ec13da3ec27d2c3d9fcb861e8`. The original local checkout is preserved.
The implementation and local validation are complete. The user authorized committing,
pushing this branch, and opening a PR against `main`. Git history and the PR record provide
the publication status; merging and deployment are outside this handoff's authorization.

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

## Validation status

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

## Changed-file inventory

The following repository files differ from the reviewed main commit. Generated builds,
browser captures, runtime files and logs are excluded from source control.

- [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- [.gitignore](../.gitignore)
- [docs/HANDOFF.md](../docs/HANDOFF.md)
- [docs/rfcs/0001-verification-and-delivery.md](../docs/rfcs/0001-verification-and-delivery.md)
- [docs/rfcs/0002-temperature-verification.md](../docs/rfcs/0002-temperature-verification.md)
- [docs/rfcs/0003-inspection-and-drill-down.md](../docs/rfcs/0003-inspection-and-drill-down.md)
- [docs/rfcs/0005-local-context-and-radar.md](../docs/rfcs/0005-local-context-and-radar.md)
- [docs/superpowers/plans/2026-09-12-main-review-remediation.md](../docs/superpowers/plans/2026-09-12-main-review-remediation.md)
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
- [src/hooks/useSearch.ts](../src/hooks/useSearch.ts)
- [src/index.css](../src/index.css)
- [src/lib/__tests__/contract.test.ts](../src/lib/__tests__/contract.test.ts)
- [src/lib/__tests__/ensemble.test.ts](../src/lib/__tests__/ensemble.test.ts)
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
