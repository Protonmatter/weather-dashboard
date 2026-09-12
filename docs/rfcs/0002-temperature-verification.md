# RFC 0002 — Temperature Verification Track

| | |
| --- | --- |
| Status | Accepted; archive and scoring contracts corrected 2026-09-12 |
| Author | ProtonMatter |
| Supersedes | — |
| Depends on | RFC 0001 §3 (advanced verification statistics) |

**Current build:** [Build state and evidence](../BUILD_STATE.md) identifies the PR 10
application corrections and subsequent regression coverage. `eb1ae83` adds persisted,
bounded reconciliation rotation; its cursor is separate from the sealed v2 evidence.
The earlier `8eb002f` late map transport tests do not change scoring conventions.

## 1. Problem

The original scorecard archived only precipitation. This RFC adds an independent
temperature track using the live members already fetched for the hourly uncertainty band.
The 2026-09-12 review corrections make the archive's time/provenance boundary explicit and
separate fair CRPS from the empirical CRPS decomposed by Hersbach. Both tracks compare
sealed forecasts with elapsed model-reference values; neither establishes agreement with
independent station observations or empirical calibration of a forecast product.

## 2. Non-goals

- A second observation source. Temperature references come from the same Open-Meteo
  forecast endpoint with `past_days` as precipitation. These are elapsed operational model
  values, not thermometer readings or independent reanalysis verification.
- Comparing against a rival forecast. Diebold–Mariano needs two forecasts of the same
  quantity; we hold one. Deferred until a second model is consumed.
- Per-lead-time breakdown and °C display of scores (CRPS converts by ×5/9 — a difference
  measure has no offset). Both are follow-ups, not scope.
- Any relaxation of the client-only constraint (RFC 0001 §2). The archive remains
  localStorage, per device, per browser.

## 3. Design

### 3.1 Archive schema: a corrected v2 sample series

`ForecastRecord` includes optional `tMembers?: number[]` (°F, rounded to 0.1) and
`tObserved?: number`. Both variables share `wx.verification.v2`, its 4,000-record limit,
and 30-day retention. Runtime checks reject invalid coordinates, instants, probabilities,
member numbers, and reference values while retaining valid neighboring records.

The earlier `wx.verification.v1` is never read, rewritten, or deleted by this version,
including when the v2 archive is cleared. Earlier timestamp and missing-value handling
could contaminate those records, so v2 begins a new scoring series instead of migrating or
silently reinterpreting them. This supersedes the original extend-in-place v1 decision.

`issued` records this device's retrieval/sealing time, not model initialization. The v2
writer also stores `source: "open-meteo-gfs025"` and `intervalStart`, with `valid` as the
hour-ending precipitation endpoint and temperature's matching instant. Reconciliation
retains `referenceSource: "open-meteo-forecast-past"`, `observedFetchedAt`, and/or
`tObservedFetchedAt` from the original network response, separately for each variable.

Rounding bounds each member's temperature quantization error to 0.05 °F; it is not
mathematically invisible to scores. Retained v1 bytes also count against browser quota,
so the v2 record limit is not a guaranteed storage-size bound. At quota or when storage is
disabled, new verification data may not persist while forecasts remain usable.

`wx.verification.cursor.v1` holds one last-scheduled location key. It is request-scheduling
metadata, separate from `ForecastRecord` and its immutable member/provenance fields.
Successful writes retain progress across reloads; write failure keeps progress in the
current session only. `clearArchive()` resets the in-session cursor and independently
attempts to remove both the v2 archive and persisted cursor. It never removes legacy v1.

### 3.2 Dedup: skip, not backfill

Records are sealed when displayed. If a valid hour is already archived without temperature,
later-arriving temperature members are
**not** spliced in — a later fetch is a shorter-lead forecast, and mixing lead times
inside one record would quietly bias the scores it feeds. The two tracks therefore report
their own sample counts.

Reference backfill is different: missing precipitation and temperature remain independently
pending, and either may fill on a later request. A null, omitted, or nonfinite value is
not zero; a finite zero is valid. An already filled value is never overwritten. A location
with only temperature references outstanding remains eligible for reconciliation without
requiring new precipitation forecasts. Values retrieved at or before their valid time stay
ineligible even if the response is served from cache after that time.

Each reconciliation pass sorts the pending location keys and selects at most five distinct
locations, beginning after the last scheduled key and wrapping at the end. The cursor
advances before I/O, so missing, failed, or out-of-window references cannot repeatedly
exclude later pending locations. An already-aborted caller does not advance it. The cap is
per pass, and separate tabs can overlap work; the cursor is not a cross-tab lock.

Reference acquisition continues to request `past_days=14`. It does not apply an exact
fourteen-elapsed-day cutoff to archived records or returned references: a provider-local
calendar window can include an eligible returned instant older than that duration. The
actual response timestamps and retrieval provenance remain authoritative. A scheduling
advance or nonzero reconciliation result does not prove archive persistence when storage
writes fail.

### 3.3 The unit trap

`fetchEnsemble` requests Fahrenheit explicitly. The observation endpoint does not inherit
that: adding `temperature_2m` to the `past_days` query without also sending
`temperature_unit=fahrenheit` returns Celsius, and every CRPS downstream is
plausibly-sized and wrong. Guarded three ways: a unit test asserts the request URL, the
contract suite asserts the `hourly_units.temperature_2m` echo from the live endpoint, and
this section exists.

The request also specifies `timeformat=unixtime`. Returned numeric seconds become absolute
millisecond instants directly, with no timezone offset applied a second time. Timestamp
format drift is rejected instead of guessing at timezone-free strings. Archived temperature
uses the ensemble's explicit precipitation endpoint axis; the displayed temperature band
separately matches the point strip's instantaneous axis, including `:30` and `:15` UTC phases.

### 3.4 Scores

`Scorecard` gains `temp: TempScorecard | null` — null meaning "no temperature-verified
records", distinct from a zero-sample precipitation state. The metric set is minimal;
each answers a question the others cannot:

| Metric | Question | Source |
| --- | --- | --- |
| Fair CRPS (°F) + block-bootstrap CI | How accurate, and is the number stable? | `meanCrps`, `crpsSeries` → `blockBootstrapCI` |
| Empirical CRPS + Hersbach reliability / potential | How do the two components reconstruct the empirical score? | `meanCrps(pairs, false)`, `hersbachDecomposition` |
| Spread–skill ratio (Fortin-corrected) | How does corrected spread compare with mean-forecast RMSE? | `spreadSkillRatio` |
| Rank PIT histogram | Where do references rank among finite members? | `ensemblePitHistogram` |

The 10-bin rank PIT integrates fractional rank mass and ties and supports varying member
counts. Its flat reference assumes exchangeability. Spread is corrected per record using
`(n+1)/n` times sample member variance before averaging; zero RMSE makes the ratio undefined.
Hersbach operates on empirical CRPS, separately within member-count groups before weighted
aggregation. For `[60,64]` with reference `62`, fair CRPS is zero but empirical CRPS and the
sum of Hersbach components are one.

Score series are sorted by valid time before bootstrapping. The heuristic block length does
not fully account for irregular visits, multiple locations, or reference/model dependence.
Neither a small interval nor the 100-sample display threshold proves calibration.

The synthetic fallback contributes nothing here by construction: it generates no
temperature members, `recordForecast` refuses non-live input, and scoring filters on
member presence. A fabricated band is never scored because it is never made.

### 3.5 Presentation

One card, two sections. The verification panel gains PRECIPITATION and TEMPERATURE
section labels; temperature renders whenever `temp` is non-null, even when precipitation
has zero scored records. Content: fair CRPS and its interval, corrected spread/skill (an em
dash when undefined), samples, rank PIT, and separately labelled empirical CRPS with its
Hersbach components. The provisional threshold (100 samples) is shared with precipitation;
the panel states that the corrected series starts with new forecasts and legacy data is
retained separately.

## 4. Follow-ups

- Diebold–Mariano against a second model, once one is consumed (§2).
- Per-lead-time CRPS breakdown, once records span multiple issue cadences.
- Independent observation evidence and location-aware validation before calibration claims.
- A resampling design that explicitly handles multiple locations and irregular visits.
- °C display of temperature scores, threading the unit toggle into the panel.
- Visible persistence status and a bounded quota recovery policy that preserves legacy data.

## 5. References

- Hersbach (2000), *Decomposition of the CRPS for Ensemble Prediction Systems*, Wea. Forecasting
- Fortin et al. (2014), *Why should ensemble spread match the RMSE?*, J. Hydrometeor.
- Ferro (2014), *Fair scores for ensemble forecasts*, QJRMS
- Gneiting & Raftery (2007), *Strictly Proper Scoring Rules*, JASA
