import { describe, it, expect } from "vitest";
import {
  spreadSkillRatio,
  hersbachDecomposition,
  pitValues,
  pitHistogram,
  blockBootstrapCI,
  dieboldMariano,
  rocCurve,
  areaUnderRoc,
  ignoranceScore,
  crpsSeries,
} from "../advanced";
import { crps, type EnsemblePair } from "../metrics";

/** Deterministic normal draws so statistical tests are reproducible in CI. */
function gaussians(count: number, seed = 7): number[] {
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 1) / 4294967297;
  };
  return Array.from({ length: count }, () => {
    const u = rnd();
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
}

describe("spreadSkillRatio", () => {
  it("returns zeros for empty input", () => {
    expect(spreadSkillRatio([]).samples).toBe(0);
  });

  it("ignores single-member forecasts, which have no spread", () => {
    expect(spreadSkillRatio([{ members: [1], observed: 2 }]).samples).toBe(0);
  });

  it("applies the (n+1)/n finite-size correction", () => {
    // Two members {-1, 1}: sample variance = 2, correction (2+1)/2 = 1.5,
    // corrected spread = sqrt(2/1.5). Error of the mean (0) against obs 0 is 0.
    const s = spreadSkillRatio([{ members: [-1, 1], observed: 0 }]);
    expect(s.spread).toBeCloseTo(Math.sqrt(2 / 1.5), 10);
    expect(s.members).toBe(2);
  });

  it("reports under-dispersion when the truth sits far outside a tight ensemble", () => {
    const pairs: EnsemblePair[] = Array.from({ length: 50 }, (_, i) => ({
      members: [0.99, 1.0, 1.01],
      observed: i % 2 === 0 ? 6 : -4,
    }));
    expect(spreadSkillRatio(pairs).ratio).toBeLessThan(0.5);
  });

  it("approaches 1 for an ensemble drawn from the same distribution as the truth", () => {
    const draws = gaussians(1200);
    const pairs: EnsemblePair[] = [];
    for (let i = 0; i + 21 <= draws.length; i += 21) {
      pairs.push({ members: draws.slice(i, i + 20), observed: draws[i + 20]! });
    }
    const ratio = spreadSkillRatio(pairs).ratio;
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.35);
  });
});

describe("hersbachDecomposition", () => {
  it("returns zeros for empty input", () => {
    expect(hersbachDecomposition([]).samples).toBe(0);
  });

  it("decomposes the mean CRPS it claims to — total matches an independent computation", () => {
    // The identity worth asserting is CRPS = Reli + CRPS_pot against the estimator in
    // metrics.ts, not total = reliability + potential, which the return value satisfies
    // by construction whatever the components are.
    const draws = gaussians(900, 11);
    const pairs: EnsemblePair[] = [];
    for (let i = 0; i + 11 <= draws.length; i += 11) {
      pairs.push({ members: draws.slice(i, i + 10), observed: draws[i + 10]! });
    }
    const d = hersbachDecomposition(pairs);
    const mean = pairs.reduce((s, p) => s + crps(p.members, p.observed, false), 0) / pairs.length;
    expect(d.total).toBeCloseTo(mean, 8);
  });

  it("charges a calibrated ensemble less reliability than potential", () => {
    // Members and observation drawn from the same distribution: what remains should be
    // overwhelmingly the irreducible part. The inverted-frequency defect made this fail
    // by charging (1 − 2p)² per interior interval to a perfectly calibrated forecast.
    const draws = gaussians(900, 11);
    const pairs: EnsemblePair[] = [];
    for (let i = 0; i + 11 <= draws.length; i += 11) {
      pairs.push({ members: draws.slice(i, i + 10), observed: draws[i + 10]! });
    }
    const d = hersbachDecomposition(pairs);
    expect(d.reliability).toBeLessThan(d.potential);
  });

  it("splits a worked single-pair example exactly", () => {
    // Members [0, 1], observed 0.25. One interior interval, width 1, below-frequency
    // ō = 0.75 against nominal p = 1/2:
    //   reliability = 1 · (0.75 − 0.5)² = 0.0625
    //   potential   = 1 · 0.75 · 0.25  = 0.1875
    //   total = 0.25 = unfair CRPS: E|X−y| − ¼Σ|xᵢ−xⱼ| = 0.5 − 0.25.
    const d = hersbachDecomposition([{ members: [0, 1], observed: 0.25 }]);
    expect(d.reliability).toBeCloseTo(0.0625, 10);
    expect(d.potential).toBeCloseTo(0.1875, 10);
    expect(d.total).toBeCloseTo(crps([0, 1], 0.25, false), 10);
  });

  it("charges an outlier observation entirely to reliability", () => {
    // Members [0, 1], observed 2 — outside the ensemble every time. Interior interval:
    // ō = 0 vs p = 1/2 → 0.25. Outlier band: frequency 1, mean excess 1 → 1 · 1² = 1.
    // Total 1.25 = unfair CRPS; potential 0 — no recalibration helps a miss like this.
    const d = hersbachDecomposition([{ members: [0, 1], observed: 2 }]);
    expect(d.reliability).toBeCloseTo(1.25, 10);
    expect(d.potential).toBeCloseTo(0, 10);
    expect(d.total).toBeCloseTo(crps([0, 1], 2, false), 10);
  });

  it("keeps both components non-negative", () => {
    const draws = gaussians(600, 3);
    const pairs: EnsemblePair[] = [];
    for (let i = 0; i + 9 <= draws.length; i += 9) {
      pairs.push({ members: draws.slice(i, i + 8), observed: draws[i + 8]! });
    }
    const d = hersbachDecomposition(pairs);
    expect(d.reliability).toBeGreaterThanOrEqual(0);
    expect(d.potential).toBeGreaterThanOrEqual(0);
  });

  it("assigns higher reliability error to a biased ensemble than an unbiased one", () => {
    const draws = gaussians(900, 5);
    const unbiased: EnsemblePair[] = [];
    const biased: EnsemblePair[] = [];
    for (let i = 0; i + 11 <= draws.length; i += 11) {
      const members = draws.slice(i, i + 10);
      const observed = draws[i + 10]!;
      unbiased.push({ members, observed });
      biased.push({ members: members.map((m) => m + 3), observed });
    }
    expect(hersbachDecomposition(biased).reliability).toBeGreaterThan(
      hersbachDecomposition(unbiased).reliability
    );
  });
});

describe("PIT", () => {
  it("places an observation above every member at 1", () => {
    expect(pitValues([{ members: [1, 2, 3], observed: 99 }])[0]).toBe(1);
  });

  it("places an observation below every member at 0", () => {
    expect(pitValues([{ members: [1, 2, 3], observed: -99 }])[0]).toBe(0);
  });

  it("places a fully tied block at the midpoint rather than an edge", () => {
    // The atom at zero in precipitation: all members dry, observation dry.
    expect(pitValues([{ members: [0, 0, 0, 0], observed: 0 }])[0]).toBe(0.5);
  });

  it("is approximately uniform for a calibrated ensemble", () => {
    const draws = gaussians(2200, 17);
    const pairs: EnsemblePair[] = [];
    for (let i = 0; i + 21 <= draws.length; i += 21) {
      pairs.push({ members: draws.slice(i, i + 20), observed: draws[i + 20]! });
    }
    const hist = pitHistogram(pitValues(pairs), 5);
    const total = hist.reduce((a, b) => a + b, 0);
    const expected = total / 5;
    for (const bin of hist) expect(Math.abs(bin - expected)).toBeLessThan(expected * 0.85);
  });

  it("piles up at the edges for an under-dispersed ensemble", () => {
    const draws = gaussians(1100, 23);
    const pairs: EnsemblePair[] = [];
    for (let i = 0; i + 11 <= draws.length; i += 11) {
      // Members squeezed toward zero: truth routinely falls outside.
      pairs.push({ members: draws.slice(i, i + 10).map((d) => d * 0.05), observed: draws[i + 10]! });
    }
    const hist = pitHistogram(pitValues(pairs), 5);
    const total = hist.reduce((a, b) => a + b, 0);
    const edges = (hist[0] ?? 0) + (hist[4] ?? 0);
    expect(edges / total).toBeGreaterThan(0.6);
  });
});

describe("blockBootstrapCI", () => {
  it("collapses to a point for tiny series rather than inventing an interval", () => {
    const ci = blockBootstrapCI([1, 2, 3]);
    expect(ci.lower).toBe(ci.point);
    expect(ci.upper).toBe(ci.point);
  });

  it("brackets the point estimate", () => {
    const ci = blockBootstrapCI(gaussians(200, 29));
    expect(ci.lower).toBeLessThanOrEqual(ci.point);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.point);
  });

  it("is reproducible for a fixed seed", () => {
    const s = gaussians(200, 31);
    expect(blockBootstrapCI(s, { seed: 99 })).toEqual(blockBootstrapCI(s, { seed: 99 }));
  });

  it("uses a block length of about N^(1/3)", () => {
    expect(blockBootstrapCI(gaussians(1000, 37)).block).toBe(10);
  });

  it("produces a zero-width interval for a constant series", () => {
    const ci = blockBootstrapCI(new Array(100).fill(4));
    expect(ci.upper - ci.lower).toBeCloseTo(0, 10);
  });

  it("narrows as the sample grows", () => {
    const small = blockBootstrapCI(gaussians(64, 41));
    const large = blockBootstrapCI(gaussians(1024, 41));
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });
});

describe("dieboldMariano", () => {
  it("declines to test below eight observations", () => {
    const r = dieboldMariano([1, 2, 3], [2, 3, 4]);
    expect(r.significant).toBe(false);
    expect(r.pValue).toBe(1);
  });

  it("finds no difference between identical score series", () => {
    const s = gaussians(300, 43).map(Math.abs);
    const r = dieboldMariano(s, s);
    expect(r.statistic).toBe(0);
    expect(r.significant).toBe(false);
  });

  it("detects a large advantage in the presence of noise", () => {
    const base = gaussians(300, 47).map((g) => Math.abs(g) + 5);
    const noise = gaussians(300, 73);
    // Genuine improvement, but noisy — the realistic case the test must handle.
    const better = base.map((b, i) => b - 3 + noise[i]! * 0.4);
    const r = dieboldMariano(better, base);
    expect(r.meanDifference).toBeLessThan(0); // negative favours the first argument
    expect(r.significant).toBe(true);
  });

  it("treats a constant non-zero differential as deterministic, not untestable", () => {
    // Zero long-run variance: one forecast wins by the same margin every time. That is
    // evidence, not a missing-variance edge case to swallow.
    const base = gaussians(64, 79).map(Math.abs);
    const r = dieboldMariano(base.map((b) => b - 2), base);
    expect(r.significant).toBe(true);
    expect(r.pValue).toBe(0);
  });

  it("does not flag a trivial difference as significant", () => {
    const a = gaussians(300, 53).map(Math.abs);
    const b = a.map((x, i) => x + (i % 2 === 0 ? 1e-4 : -1e-4));
    expect(dieboldMariano(a, b).significant).toBe(false);
  });

  it("uses a Newey-West lag of about N^(1/3)", () => {
    expect(dieboldMariano(gaussians(216, 59), gaussians(216, 61)).lag).toBe(6);
  });

  it("returns a p-value in [0,1]", () => {
    const r = dieboldMariano(gaussians(200, 67).map(Math.abs), gaussians(200, 71).map(Math.abs));
    expect(r.pValue).toBeGreaterThanOrEqual(0);
    expect(r.pValue).toBeLessThanOrEqual(1);
  });
});

describe("ROC and AUC", () => {
  it("returns an empty curve when the event never occurs", () => {
    expect(rocCurve([{ p: 0.5, occurred: false }])).toEqual([]);
  });

  it("scores perfect separation at 1", () => {
    const pairs = [
      { p: 0.9, occurred: true }, { p: 0.8, occurred: true },
      { p: 0.2, occurred: false }, { p: 0.1, occurred: false },
    ];
    expect(areaUnderRoc(rocCurve(pairs))).toBeCloseTo(1, 6);
  });

  it("scores perfectly inverted forecasts at 0", () => {
    const pairs = [
      { p: 0.1, occurred: true }, { p: 0.2, occurred: true },
      { p: 0.8, occurred: false }, { p: 0.9, occurred: false },
    ];
    expect(areaUnderRoc(rocCurve(pairs))).toBeCloseTo(0, 6);
  });

  it("scores a constant forecast at 0.5 — reliable but with no discrimination", () => {
    const pairs = [
      { p: 0.5, occurred: true }, { p: 0.5, occurred: false },
      { p: 0.5, occurred: true }, { p: 0.5, occurred: false },
    ];
    expect(areaUnderRoc(rocCurve(pairs))).toBeCloseTo(0.5, 6);
  });
});

describe("ignoranceScore", () => {
  it("is 0 bits for a perfect confident forecast", () => {
    expect(ignoranceScore([{ p: 1, occurred: true }], 0)).toBeCloseTo(0, 10);
  });

  it("is 1 bit for a coin flip", () => {
    expect(ignoranceScore([{ p: 0.5, occurred: true }])).toBeCloseTo(1, 6);
  });

  it("clips so a single confident miss cannot dominate the archive", () => {
    const score = ignoranceScore([{ p: 0, occurred: true }]);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeLessThan(11);
  });
});

describe("crpsSeries", () => {
  it("returns one score per occasion, matching crps()", () => {
    const pairs: EnsemblePair[] = [
      { members: [0, 1], observed: 0 },
      { members: [2, 3], observed: 5 },
    ];
    const series = crpsSeries(pairs);
    expect(series).toHaveLength(2);
    expect(series[0]).toBeCloseTo(crps([0, 1], 0), 12);
  });
});
