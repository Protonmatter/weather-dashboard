# RFC 0002 — Temperature Verification Track

| | |
| --- | --- |
| Status | Accepted |
| Author | ProtonMatter |
| Supersedes | — |
| Depends on | RFC 0001 §3 (advanced verification statistics) |

## 1. Problem

The scorecard verifies one variable. Precipitation forecasts are archived, reconciled
against reanalysis, and scored with Brier, Murphy, CRPS and a rank histogram — but
temperature, the most-looked-at number in the app and now the subject of its own
uncertainty band on the hourly strip, is never checked against what actually happened.

The gap is not machinery. RFC 0001 §3 delivered Hersbach decomposition, spread–skill,
PIT histograms and block-bootstrap intervals, all implemented and tested — and all, today,
consumed by nothing in the application. §3.2 and §3.3 were written for a continuous
variable; precipitation, with its atom at zero, exercises them least. Meanwhile the
temperature ensemble members are fetched on every load and discarded one line before
they would become useful: `ensembleFor` collapses them to display quantiles and drops
the raw matrix.

This RFC scores the temperature ensemble with the statistics already built for it.

## 2. Non-goals

- A second observation source. Temperature observations come from the same Open-Meteo
  `past_days` reanalysis the precipitation track uses, with the same caveat: analysis,
  not a thermometer reading.
- Comparing against a rival forecast. Diebold–Mariano needs two forecasts of the same
  quantity; we hold one. Deferred until a second model is consumed.
- Per-lead-time breakdown and °C display of scores (CRPS converts by ×5/9 — a difference
  measure has no offset). Both are follow-ups, not scope.
- Any relaxation of the client-only constraint (RFC 0001 §2). The archive remains
  localStorage, per device, per browser.

## 3. Design

### 3.1 Archive schema: extend in place

`ForecastRecord` gains two optional fields — `tMembers?: number[]` (member temperatures,
°F, rounded to 0.1) and `tObserved?: number`. Same key, `wx.verification.v1`, no
migration: the change is purely additive, so old records parse as valid new records and
new records parse under old code. A versioned key would purchase a migration function and
a dual-key window to gain nothing; a parallel temperature store would split the record
cap, duplicate the module, and force a second observation fetch when one call returns
both variables.

Rounding to 0.1 °F bounds the cost: two orders of magnitude below GFS ensemble spread,
invisible to CRPS, and it keeps the worst case (~4000 records × ~700 B) under 3 MB
against a typical 5 MB quota. `safeWrite` already degrades gracefully at quota:
verification stops accumulating, the forecast is unaffected.

### 3.2 Dedup: skip, not backfill

Records are sealed at issue. If a valid hour is already archived (recorded before this
feature, or when the model omitted temperature), later-arriving temperature members are
**not** spliced in — a later fetch is a shorter-lead forecast, and mixing lead times
inside one record would quietly bias the scores it feeds. The cost is that temperature
sample counts lag precipitation for up to a day per location after upgrade. Sample counts
are displayed per variable, so the lag explains itself.

### 3.3 The unit trap

`fetchEnsemble` requests Fahrenheit explicitly. The observation endpoint does not inherit
that: adding `temperature_2m` to the `past_days` query without also sending
`temperature_unit=fahrenheit` returns Celsius, and every CRPS downstream is
plausibly-sized and wrong. Guarded three ways: a unit test asserts the request URL, the
contract suite asserts the `hourly_units.temperature_2m` echo from the live endpoint, and
this section exists.

### 3.4 Scores

`Scorecard` gains `temp: TempScorecard | null` — null meaning "no temperature-verified
records", distinct from a zero-sample precipitation state. The metric set is minimal;
each answers a question the others cannot:

| Metric | Question | Source |
| --- | --- | --- |
| Fair CRPS (°F) + block-bootstrap CI | How accurate, and is the number stable? | `meanCrps`, `crpsSeries` → `blockBootstrapCI` |
| Hersbach reliability / potential | Miscalibrated, or calibrated but hard? | `hersbachDecomposition` |
| Spread–skill ratio (Fortin-corrected) | Is the spread honest? | `spreadSkillRatio` |
| PIT histogram | What shape is the calibration failure? | `pitValues` → `pitHistogram` |

PIT is preferred over a second rank histogram: the variable is continuous and a 10-bin
PIT renders identically regardless of member count. Score series are sorted by valid time
before bootstrapping — the moving-block bootstrap assumes serial order.

The synthetic fallback contributes nothing here by construction: it generates no
temperature members, `recordForecast` refuses non-live input, and scoring filters on
member presence. A fabricated band is never scored because it is never made.

### 3.5 Presentation

One card, two sections. The verification panel gains PRECIPITATION and TEMPERATURE
section labels; the temperature block renders only when `temp` is non-null, so the
fallback path and empty archives see the panel exactly as before. Content: a stat row
(CRPS with its interval, spread/skill, samples), the PIT histogram sharing the bar
chart already drawn for ranks, and the Hersbach pair in the existing definition-list
style. The provisional threshold (100 samples) is shared with the precipitation track.

## 4. Follow-ups

- Diebold–Mariano against a second model, once one is consumed (§2).
- Per-lead-time CRPS breakdown, once records span multiple issue cadences.
- °C display of temperature scores, threading the unit toggle into the panel.
- Drop-oldest-and-retry on quota exhaustion, if the 3 MB estimate proves optimistic.

## 5. References

- Hersbach (2000), *Decomposition of the CRPS for Ensemble Prediction Systems*, Wea. Forecasting
- Fortin et al. (2014), *Why should ensemble spread match the RMSE?*, J. Hydrometeor.
- Ferro (2014), *Fair scores for ensemble forecasts*, QJRMS
- Gneiting & Raftery (2007), *Strictly Proper Scoring Rules*, JASA
