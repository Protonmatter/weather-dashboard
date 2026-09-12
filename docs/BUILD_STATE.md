# Current build record — September 12, 2026

This is the current implementation and validation reference for the documentation set.
The dated plans/specifications retain their original design intent and test-first recipes;
their current-build notes identify behavior that superseded those proposals. Detailed
issue mappings and historical test results remain in [HANDOFF.md](HANDOFF.md).

## Build identity

| Item | Identity |
| --- | --- |
| Repository / change | [Protonmatter/weather-dashboard PR #10](https://github.com/Protonmatter/weather-dashboard/pull/10) |
| Reviewed main baseline | `9e7ad980210e222ec13da3ec27d2c3d9fcb861e8` |
| Latest application-code commit | `0a8de45c2980f37789357927282be4816b17365e` |
| Separate late-transport coverage commit | `8eb002f373e96a398916d2978185a1decc6a8f8c` |
| Measured-viewport test setup follow-up | `aa1f6513b3fa584f95be08c656efde5252712172` |
| Package version | `0.2.0`; these updates are identified by commit, with no package-version change |
| Documentation / images | This documentation revision; application source, dependencies, and build output are unchanged |
| Built entry | `dist/assets/index-B05xrsZh.js` |
| Entry SHA-256 | `e94654f3299452ea8b14d51484d78c7424a53e13e4f646f8ac34d4a5f6696e08` |
| Lockfile SHA-256 | `3342a7bea472664910b075daded93c0dec3a0d3a5464a5131d77ea401d23da3c` |
| Gzipped JavaScript | Initial 72.9 KiB / 73 KiB ceiling; total 103.5 KiB / 105 KiB ceiling |

The hashes identify the locally validated artifact and dependency lockfile, not a claim
about bytes currently served by a public host. CI builds once and downstream browser,
visual, and deployment jobs consume that run's uploaded `dist` artifact.

## Current behavior

- **Forecast time and missingness:** point and ensemble acquisition share a reference
  instant. Precipitation uses 24 complete future provider-hour intervals with explicit
  endpoint joins, including fractional UTC-hour phases and DST transitions. Missing values
  cannot become dry weather. The offline sample uses the same endpoint identity and remains
  illustrative, without temperature bands or verification records.
- **Verification:** new records use `wx.verification.v2`; existing v1 bytes are preserved.
  Forecast members are sealed before their valid times, references retain response-time
  provenance, and temperature/precipitation fill independently. Fair CRPS, empirical
  decomposition, tied ranks, mixed member counts, and finite-ensemble spread correction
  have separate conventions and regressions. References are elapsed operational model
  values, not independent station observations or a calibration qualification.
- **UI recovery:** query-bound search selection, modal focus containment, storage failure
  notices, missing UV/visibility, chart alignment, and freshness/refresh errors follow the
  actual data and operation state. Loading for map replacement and Retry begins before
  the 400 ms acquisition debounce; terminal failures stop loading and expose recovery.
- **Late transport settlement:** a superseded map request is aborted, older reducer actions
  are fenced by generation, and late success is rejected before cache insertion. Separate
  browser cases cover delayed AbortError during replacement debounce, during replacement
  transport, and after its failure, plus a canceled success followed by revisiting that
  viewport to require fresh acquisition.
- **Rendering:** CSS/SVG provides the weather scene, and Canvas 2D provides bounded map
  wind flow. The retained GPU capability helper has no current application caller. No
  WebGPU renderer, device telemetry, or 50k-particle benchmark is claimed.

## Validation evidence

| Scope | Recorded evidence |
| --- | --- |
| Current unit/component suite | `npm test`: 409 passed; 11 live contracts excluded from the ordinary run |
| Separate map-transport/browser coverage | 20 passed on Windows: four new cases plus the existing debounce/failure journey on Chromium, WebKit, iPhone, and Android; rerun after the measured-viewport setup correction |
| E2E TypeScript | Strict standalone check of `e2e/review-remediation.spec.ts` passed; the application tsconfig excludes E2E files |
| Regression sensitivity | Isolated stale-abort guard mutation: three expected failures. Isolated pre-cache guard mutation: one expected failure. Restored source/build: all four passed |
| Application build checks | Typecheck, build, budget, and Chromium startup smoke passed at `0a8de45`; artifact identity is unchanged by the test/docs follow-ups |
| Earlier full local matrix | 466 functional passes / 8 existing platform skips, and 10 Windows + 10 Linux ARM64 visual passes at `0f9a7c1`; these are historical results, not the new head's CI |
| Live provider contracts | 11 passed separately during the initial remediation; a preceding Photon HTTP 503 is retained in the handoff history |
| Live screenshot session | Desktop overview, GFS pressure map, and phone-width captures used actual provider responses on September 12; [provenance](screenshots/README.md) |
| Hosted checks / review | [PR checks](https://github.com/Protonmatter/weather-dashboard/pull/10/checks) and [review discussion](https://github.com/Protonmatter/weather-dashboard/pull/10) identify the commit to which each result belongs |

The local numerical, browser, and sensitivity commands are recorded in
[HANDOFF.md](HANDOFF.md#separate-late-transport-settlement-coverage). No test exclusions,
visual thresholds, package dependencies, or lockfile entries changed in the documentation
and screenshot refresh. PNG captures are documentation assets, not visual-test baselines.

The [first hosted run of `8eb002f`](https://github.com/Protonmatter/weather-dashboard/actions/runs/34713265070)
failed the four new cases on Linux x64 WebKit while its existing 116 cases passed. Retained
traces showed transport polling beginning before the lazy map had a positive measured
viewport width. `aa1f651` scrolls the mounted viewport and waits for its measured width and
pending state before the existing request-count assertion. No timeout or regression assertion
was relaxed. The 20-case local matrix and strict E2E typecheck passed after this setup change;
the final PR head's hosted run is the authority for Linux WebKit qualification.

## Merge and delivery gates

Before merging the documentation head of PR #10, verify that the head and base are still
the intended commits, automated review has completed, no actionable review threads remain,
and every applicable CI job has completed successfully. Do not bypass failed checks or
infer readiness from the application/test commit's earlier results. Provider-contract and
deployment jobs are intentionally skipped on pull requests by the workflow.

Merging to `main` triggers a separate CI run with live provider contracts and configured
deployment jobs. GitHub Pages deployment and its browser smoke have independent outcomes.
Cloudflare deployment requires its repository credentials; absent credentials cause an
explicit skip. Do not interpret a skipped deployment or a green PR as proof of a live host.
Use the [main workflow runs](https://github.com/Protonmatter/weather-dashboard/actions/workflows/ci.yml)
and their exact commit/artifact records for the final merge and deployment status.

## Remaining limits and rollback

- The dependency gate permits two existing moderate development-only Vitest / mocker
  advisories (`GHSA-82fw-gwwq-j7x9`); it reported no high/critical entries at validation.
  A dependency upgrade remains a separate change. Consult the latest CI audit for drift.
- Existing v1 archive data still occupies browser quota. There is no automatic migration
  or cleanup; rolling code back can reveal old v1 scores without making them comparable
  to the corrected v2 series. Preserve local evidence before clearing site data.
- Controlled cancellation tests establish application state/cache behavior, not every
  real provider's abort timing. Screenshot success is a bounded live observation and does
  not establish continuous availability or physical-device qualification.
- Rolling back this documentation revision changes Markdown and image assets only.
  For application rollback, revert the intended application commit through review and CI;
  retain the archive separation described in [the handoff](HANDOFF.md#storage-and-rollback-limits).
