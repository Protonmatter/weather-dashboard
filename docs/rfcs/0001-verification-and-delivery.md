# RFC 0001 — Verification Depth, Delivery Pipeline, and Presentation Targets

| | |
| --- | --- |
| Status | Accepted (partially implemented) |
| Author | ProtonMatter |
| Supersedes | — |
| Implementation | Phase 1 complete; Phases 2–4 tracked below |

## 1. Problem

The dashboard renders probabilistic forecasts and scores its own calibration. Three gaps
block it from being credible as reference-grade work:

1. **Verification is shallow.** Brier, Murphy and CRPS establish calibration but say nothing
   about *significance*. Two forecasts with different scores may not be distinguishably
   different. Hourly forecast errors are strongly autocorrelated, so naive confidence
   intervals are wrong by construction.
2. **The pipeline verifies one dimension.** Unit tests and a typecheck do not catch a
   provider changing its response schema, a transitive dependency introducing a CVE, or a
   deploy that builds cleanly and renders a blank page.
3. **One layout serves every viewport.** A grid tuned for a laptop is neither a good phone
   experience nor a good use of a 16:9 display.

## 2. Non-goals

- Running our own NWP model. Consuming and verifying open ensembles is the scope.
- Server-side infrastructure. Client-only is a deliberate constraint; it bounds cost at zero
  and forces honesty about what can be claimed without a backend.
- Real-time radar or satellite imagery. Both require licensed feeds.

## 3. Verification (Phase 2)

Scores without uncertainty are decoration. The additions below are chosen because each
answers a question the current scorecard cannot.

### 3.1 Spread–skill ratio

For a reliable ensemble the expected squared error of the ensemble mean and the ensemble
variance are related by a finite-size correction:

```
E[spread²] = (n+1)/n · E[error²]
```

Omitting the `(n+1)/n` factor makes every finite ensemble look under-dispersed. Following
Fortin et al. (2014) the corrected ratio is reported; a value below 1 is genuine
under-dispersion, not an artefact of member count.

### 3.2 Hersbach CRPS decomposition

CRPS = reliability + potential CRPS (Hersbach 2000). This separates "the ensemble is
miscalibrated" from "the ensemble is calibrated but the signal is weak" — the continuous
analogue of the Murphy split already implemented for the binary case. The identity is
asserted in tests.

### 3.3 PIT histogram

The Probability Integral Transform generalises the rank histogram to the continuous case.
Under calibration, PIT values are uniform on [0,1]. Reported alongside the rank histogram
because PIT handles ties and mixed discrete-continuous distributions (precipitation has an
atom at zero) more gracefully.

### 3.4 Moving-block bootstrap confidence intervals

An i.i.d. bootstrap on hourly forecast scores is invalid: consecutive hours share weather
regimes. A moving-block bootstrap with block length ≈ n^(1/3) preserves short-range
dependence. Intervals are reported on every headline score.

### 3.5 Diebold–Mariano with HAC variance

To claim one forecast beats another, the difference in scores must be significant against
an autocorrelation-robust variance estimate. Newey–West with Bartlett kernel and a
Diebold–Mariano statistic, plus the Harvey–Leybourne–Newbold small-sample correction, which
matters at the sample sizes a personal archive reaches.

### 3.6 Discrimination: ROC and AUC

Reliability answers "are the probabilities honest". AUC answers "can the forecast separate
events from non-events at all". A forecast can be perfectly reliable and useless; both are
needed.

## 4. Delivery pipeline (Phase 3)

Distinct test classes, distinct failure meanings. A pipeline where everything is "tests" is
a pipeline where nobody knows what a red build implies.

| Class | Answers | Trigger |
| --- | --- | --- |
| **Static** | Does it typecheck and lint? | every push |
| **Unit** | Is the math right? | every push |
| **Contract/validation** | Do provider responses still match our parsers? | every push + nightly |
| **Regression** | Have previously fixed defects stayed fixed? | every push |
| **Functional (E2E)** | Does a real browser complete real user journeys? | every push |
| **Smoke** | Does the built artefact boot and render? | post-build, post-deploy |
| **Dependency** | Any known CVEs or licence drift? | every push + nightly |
| **Budget** | Has the bundle or a Core Web Vital regressed? | every push |

Nightly runs matter for the contract class specifically: provider schemas change on their
schedule, not ours, and we want to learn about it before a user does.

## 5. Presentation targets (Phase 4)

Three targets, one codebase:

| Target | Viewport | Priorities |
| --- | --- | --- |
| Phone | 360–430 CSS px | Thumb reach, single column, no hover dependence, reduced motion honoured |
| Tablet / laptop | 768–1440 | Two-column grid, current layout |
| Desktop 16:9 | ≥1600, 16:9 | Full-bleed presentation, denser panels, richer motion |

Mobile-first, progressively enhanced. Determined by `matchMedia` and container queries
rather than user-agent sniffing.

### 5.1 GPU acceleration — decision

**WebGPU is not adopted at this time.** See ADR 0002. Current visuals are gradients,
sub-100-element SVG, and ~46 CSS-animated elements — all comfortably within compositor
budget. Adopting WebGPU now would add a capability-detection matrix and a fallback path to
accelerate work the GPU already does through CSS compositing.

The threshold that would justify it is specified so the decision is falsifiable: a particle
advection field over the ensemble wind grid, ≥50k particles at 60fps. Below that, WebGL2
suffices; below WebGL2's threshold, CSS suffices. A capability probe ships now so the
decision can be revisited with data rather than re-litigated.

## 6. Phasing

| Phase | Content | Status |
| --- | --- | --- |
| 1 | Modules, TypeScript, abort semantics, base verification | Complete |
| 2 | Advanced verification statistics (§3) | Complete |
| 3 | Full pipeline (§4) | Complete |
| 4 | Responsive targets, capability probe (§5) | Complete |
| 5 | Particle field, conditional on §5.1 threshold | Not started |

## 7. References

- Hersbach (2000), *Decomposition of the CRPS for Ensemble Prediction Systems*, Wea. Forecasting
- Murphy (1973), *A New Vector Partition of the Probability Score*, J. Appl. Meteor.
- Fortin et al. (2014), *Why should ensemble spread match the RMSE?*, J. Hydrometeor.
- Gneiting & Raftery (2007), *Strictly Proper Scoring Rules*, JASA
- Diebold & Mariano (1995), *Comparing Predictive Accuracy*, JBES
- Harvey, Leybourne & Newbold (1997), *Testing the equality of prediction MSEs*, Int. J. Forecasting
- Ferro (2014), *Fair scores for ensemble forecasts*, QJRMS
- Newey & West (1987), *A Simple, Positive Semi-Definite HAC Covariance Matrix*, Econometrica
