# GitHub Main Review Remediation Plan

> For agentic workers: execute each bounded task using the systematic-debugging and test-driven-development workflows. The user authorized implementation, then subsequently authorized committing, pushing this branch and opening a PR against main. Merge and deployment are not authorized.

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
