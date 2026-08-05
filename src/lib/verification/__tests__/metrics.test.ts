import { describe, it, expect } from "vitest";
import {
  brierScore,
  brierSkillScore,
  reliabilityBins,
  murphyDecomposition,
  crps,
  meanCrps,
  rankHistogram,
  rankHistogramFlatness,
  type BinaryPair,
} from "../metrics";

const pair = (p: number, occurred: boolean): BinaryPair => ({ p, occurred });

describe("brierScore", () => {
  it("is 0 for a perfect confident forecast", () => {
    expect(brierScore([pair(1, true), pair(0, false)])).toBe(0);
  });

  it("is 1 for a maximally wrong confident forecast", () => {
    expect(brierScore([pair(0, true), pair(1, false)])).toBe(1);
  });

  it("is 0.25 for a permanent coin flip", () => {
    expect(brierScore([pair(0.5, true), pair(0.5, false)])).toBeCloseTo(0.25, 10);
  });

  it("returns 0 on empty input rather than NaN", () => {
    expect(brierScore([])).toBe(0);
  });
});

describe("brierSkillScore", () => {
  it("is null when the event always occurred (reference score is zero)", () => {
    expect(brierSkillScore([pair(0.9, true), pair(0.8, true)])).toBeNull();
  });

  it("is positive when the forecast beats climatology", () => {
    const pairs = [pair(0.9, true), pair(0.1, false), pair(0.9, true), pair(0.1, false)];
    expect(brierSkillScore(pairs)!).toBeGreaterThan(0);
  });

  it("is negative when the forecast is worse than the base rate", () => {
    const pairs = [pair(0.1, true), pair(0.9, false), pair(0.1, true), pair(0.9, false)];
    expect(brierSkillScore(pairs)!).toBeLessThan(0);
  });

  it("is 0 for a forecast that always states the base rate", () => {
    const pairs = [pair(0.5, true), pair(0.5, false), pair(0.5, true), pair(0.5, false)];
    expect(brierSkillScore(pairs)!).toBeCloseTo(0, 10);
  });
});

describe("reliabilityBins", () => {
  it("keeps empty bins so gaps in coverage stay visible", () => {
    const bins = reliabilityBins([pair(0.05, false)], 10);
    expect(bins).toHaveLength(10);
    expect(bins.filter((b) => b.count === 0)).toHaveLength(9);
  });

  it("places p = 1 in the final bin rather than out of range", () => {
    const bins = reliabilityBins([pair(1, true)], 10);
    expect(bins[9]!.count).toBe(1);
  });

  it("computes observed frequency within a bin", () => {
    const bins = reliabilityBins(
      [pair(0.35, true), pair(0.35, false), pair(0.35, false), pair(0.35, false)],
      10
    );
    expect(bins[3]!.observedFrequency).toBeCloseTo(0.25, 10);
    expect(bins[3]!.count).toBe(4);
  });

  it("reports a perfectly calibrated forecast on the diagonal", () => {
    // Of ten 30% forecasts, exactly three occur.
    const pairs = Array.from({ length: 10 }, (_, i) => pair(0.3, i < 3));
    const bin = reliabilityBins(pairs, 10)[3]!;
    expect(bin.meanForecast).toBeCloseTo(bin.observedFrequency, 10);
  });
});

describe("murphyDecomposition", () => {
  it("reconstructs the Brier score including the within-bin residual", () => {
    const pairs = [
      pair(0.1, false), pair(0.2, false), pair(0.35, true), pair(0.4, false),
      pair(0.62, true), pair(0.7, true), pair(0.85, true), pair(0.95, false),
      pair(0.15, false), pair(0.55, true),
    ];
    const d = murphyDecomposition(pairs);
    expect(d.reliability - d.resolution + d.uncertainty + d.residual).toBeCloseTo(d.brier, 10);
  });

  it("has zero residual when each bin holds a single distinct probability", () => {
    // One forecast value per bin: the bin mean loses no information.
    const pairs = [pair(0.05, false), pair(0.35, true), pair(0.65, true), pair(0.95, true)];
    expect(murphyDecomposition(pairs).residual).toBeCloseTo(0, 10);
  });

  it("has a non-zero residual when a bin mixes distinct probabilities", () => {
    // 0.31 and 0.39 share bin 3; representing both by 0.35 discards real information.
    const pairs = [pair(0.31, true), pair(0.39, false)];
    expect(Math.abs(murphyDecomposition(pairs).residual)).toBeGreaterThan(0);
  });

  it("gives near-zero reliability to a calibrated forecast", () => {
    const pairs = [
      ...Array.from({ length: 10 }, (_, i) => pair(0.3, i < 3)),
      ...Array.from({ length: 10 }, (_, i) => pair(0.7, i < 7)),
    ];
    expect(murphyDecomposition(pairs).reliability).toBeLessThan(1e-9);
  });

  it("gives zero resolution to a forecast that never deviates from the base rate", () => {
    const pairs = Array.from({ length: 20 }, (_, i) => pair(0.5, i % 2 === 0));
    const d = murphyDecomposition(pairs);
    expect(d.resolution).toBeCloseTo(0, 10);
    expect(d.reliability).toBeCloseTo(0, 10);
  });

  it("returns a zeroed card with sample count 0 on empty input", () => {
    expect(murphyDecomposition([]).samples).toBe(0);
  });
});

describe("crps", () => {
  it("reduces to absolute error for a single member", () => {
    expect(crps([3], 5)).toBe(2);
  });

  it("is 0 when every member equals the observation", () => {
    expect(crps([2, 2, 2, 2], 2)).toBe(0);
  });

  it("matches the hand-computed biased estimator", () => {
    // members {0,1}, obs 0: E|X-y| = 0.5; spread sum = 2, /(2*2^2) = 0.25 -> 0.25
    expect(crps([0, 1], 0, false)).toBeCloseTo(0.25, 10);
  });

  it("matches the hand-computed fair estimator", () => {
    // fair divides spread by 2*n*(n-1) = 4 -> 0.5 - 0.5 = 0
    expect(crps([0, 1], 0, true)).toBeCloseTo(0, 10);
  });

  it("penalises an ensemble that misses the observation entirely", () => {
    const tight = crps([5, 5, 5], 0);
    const near = crps([0.1, 0, 0.2], 0);
    expect(tight).toBeGreaterThan(near);
  });

  it("prefers a sharp correct ensemble over a diffuse one", () => {
    const sharp = crps([1, 1, 1, 1], 1);
    const diffuse = crps([-3, 0, 2, 5], 1);
    expect(sharp).toBeLessThan(diffuse);
  });

  it("returns 0 for an empty ensemble", () => {
    expect(crps([], 4)).toBe(0);
  });

  it("averages across occasions", () => {
    const m = meanCrps([
      { members: [1], observed: 2 },
      { members: [1], observed: 4 },
    ]);
    expect(m).toBeCloseTo(2, 10);
  });
});

describe("rankHistogram", () => {
  it("has n+1 bins for an n-member ensemble", () => {
    expect(rankHistogram([{ members: [1, 2, 3], observed: 2.5 }])).toHaveLength(4);
  });

  it("puts the observation in the top bin when it exceeds every member", () => {
    const bins = rankHistogram([{ members: [1, 2, 3], observed: 99 }]);
    expect(bins[3]).toBe(1);
  });

  it("puts the observation in the bottom bin when it falls below every member", () => {
    const bins = rankHistogram([{ members: [1, 2, 3], observed: -99 }]);
    expect(bins[0]).toBe(1);
  });

  it("splits ties toward the middle rather than piling them at an edge", () => {
    // All members zero, observation zero: 4 ties -> rank 2, not 0 or 4.
    const bins = rankHistogram([{ members: [0, 0, 0, 0], observed: 0 }]);
    expect(bins[2]).toBe(1);
    expect(bins[0]).toBe(0);
    expect(bins[4]).toBe(0);
  });

  it("skips occasions whose member count does not match", () => {
    const bins = rankHistogram([
      { members: [1, 2, 3], observed: 2 },
      { members: [1, 2], observed: 1.5 },
    ]);
    expect(bins.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("returns an empty histogram for empty input", () => {
    expect(rankHistogram([])).toEqual([]);
  });
});

describe("rankHistogramFlatness", () => {
  it("is 0 for a perfectly uniform histogram", () => {
    expect(rankHistogramFlatness([10, 10, 10, 10])).toBeCloseTo(0, 10);
  });

  it("grows as the histogram becomes more U-shaped", () => {
    const flat = rankHistogramFlatness([10, 10, 10, 10]);
    const skewed = rankHistogramFlatness([25, 5, 5, 25]);
    expect(skewed).toBeGreaterThan(flat);
  });

  it("returns 0 rather than dividing by zero on empty input", () => {
    expect(rankHistogramFlatness([])).toBe(0);
    expect(rankHistogramFlatness([0, 0, 0])).toBe(0);
  });
});
