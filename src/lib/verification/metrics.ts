/**
 * Forecast verification metrics.
 *
 * A probabilistic forecast cannot be judged right or wrong on a single occasion — only
 * a collection of forecasts can be judged calibrated or miscalibrated. Everything here
 * operates on pairs of (forecast, observation) accumulated over time.
 *
 * Three questions, three tools:
 *   · Is the stated probability honest?      -> Brier score + reliability diagram
 *   · Is the whole distribution honest?      -> CRPS
 *   · Is the ensemble spread right?          -> rank histogram
 *
 * All functions are pure and total: degenerate inputs return a defined result with an
 * explicit sample count rather than NaN, because a verification panel that renders NaN
 * is worse than one that says "not enough data".
 */

export interface BinaryPair {
  /** Forecast probability of the event, 0-1. */
  p: number;
  /** Whether the event actually occurred. */
  occurred: boolean;
}

export interface EnsemblePair {
  /** Member values for one forecast occasion. */
  members: readonly number[];
  /** The verifying observation. */
  observed: number;
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Brier score: mean squared error of probability forecasts. Lower is better,
 * 0 is perfect, 0.25 is what you get by always saying 50%.
 */
export function brierScore(pairs: readonly BinaryPair[]): number {
  if (pairs.length === 0) return 0;
  return mean(pairs.map(({ p, occurred }) => (p - (occurred ? 1 : 0)) ** 2));
}

/**
 * Brier skill score against the sample base rate (climatology).
 *
 * Positive means the forecast beats "always predict the long-run frequency".
 * Negative means it would have been better to ignore the forecast entirely — which is
 * the honest thing to surface when it happens.
 *
 * Returns null when the base rate is degenerate (the event always or never occurred),
 * because the reference score is zero and the ratio is undefined.
 */
export function brierSkillScore(pairs: readonly BinaryPair[]): number | null {
  if (pairs.length === 0) return null;
  const baseRate = mean(pairs.map((x) => (x.occurred ? 1 : 0)));
  const reference = baseRate * (1 - baseRate);
  if (reference === 0) return null;
  return 1 - brierScore(pairs) / reference;
}

export interface ReliabilityBin {
  lower: number;
  upper: number;
  /** Mean forecast probability within the bin. */
  meanForecast: number;
  /** Observed relative frequency within the bin. */
  observedFrequency: number;
  count: number;
}

/**
 * Reliability diagram bins. On a well-calibrated forecast, observedFrequency tracks
 * meanForecast along the diagonal: of all the times you said 30%, it happened 30% of
 * the time.
 *
 * Empty bins are returned with count 0 rather than dropped, so the caller can render
 * the gap honestly instead of implying coverage it doesn't have.
 */
export function reliabilityBins(pairs: readonly BinaryPair[], binCount = 10): ReliabilityBin[] {
  const buckets: BinaryPair[][] = Array.from({ length: binCount }, () => []);

  for (const pair of pairs) {
    const p = Math.min(1, Math.max(0, pair.p));
    // The top bin is closed at 1 so p === 1 lands in the last bucket, not out of range.
    const idx = Math.min(binCount - 1, Math.floor(p * binCount));
    buckets[idx]!.push(pair);
  }

  return buckets.map((bucket, i) => ({
    lower: i / binCount,
    upper: (i + 1) / binCount,
    meanForecast: bucket.length ? mean(bucket.map((b) => b.p)) : (i + 0.5) / binCount,
    observedFrequency: bucket.length ? mean(bucket.map((b) => (b.occurred ? 1 : 0))) : 0,
    count: bucket.length,
  }));
}

export interface MurphyDecomposition {
  /** Squared distance from the diagonal on a reliability diagram. Lower is better. */
  reliability: number;
  /** How far bin outcomes spread from the base rate. Higher is better. */
  resolution: number;
  /** Inherent difficulty of the event. Not a property of the forecast. */
  uncertainty: number;
  brier: number;
  /**
   * Within-bin variance/covariance term.
   *
   * The textbook identity BS = REL - RES + UNC is exact only when forecasts take
   * discrete values and each bin groups identical probabilities. Binning a continuous
   * forecast leaves a residual: representing a bin by its mean discards the spread of
   * probabilities inside it, and that spread covaries with the outcomes.
   *
   * Reported rather than absorbed, because a decomposition that silently fails to sum
   * to the score it decomposes is not a decomposition. A large residual means the bins
   * are too coarse for the forecast's resolution.
   */
  residual: number;
  samples: number;
}

/**
 * Murphy's three-component decomposition: BS = reliability - resolution + uncertainty.
 *
 * This separates "your probabilities are dishonest" (reliability) from "your forecast
 * is honest but uninformative" (resolution). A forecast that always predicts the
 * climatological base rate has perfect reliability and zero resolution — calibrated
 * and useless. Reporting only a Brier score hides that distinction.
 *
 * Binning a continuous forecast leaves a residual term — see `residual` below. The
 * decomposition is reported so that reliability - resolution + uncertainty + residual
 * reconstructs the Brier score exactly.
 */
export function murphyDecomposition(
  pairs: readonly BinaryPair[],
  binCount = 10
): MurphyDecomposition {
  const n = pairs.length;
  if (n === 0) {
    return { reliability: 0, resolution: 0, uncertainty: 0, brier: 0, residual: 0, samples: 0 };
  }

  const baseRate = mean(pairs.map((x) => (x.occurred ? 1 : 0)));
  const bins = reliabilityBins(pairs, binCount).filter((b) => b.count > 0);

  let reliability = 0;
  let resolution = 0;
  for (const b of bins) {
    reliability += (b.count / n) * (b.meanForecast - b.observedFrequency) ** 2;
    resolution += (b.count / n) * (b.observedFrequency - baseRate) ** 2;
  }

  const uncertainty = baseRate * (1 - baseRate);
  const brier = brierScore(pairs);

  return {
    reliability,
    resolution,
    uncertainty,
    brier,
    residual: brier - (reliability - resolution + uncertainty),
    samples: n,
  };
}

/**
 * Continuous Ranked Probability Score, empirical ensemble estimator.
 *
 *   CRPS = E|X - y| - ½ E|X - X'|
 *
 * The first term rewards members close to the observation; the second penalises an
 * ensemble that is needlessly spread out. CRPS reduces to absolute error when the
 * ensemble collapses to a single member, which makes it directly comparable to a
 * deterministic forecast's MAE. Lower is better.
 *
 * `fair` selects the unbiased estimator (Ferro), dividing the spread term by n(n-1)
 * rather than n². The biased form systematically rewards small ensembles for being
 * under-dispersed, so comparing a 31-member GFS ensemble against a 51-member one with
 * the biased estimator is not a like-for-like comparison.
 */
export function crps(members: readonly number[], observed: number, fair = true): number {
  const n = members.length;
  if (n === 0) return 0;
  if (n === 1) return Math.abs(members[0]! - observed);

  let absError = 0;
  for (const m of members) absError += Math.abs(m - observed);
  absError /= n;

  let spread = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      spread += Math.abs(members[i]! - members[j]!);
    }
  }

  const denominator = fair ? 2 * n * (n - 1) : 2 * n * n;
  return absError - spread / denominator;
}

export function meanCrps(pairs: readonly EnsemblePair[], fair = true): number {
  if (pairs.length === 0) return 0;
  return mean(pairs.map((p) => crps(p.members, p.observed, fair)));
}

/**
 * Talagrand rank histogram.
 *
 * For each occasion, count how many members the observation exceeds. With a properly
 * dispersed ensemble the observation is statistically indistinguishable from a member,
 * so ranks are uniform. Shape tells you the failure mode:
 *
 *   U-shaped   -> under-dispersed; the truth keeps falling outside the ensemble
 *   dome       -> over-dispersed; the ensemble is hedging wider than reality
 *   sloped     -> biased; the ensemble sits consistently high or low
 *
 * Ties (common with precipitation, where many members are exactly zero) are resolved
 * by distributing the observation uniformly within the tied block. Always breaking ties
 * one direction manufactures a spurious spike at an end bin — precisely the artefact
 * that would be misread as under-dispersion.
 */
export function rankHistogram(pairs: readonly EnsemblePair[]): number[] {
  const n = pairs[0]?.members.length ?? 0;
  if (n === 0) return [];

  const bins = new Array<number>(n + 1).fill(0);

  for (const { members, observed } of pairs) {
    if (members.length !== n) continue;
    let below = 0;
    let tied = 0;
    for (const m of members) {
      if (m < observed) below++;
      else if (m === observed) tied++;
    }
    // Deterministic tie handling: place at the middle of the tied block.
    const rank = Math.min(n, below + Math.floor(tied / 2));
    bins[rank] = (bins[rank] ?? 0) + 1;
  }

  return bins;
}

/**
 * Chi-square style flatness statistic for a rank histogram, normalised so 0 is perfectly
 * flat and larger means more departure from uniformity. Reported alongside the histogram
 * because eyeballing a 32-bin chart with 40 samples is not evidence of anything.
 */
export function rankHistogramFlatness(bins: readonly number[]): number {
  const total = bins.reduce((a, b) => a + b, 0);
  if (total === 0 || bins.length === 0) return 0;
  const expected = total / bins.length;
  const chi = bins.reduce((acc, observedCount) => acc + (observedCount - expected) ** 2 / expected, 0);
  return chi / bins.length;
}
