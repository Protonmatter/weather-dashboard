# GitHub Main Review Remediation Plan

> **Completed implementation record; updated 2026-09-12.** The original tasks and PR
> follow-ups below are implemented. The user authorized implementation, commit, push, and
> [PR 10](https://github.com/Protonmatter/weather-dashboard/pull/10), then authorized merging
> once all checks complete without issues and new review comments are addressed. This plan
> does not itself establish that those gates passed or that the build merged or deployed.
> See [current build state](../../BUILD_STATE.md) for delivery status and the
> [engineering handoff](../../HANDOFF.md) for exact behavior and validation records.

**Goal:** Correct all 19 prioritized findings from the GitHub main review and the concrete adjacent validation/dead-code gaps, preserving dashboard capabilities.
**Architecture:** Keep the existing provider, pure-math, lifecycle and presentation boundaries. Join forecast data by absolute time, represent missingness explicitly, separate caller cancellation from failure, and use a new verification archive without overwriting legacy evidence.
**Tech Stack:** Existing React 18, TypeScript, Vite, Vitest and Playwright dependencies; no added packages.
**Spec:** Parent review-main-9e7ad980.md, reviewed main SHA 9e7ad980210e222ec13da3ec27d2c3d9fcb861e8.
**Worktree:** weather-dashboard-fixes, branch protonmatter/fix-main-review. The original checkout remains unchanged.

## Contracts and constraints

- EnsembleSummary adds optional validTimes: Date[], windowStart: Date, windowEnd: Date. Precipitation values are hour-ending totals for the next complete 24-hour window, beginning at the next complete provider-hour boundary. Display actual bounds instead of claiming a rolling window.
- Precipitation memberSeries and archived tempMemberSeries align to validTimes. tempSpread separately joins the displayed point hourly axis by absolute time.
- Capture one acquisition reference for point/ensemble selection; retain provider valid times. No positional archive substitution.
- Missing precipitation/temperature is not zero. Preserve actual zero. Exclude incomplete member windows and leave missing observations pending.
- Corrected verification reads/writes wx.verification.v2. Preserve wx.verification.v1 unchanged. Do not invent provider model initialization time.
- Keep all existing maps, radar, forecasts, comparison, location/search, statistics and inspection controls. Preserve compatibility helpers and intentional GPU scaffolding.
- Do not add external dependencies, credentials, telemetry, production changes or empirical calibration claims.

## Task 1: Transport and provider integrity

Files: src/lib/http.ts, providers/openMeteo.ts, weather.ts, ensemble.ts, types.ts, fallback.ts and corresponding lib tests.
Owner: data_lifecycle.

- [x] Add red regressions: active caller + exhausted internal timeout; expected postal404s followed by success; null member matrices; cross-hour responses and exact timestamp alignment; elapsed first/omitted last precipitation intervals.
- [x] Run targeted Vitest and record expected failures before implementation.
- [x] Add a distinct timeout failure and exclude expected client errors from breaker accounting.
- [x] Validate member values; use common reference and timestamp joins; retain exact window metadata.
- [x] Run provider/HTTP/ensemble regressions and typecheck.

## Task 2: Verification correctness and archive boundary

Files: src/lib/verification/** and src/components/VerificationPanel.tsx.
Owner: forecast_math.

- [x] Add red regressions: Unix cross-zone observations; null then finite observation; independent temperature backfill; exact eight equally likely +/-1 triples with corrected ratio1; dry tied distributions; fairCRPS0 versus empiricalCRPS1 for [60,64]/62; legacy archive preservation.
- [x] Run targeted tests and record failures.
- [x] Implement v2 archive, finite validation and independently missing variables; use absolute observation timestamps.
- [x] Correct per-member-count spread adjustment and tied histogram mass; label ordinary decomposition separately from fair CRPS.
- [x] Re-run all verification tests and rendered panel checks.

## Task 3: UI semantics and recovery

Files: App.tsx, components except VerificationPanel, hooks/useSearch.ts, presentation helpers, units.ts, index.css, vite.config.ts, new component tests and e2e/review-remediation.spec.ts.
Owner: ui_review.

- [x] Add red component/browser checks for UV3 protection, aligned band/cell centers, stale Enter selection, failed storage status, failed refresh status, modal busy focus and chronological narrative.
- [x] Include .test.tsx in normal collection; demonstrate the regressions fail on the old behavior.
- [x] Correct messages, query/result identity, combobox navigation, modal focus, common chart geometry and percentile claims.
- [x] Consume explicit precipitation valid times/bounds in labels, details and archive writes.
- [x] Add bounded point freshness/resume handling without replacing midnight logic.
- [x] Connect tested trend/glass helpers where useful; remove only confirmed unused constants/tokens; preserve other capabilities.
- [x] Re-run targeted browser/component checks.

## Task 4: Validation and delivery gates

Files: scripts/deps-check.mjs, scripts/smoke.mjs, scripts/__tests__/*, package.json, .github/workflows/ci.yml, existing e2e fixtures/assertions.
Owner: root.

- [x] Reproduce dependency gate success on unavailable/malformed audit and missing license evidence using offline fake command output.
- [x] Fail incomplete audits and license inventory checks explicitly; inspect actual installed package paths/versions without shell-built package names.
- [x] Replace bundle-string mounting claims with an actual bounded Chromium mount check. Keep external providers out of the startup smoke.
- [x] Make functional E2E consume the same built dist artifact as visual/deploy jobs.
- [x] Update existing fixtures to match absolute timestamps/v2 provenance and intentional interval/copy behavior.
- [x] Keep all original tests; resolve new failures by root cause rather than weakened assertions.

## Task 5: Documentation, integration and independent review

Files: README.md, relevant verification RFCs, docs/HANDOFF.md, this plan.
Owner: root.

- [x] Document corrected time/interval semantics, v2 storage, statistical conventions, fallback limitations, freshness and validation commands.
- [x] Run npm run typecheck, npm test, tooling tests, npm run contract, npm run build, npm run size, npm run smoke and npm run deps.
- [x] Run all four functional browser projects and the visual project. Review any intentional visual changes before updating baselines; do not weaken tolerances.
- [x] Independently review final diff, test edges and authority boundaries; resolve actionable feedback.
- [x] Record exact changed files and validation results; present the uncommitted changes for user review before the subsequently authorized commit, push and PR.

## Completed PR review follow-ups

- [x] Align offline synthetic precipitation inputs with the explicit future window by
  absolute timestamp. Keep the two additional dry sample hours needed by partial-hour starts
  and retain the `live: false` provenance. Delivered in `521ffd9`.
- [x] Dispatch replacement-map pending state when work is queued, retaining the 400 ms
  acquisition debounce. Preserve usable old data, clear obsolete errors when a new request
  starts, and stop announcing loading when the replacement fails. Delivered in `0a8de45`.
- [x] Add separate late transport settlement coverage in `8eb002f`: an older `AbortError`
  during replacement debounce, an older `AbortError` during replacement transport, and an
  older `AbortError` after a newer failure. Verify loading or Retry survives as appropriate
  and that Retry recovers. Separately verify canceled success cannot replace the new grid
  or populate an obsolete cache entry; revisiting its viewport must acquire a fresh grid.
- [x] Run the four new browser scenarios plus the existing debounce/failure regression
  across Chromium, WebKit, iPhone, and Android: **20 passed**. The unit run produced
  **409 passed / 11 live contracts skipped**; a separate strict TypeScript check of the
  E2E spec passed because the application typecheck does not include that directory.
- [x] Verify sensitivity in isolated, ignored source copies: bypassing the stale-abort
  reducer guard caused the three abort cases to fail at their loading/Retry assertions;
  removing the pre-cache success guard caused the canceled-success revisit to fail.
  Restoring both guards and rebuilding produced **4/4 control passes**. No application
  source or tested build artifact changed in the coverage-only `8eb002f` update.

These are local validation records for the cited revisions. Controlled transport settlement
exercises the application's HTTP/provider/hook/reducer/UI chain; it does not establish live
provider cancellation behavior. Hosted checks and review resolution must be read for the
exact head being merged, rather than inferred from these point-in-time results.

## Documentation and hosted test setup follow-up

- [x] Reconcile every existing Markdown file with the current implementation, retaining
  dated design intent and older evidence. Add a central build record and three live browser
  captures with provenance to the README.
- [x] Diagnose the first Linux WebKit run of `8eb002f`: all four new cases polled transport
  before the lazy map had a measured viewport. In `aa1f651`, wait for the mounted viewport,
  positive measured width, and loading state before the unchanged request-count assertion.
  Rerun the 20-case Windows matrix and strict E2E typecheck; both passed. No timeout,
  cancellation assertion, cache check, or application code changed.

## Verification reconciliation progress follow-up

- [x] Correct repeated selection of the first five pending locations so missing or failed
  references cannot prevent later locations from being reconciled. In `eb1ae83`, retain the
  five-location limit per pass, sort locations deterministically, and advance a wrapping
  cursor before provider I/O. Keep pending forecast evidence intact, including records
  beyond fourteen elapsed days when the provider can still return a valid local-calendar
  reference.
- [x] Store scheduling progress separately in `wx.verification.cursor.v1`; keep session
  progress when persistence fails and resume from the persisted value after reload. An
  already-aborted caller does not consume a batch. Clearing the current archive also resets
  the cursor while preserving the legacy v1 archive.
- [x] Add nine regressions covering unfillable and old backlogs, module reload, storage
  failure, bounded wraparound, failed locations, pre-aborted callers, archive clearing, and
  returned older local-calendar references. The local unit run for this change produced
  **418 passed / 11 live contracts skipped**. Earlier 409-test results above remain records
  of their respective revisions; they are not the current suite total.

Final review, hosted-check, merge, and deployment outcomes belong to the exact PR/main
commit records linked from the build state; the completed local tasks do not substitute
for those gates.
