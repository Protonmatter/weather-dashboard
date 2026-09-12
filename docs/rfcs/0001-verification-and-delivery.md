# RFC 0001 — Verification Depth, Delivery Pipeline, and Presentation Targets

| | |
| --- | --- |
| Status | Accepted; scoring and delivery contracts corrected 2026-09-12 |
| Author | ProtonMatter |
| Supersedes | — |
| Implementation | Phases 1–4 implemented; library utilities and displayed metrics distinguished below |

**Current build:** [Build state and evidence](../BUILD_STATE.md) tracks the PR 10
application corrections and the separate late-transport regression coverage added in
`8eb002f`. This RFC describes implementation contracts; it does not certify a deployment.

## 1. Problem

The dashboard renders probabilistic forecasts and accumulates local verification
diagnostics. This RFC originally addressed three gaps:

1. **Verification needs context.** Brier, Murphy and CRPS summarize forecast/reference
   pairs but do not establish calibration or significance by themselves. Different scores
   may reflect sampling variability. Hourly dependence affects confidence intervals.
2. **The pipeline verifies one dimension.** Unit tests and a typecheck do not catch a
   provider changing its response schema, a transitive dependency introducing a CVE, or a
   deploy that builds cleanly and renders a blank page.
3. **One layout serves every viewport.** A grid tuned for a laptop is neither a good phone
   experience nor a good use of a 16:9 display.

## 2. Non-goals

- Running our own NWP model. Consuming and verifying open ensembles is the scope.
- Server-side infrastructure. Client-only is a deliberate constraint; it bounds cost at zero
  and forces honesty about what can be claimed without a backend.
- Radar and satellite imagery were outside this RFC; later radar work is specified in
  RFCs 0005–0006 and does not change the verification reference source.

## 3. Verification (Phase 2)

Scores without uncertainty are decoration. The additions below are chosen because each
answers a question the current scorecard cannot.

### 3.1 Spread–skill ratio

For conditionally independent, identically distributed members and a reference drawn from
the same population, sample member variance `s²` (denominator `n−1`) and ensemble-mean
squared error satisfy:

```
E[error²] = (n+1)/n · E[s²]
ratio = sqrt(mean((n_i+1)/n_i × s_i²)) / sqrt(mean(error_i²))
```

The multiplier corrects spread before comparing it with RMSE; applying it to the denominator
would reverse the correction. It is calculated per record because retained member counts
can differ. The ratio is undefined when RMSE is zero and is displayed as an em dash.
One is the reference under these assumptions, not proof of calibration. A regression
enumerates all eight combinations of two members and a reference drawn from `{−1,+1}`;
the exact population ratio is one.

### 3.2 Hersbach CRPS decomposition

Ordinary empirical CRPS = reliability + potential CRPS (Hersbach 2000). The temperature
panel reports this score separately from fair CRPS: the member-pair denominators are `n²`
and `n(n−1)`, respectively. For `[60,64]` and reference `62`, empirical CRPS is one and
fair CRPS is zero. The Hersbach components sum to one, not zero. Member-count groups are
decomposed separately, then combined with sample-count weights so every eligible pair
contributes. These are sample diagnostics; the potential component is not an independently
measured irreducible weather uncertainty.

### 3.3 PIT histogram

The displayed temperature diagnostic is a finite-ensemble **rank PIT**, with a flat
expectation under exchangeability. For `n` members and untied reference rank `r`, integrate
uniform mass over `[r/(n+1), (r+1)/(n+1)]` into the display bins. If `k` members tie the
reference and `b` lie below it, integrate over `[b/(n+1), (b+k+1)/(n+1)]`. This computes
the exact fractional expectation of random rank/tie breaking without Monte Carlo jitter.
It handles all-dry precipitation and differing member counts without a spurious edge spike.

Precipitation retains raw `n+1` ranks when counts agree; ties divide their mass across
`k+1` ranks. Mixed-count precipitation uses the same normalized rank PIT as temperature.
The empirical-CDF `pitValues` library utility is separate: finite empirical CDF steps do
not share this rank PIT's exact uniform finite-ensemble reference.

### 3.4 Moving-block bootstrap confidence intervals

A moving-block bootstrap with block length approximately `n^(1/3)` retains some short-range
dependence. The displayed interval is on temperature fair CRPS, using records ordered by
valid time. This heuristic does not fully model irregular visits, multiple locations,
reference error, or model-member dependence. The 100-sample provisional label is a display
threshold, not a significance test or a calibration qualification.

### 3.5 Diebold–Mariano with HAC variance

To claim one forecast beats another, the difference in scores must be significant against
an autocorrelation-robust variance estimate. Newey–West with Bartlett kernel and a
Diebold–Mariano statistic, plus the Harvey–Leybourne–Newbold small-sample correction, which
matters at the sample sizes a personal archive reaches.

This is a library utility. The current application does not archive a second model or
display a significance comparison; the existence of this implementation establishes no
empirical superiority claim.

### 3.6 Discrimination: ROC and AUC

Reliability answers "are the probabilities honest". AUC answers "can the forecast separate
events from non-events at all". A forecast can be perfectly reliable and useless; both are
needed.

ROC/AUC and the clipped ignorance score remain library utilities, not additional visible
panels or independently validated skill results.

## 4. Delivery pipeline (Phase 3)

Distinct test classes, distinct failure meanings. A pipeline where everything is "tests" is
a pipeline where nobody knows what a red build implies.

| Class | Answers | Trigger |
| --- | --- | --- |
| **Static** | Does it typecheck? | PRs, main pushes, nightly, manual runs |
| **Unit** | Is the math right? | PRs, main pushes, nightly, manual runs |
| **Contract/validation** | Do provider responses still match our parsers? | main + nightly |
| **Regression** | Have previously fixed defects stayed fixed? | PRs, main pushes, nightly, manual runs |
| **Tooling regression** | Do smoke and dependency gates reject invalid results? | PRs, main pushes, nightly, manual runs |
| **Functional (E2E)** | Does a real browser complete real user journeys? | PRs, main pushes, nightly, manual runs |
| **Smoke** | Does the built artefact boot and render? | post-build, post-deploy |
| **Dependency** | Any high/critical CVEs or licence drift? | PRs, main pushes, nightly, manual runs |
| **Budget** | Does compressed JavaScript stay within the size ceilings? | PRs, main pushes, nightly, manual runs |

Nightly runs matter for the contract class specifically: provider schemas change on their
schedule, not ours, and we want to learn about it before a user does.

The smoke gate runs Chromium and checks the production application's mount and runtime/module
errors. Dependency audit or licence evidence that cannot be obtained or parsed fails the
gate. CI's E2E job serves the exact uploaded `dist` artifact from the build job rather than
rebuilding it. `npm run test:tooling` exercises these tooling failure paths. The review fixes
retain the 73 KiB initial-JavaScript ceiling and revise the total ceiling from 99 to 105 KiB
to accommodate correctness and failure-state handling without adding a dependency.

The map regressions also exercise transport responses that settle after cancellation,
separately from canceling a queued debounce timer. They preserve a newer request's loading
and Retry state and reject obsolete successful responses before cache insertion. See
[RFC 0004](0004-interactive-forecast-map.md#8-release-gates) for the contract and
[build state](../BUILD_STATE.md) for the validation associated with a particular revision.

## 5. Presentation targets (Phase 4)

Three targets, one codebase:

| Target | Viewport | Priorities |
| --- | --- | --- |
| Phone | ≤767 CSS px | Thumb reach, single column, no hover dependence, reduced motion honoured |
| Tablet / laptop | All remaining viewports | Two-column grid |
| Cinema | ≥1600 CSS px and aspect ratio ≥16:10 | Full-bleed presentation and denser panels |

Mobile-first, progressively enhanced. `src/hooks/useViewport.ts` uses `matchMedia`, and
the CSS uses matching media queries; neither relies on user-agent sniffing.

### 5.1 GPU acceleration — decision

**WebGPU is not adopted at this time.** See [ADR 0002](../adr/0002-no-webgpu-yet.md).
Current visuals use CSS/SVG with at most 96 scene particles, plus Canvas 2D map fields and
72/120/180 wind particles for phone/tablet/cinema. No current cross-device frame-time
benchmark establishes a need for another rendering pipeline.

The original investigation threshold remains a particle advection field at ≥50k particles
and 60fps. This is a candidate workload for profiling, not a measured crossover point.
`src/lib/gpu/capability.ts` provides an unused capability helper; the application does not
invoke it or collect GPU telemetry.

## 6. Phasing

| Phase | Content | Status |
| --- | --- | --- |
| 1 | Modules, TypeScript, abort semantics, base verification | Complete |
| 2 | Advanced verification statistics (§3) | Complete |
| 3 | Full pipeline (§4) | Complete |
| 4 | Responsive targets, capability probe (§5) | Complete |
| 5 | Large GPU particle field, conditional on §5.1 measurement | Not started; the bounded Canvas 2D map wind field is implemented separately in RFC 0004 |

## 7. References

- Hersbach (2000), *Decomposition of the CRPS for Ensemble Prediction Systems*, Wea. Forecasting
- Murphy (1973), *A New Vector Partition of the Probability Score*, J. Appl. Meteor.
- Fortin et al. (2014), *Why should ensemble spread match the RMSE?*, J. Hydrometeor.
- Gneiting & Raftery (2007), *Strictly Proper Scoring Rules*, JASA
- Diebold & Mariano (1995), *Comparing Predictive Accuracy*, JBES
- Harvey, Leybourne & Newbold (1997), *Testing the equality of prediction MSEs*, Int. J. Forecasting
- Ferro (2014), *Fair scores for ensemble forecasts*, QJRMS
- Newey & West (1987), *A Simple, Positive Semi-Definite HAC Covariance Matrix*, Econometrica
