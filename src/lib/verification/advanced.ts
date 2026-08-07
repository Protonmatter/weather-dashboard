/**
 * Advanced verification statistics. Implements RFC 0001 §3.
 *
 * The metrics in `metrics.ts` establish whether a forecast is calibrated. These establish
 * whether the difference between two forecasts, or between a forecast and calibration, is
 * distinguishable from sampling noise. Hourly forecast errors are strongly autocorrelated,
 * so every inference method here is chosen to remain valid under serial dependence.
 */

import type { EnsemblePair } from "./metrics";
import { crps } from "./metrics";

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

const variance = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
};

/* ------------------------------------------------------------------ spread-skill */

export interface SpreadSkill {
  /** Root mean ensemble variance, finite-size corrected. */
  spread: number;
  /** RMSE of the ensemble mean against the observation. */
  rmse: number;
  /** spread / rmse. 1 is reliable, below 1 is under-dispersed. */
  ratio: number;
  samples: number;
  members: number;
}

/**
 * Spread–skill ratio with the Fortin et al. (2014) finite-size correction.
 *
 * For a reliable ensemble of n members the relationship is not spread = RMSE but
 *
 *     E[spread²] = (n+1)/n · E[error²]
 *
 * because the ensemble mean of a finite sample is itself a noisy estimate of the
 * distribution mean. Comparing raw spread against RMSE therefore makes every finite
 * ensemble look under-dispersed — a 31-member ensemble by about 1.6%, a 5-member one by
 * 10%. The correction is applied to the spread side so a ratio of 1 means reliable.
 */
export function spreadSkillRatio(pairs: readonly EnsemblePair[]): SpreadSkill {
  const usable = pairs.filter((p) => p.members.length > 1);
  if (usable.length === 0) return { spread: 0, rmse: 0, ratio: 0, samples: 0, members: 0 };

  const n = usable[0]!.members.length;
  const correction = (n + 1) / n;

  let varSum = 0;
  let sqErrSum = 0;
  for (const { members, observed } of usable) {
    varSum += variance(members);
    sqErrSum += (mean(members) - observed) ** 2;
  }

  const spread = Math.sqrt(varSum / usable.length / correction);
  const rmse = Math.sqrt(sqErrSum / usable.length);

  return { spread, rmse, ratio: rmse === 0 ? 0 : spread / rmse, samples: usable.length, members: n };
}

/* --------------------------------------------------------- Hersbach CRPS split */

export interface HersbachDecomposition {
  /** Departure of the ensemble's empirical CDF from calibration. Lower is better. */
  reliability: number;
  /** CRPS achievable after perfect recalibration. The irreducible part. */
  potential: number;
  /** Should equal reliability + potential. */
  total: number;
  samples: number;
}

/**
 * Hersbach (2000) decomposition: CRPS = Reli + CRPS_pot.
 *
 * The continuous analogue of Murphy's binary split. `reliability` is what recalibration
 * could remove; `potential` is what remains even with a perfectly calibrated ensemble, and
 * is therefore a measure of the underlying predictability rather than of our processing.
 *
 * Implemented directly from the outcome-frequency form: for each inter-member interval i,
 * accumulate the average width α_i (observation above the interval) and β_i (below), then
 * compare the realised outcome frequency ō_i against the nominal probability i/n.
 */
export function hersbachDecomposition(pairs: readonly EnsemblePair[]): HersbachDecomposition {
  const usable = pairs.filter((p) => p.members.length > 1);
  const N = usable.length;
  if (N === 0) return { reliability: 0, potential: 0, total: 0, samples: 0 };

  const n = usable[0]!.members.length;
  const alpha = new Array<number>(n + 1).fill(0);
  const beta = new Array<number>(n + 1).fill(0);
  let outliersBelow = 0;
  let outliersAbove = 0;

  for (const { members, observed } of usable) {
    if (members.length !== n) continue;
    const x = [...members].sort((a, b) => a - b);

    for (let i = 1; i < n; i++) {
      const lo = x[i - 1]!;
      const hi = x[i]!;
      if (observed > hi) {
        alpha[i]! += hi - lo; // outcome above the interval
      } else if (observed < lo) {
        beta[i]! += hi - lo; // outcome below the interval
      } else {
        alpha[i]! += observed - lo;
        beta[i]! += hi - observed;
      }
    }
    // Outlier intervals: below the lowest member and above the highest.
    if (observed < x[0]!) {
      beta[0]! += x[0]! - observed;
      outliersBelow++;
    }
    if (observed > x[n - 1]!) {
      alpha[n]! += observed - x[n - 1]!;
      outliersAbove++;
    }
  }

  let reliability = 0;
  let potential = 0;

  // Interior intervals. The nominal probability p_i = i/n is the forecast CDF within the
  // interval — a BELOW-probability — so it must be compared against the realised frequency
  // of the outcome falling below, β̄/ḡ. Comparing against the above-frequency inverts the
  // calibration curve and charges a perfectly calibrated ensemble (1−2p)² per interval.
  for (let i = 1; i < n; i++) {
    const width = (alpha[i]! + beta[i]!) / N; // α+β always spans the full interval
    if (width === 0) continue;

    const oBar = beta[i]! / N / width;
    const pNominal = i / n;

    reliability += width * (oBar - pNominal) ** 2;
    potential += width * oBar * (1 - oBar);
  }

  // Outlier intervals (Hersbach 2000 §4b): no member bounds them, so the width is the
  // average excess conditioned on the outlier actually occurring, weighted by how often
  // it does. Nominal probabilities are exact — 0 below the ensemble, 1 above it.
  if (outliersBelow > 0) {
    const o = outliersBelow / N;
    const g = beta[0]! / outliersBelow;
    reliability += g * o * o;
    potential += g * o * (1 - o);
  }
  if (outliersAbove > 0) {
    const o = outliersAbove / N; // frequency of the outcome above every member
    const g = alpha[n]! / outliersAbove;
    reliability += g * o * o;
    potential += g * o * (1 - o);
  }

  return { reliability, potential, total: reliability + potential, samples: N };
}

/* ------------------------------------------------------------------------- PIT */

/**
 * Probability Integral Transform values for an ensemble forecast.
 *
 * Under calibration the PIT is uniform on [0,1]. Generalises the rank histogram to the
 * continuous case and handles the atom at zero that precipitation always has: within a
 * block of tied members the value is placed uniformly rather than at an edge, which is
 * the randomised-PIT treatment for discrete components.
 */
export function pitValues(pairs: readonly EnsemblePair[]): number[] {
  const out: number[] = [];
  for (const { members, observed } of pairs) {
    const n = members.length;
    if (n === 0) continue;
    let below = 0;
    let tied = 0;
    for (const m of members) {
      if (m < observed) below++;
      else if (m === observed) tied++;
    }
    out.push((below + tied / 2) / n);
  }
  return out;
}

export function pitHistogram(values: readonly number[], bins = 10): number[] {
  const hist = new Array<number>(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(v * bins)));
    hist[idx]! += 1;
  }
  return hist;
}

/* ------------------------------------------------------- block bootstrap CIs */

export interface Interval {
  point: number;
  lower: number;
  upper: number;
  /** Block length used, in observations. */
  block: number;
}

/** Deterministic PRNG so intervals are reproducible across runs and in CI. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Moving-block bootstrap confidence interval for the mean of a score series.
 *
 * An i.i.d. bootstrap is invalid here: consecutive hourly scores share a weather regime,
 * so resampling individual observations destroys the dependence that inflates the true
 * variance, producing intervals that are far too narrow. Resampling contiguous blocks of
 * length ≈ N^(1/3) preserves short-range dependence, which is the standard choice for a
 * stationary series of unknown correlation length.
 */
export function blockBootstrapCI(
  series: readonly number[],
  { alpha = 0.05, resamples = 1000, seed = 12345 } = {}
): Interval {
  const N = series.length;
  const point = mean(series);
  if (N < 4) return { point, lower: point, upper: point, block: 0 };

  const block = Math.max(2, Math.min(N, Math.round(Math.cbrt(N))));
  const starts = N - block + 1;
  const blocksNeeded = Math.ceil(N / block);
  const rnd = lcg(seed);
  const means: number[] = [];

  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    let count = 0;
    for (let b = 0; b < blocksNeeded; b++) {
      const start = Math.floor(rnd() * starts);
      for (let k = 0; k < block && count < N; k++, count++) {
        sum += series[start + k] ?? 0;
      }
    }
    means.push(sum / Math.max(1, count));
  }

  means.sort((a, b) => a - b);
  const lo = means[Math.floor((alpha / 2) * resamples)] ?? point;
  const hi = means[Math.min(resamples - 1, Math.floor((1 - alpha / 2) * resamples))] ?? point;
  return { point, lower: lo, upper: hi, block };
}

/* ------------------------------------------------------------ Diebold-Mariano */

export interface DieboldMariano {
  /** Mean score difference: negative favours forecast A. */
  meanDifference: number;
  statistic: number;
  /** Two-sided p-value from the t distribution with N-1 df. */
  pValue: number;
  samples: number;
  /** Newey-West truncation lag. */
  lag: number;
  significant: boolean;
}

/** Newey-West HAC long-run variance with a Bartlett kernel. */
function hacVariance(d: readonly number[], lag: number): number {
  const N = d.length;
  const m = mean(d);
  const gamma = (k: number): number => {
    let s = 0;
    for (let t = k; t < N; t++) s += (d[t]! - m) * (d[t - k]! - m);
    return s / N;
  };

  let v = gamma(0);
  for (let k = 1; k <= lag; k++) {
    v += 2 * (1 - k / (lag + 1)) * gamma(k);
  }
  return v;
}

/** Two-sided t tail, Abramowitz-Stegun 26.7.8 normal approximation with df adjustment. */
function tTailTwoSided(t: number, df: number): number {
  const x = Math.abs(t);
  if (!Number.isFinite(x)) return 0;
  // Normal approximation is adequate at the sample sizes this archive reaches; the
  // Student correction below keeps small-sample p-values from being overstated.
  const z = x * (1 - 1 / (4 * df)) / Math.sqrt(1 + (x * x) / (2 * df));
  const p = 0.5 * (1 + erf(z / Math.SQRT2));
  return 2 * (1 - p);
}

function erf(x: number): number {
  // Abramowitz-Stegun 7.1.26, |error| < 1.5e-7.
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return sign * y;
}

/**
 * Diebold–Mariano test for equal predictive accuracy, with the Harvey–Leybourne–Newbold
 * (1997) small-sample correction.
 *
 * Given per-occasion scores from two forecasts, the loss differential is serially
 * correlated, so the variance of its mean must be estimated with a HAC estimator rather
 * than the sample variance. The truncation lag defaults to the standard h = ⌈N^(1/3)⌉.
 *
 * The HLN correction matters: without it the test over-rejects badly below a few hundred
 * observations, which is exactly the regime a personal forecast archive occupies. Claiming
 * significance there would be the single easiest way for this panel to mislead.
 */
export function dieboldMariano(
  scoresA: readonly number[],
  scoresB: readonly number[],
  { alpha = 0.05, lag }: { alpha?: number; lag?: number } = {}
): DieboldMariano {
  const N = Math.min(scoresA.length, scoresB.length);
  if (N < 8) {
    return { meanDifference: 0, statistic: 0, pValue: 1, samples: N, lag: 0, significant: false };
  }

  const d = Array.from({ length: N }, (_, i) => scoresA[i]! - scoresB[i]!);
  const h = lag ?? Math.max(1, Math.ceil(Math.cbrt(N)));
  const lrv = hacVariance(d, h);
  const dBar = mean(d);

  if (lrv <= 0) {
    // Degenerate: the loss differential has no variance. Either the two forecasts are
    // identical (dBar = 0, nothing to test) or one beats the other by a constant on every
    // occasion, which is deterministic evidence rather than a sampling question. Both are
    // reported explicitly instead of being silently folded into "not significant".
    const deterministic = dBar !== 0;
    return {
      meanDifference: dBar,
      statistic: deterministic ? Number.POSITIVE_INFINITY * Math.sign(dBar) : 0,
      pValue: deterministic ? 0 : 1,
      samples: N,
      lag: h,
      significant: deterministic,
    };
  }

  const dm = dBar / Math.sqrt(lrv / N);
  // Harvey-Leybourne-Newbold small-sample correction.
  const hln = Math.sqrt((N + 1 - 2 * h + (h * (h - 1)) / N) / N);
  const statistic = dm * hln;
  const pValue = tTailTwoSided(statistic, N - 1);

  return {
    meanDifference: dBar,
    statistic,
    pValue,
    samples: N,
    lag: h,
    significant: pValue < alpha,
  };
}

/* --------------------------------------------------------------- discrimination */

export interface RocPoint {
  threshold: number;
  falsePositiveRate: number;
  truePositiveRate: number;
}

/**
 * ROC curve and area for probability forecasts of a binary event.
 *
 * Reliability asks whether the stated probabilities are honest. AUC asks whether the
 * forecast can separate events from non-events at all. The two are independent: a forecast
 * that always emits the climatological base rate is perfectly reliable and has AUC 0.5,
 * i.e. no discrimination whatsoever. Reporting only reliability would rate it highly.
 */
export function rocCurve(pairs: readonly { p: number; occurred: boolean }[]): RocPoint[] {
  const positives = pairs.filter((x) => x.occurred).length;
  const negatives = pairs.length - positives;
  if (positives === 0 || negatives === 0) return [];

  const thresholds = [...new Set(pairs.map((x) => x.p))].sort((a, b) => b - a);
  const points: RocPoint[] = [{ threshold: 1.01, falsePositiveRate: 0, truePositiveRate: 0 }];

  for (const t of thresholds) {
    let tp = 0;
    let fp = 0;
    for (const x of pairs) {
      if (x.p >= t) {
        if (x.occurred) tp++;
        else fp++;
      }
    }
    points.push({ threshold: t, falsePositiveRate: fp / negatives, truePositiveRate: tp / positives });
  }

  points.push({ threshold: -0.01, falsePositiveRate: 1, truePositiveRate: 1 });
  return points;
}

/** Trapezoidal area under the ROC curve. 0.5 is no skill, 1 is perfect discrimination. */
export function areaUnderRoc(points: readonly RocPoint[]): number {
  if (points.length < 2) return 0.5;
  const sorted = [...points].sort((a, b) => a.falsePositiveRate - b.falsePositiveRate);
  let area = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dx = sorted[i]!.falsePositiveRate - sorted[i - 1]!.falsePositiveRate;
    area += dx * ((sorted[i]!.truePositiveRate + sorted[i - 1]!.truePositiveRate) / 2);
  }
  return area;
}

/**
 * Ignorance (logarithmic) score for a probability forecast, in bits.
 *
 * A strictly proper local scoring rule: unlike Brier it depends only on the probability
 * assigned to the outcome that occurred. Probabilities are clipped away from 0 and 1
 * because the log score is unbounded — a single confident miss would otherwise dominate
 * every other forecast in the archive combined.
 */
export function ignoranceScore(
  pairs: readonly { p: number; occurred: boolean }[],
  epsilon = 1e-3
): number {
  if (pairs.length === 0) return 0;
  return mean(
    pairs.map(({ p, occurred }) => {
      const clipped = Math.min(1 - epsilon, Math.max(epsilon, p));
      return -Math.log2(occurred ? clipped : 1 - clipped);
    })
  );
}

/** Per-occasion CRPS series, for bootstrap intervals and DM comparisons. */
export const crpsSeries = (pairs: readonly EnsemblePair[], fair = true): number[] =>
  pairs.map((p) => crps(p.members, p.observed, fair));
