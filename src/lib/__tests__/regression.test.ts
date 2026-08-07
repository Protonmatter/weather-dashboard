import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetchJson, isAbort, __resetHttpState } from "../http";
import { parseQuery } from "../query";
import { mergePlaces } from "../search";
import { ensembleStats } from "../ensemble";
import { murphyDecomposition, crps, type EnsemblePair } from "../verification/metrics";
import { dieboldMariano, hersbachDecomposition } from "../verification/advanced";
import type { Place } from "../types";

/**
 * Regression suite.
 *
 * Every case here corresponds to a defect that actually shipped. Their value is not
 * coverage; it is that a future refactor cannot quietly reintroduce a specific known
 * failure. Each test names the defect it guards.
 */

const place = (o: Partial<Place>): Place => ({ lat: 0, lon: 0, name: "x", admin: "", country: "", cc: "", ...o });

describe("regression: superseded search could overwrite newer results", () => {
  beforeEach(() => __resetHttpState());
  afterEach(() => vi.restoreAllMocks());

  it("an aborted request rejects rather than resolving into state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init?: RequestInit) =>
          new Promise((_res, rej) => {
            init?.signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
          })
      )
    );
    const ctrl = new AbortController();
    const p = fetchJson("https://regress.test/1", { signal: ctrl.signal, retries: 0 });
    ctrl.abort();
    await expect(p).rejects.toSatisfy(isAbort);
  });
});

describe("regression: bare 5-digit codes were assumed to be US", () => {
  it("leaves an unqualified 5-digit code ambiguous", () => {
    expect(parseQuery("10115")).toMatchObject({ kind: "postal", cc: null });
  });
});

describe("regression: Murphy decomposition did not sum to the Brier score", () => {
  it("reconstructs the score once the within-bin residual is included", () => {
    const pairs = [
      { p: 0.31, occurred: true }, { p: 0.39, occurred: false },
      { p: 0.72, occurred: true }, { p: 0.78, occurred: true },
    ];
    const d = murphyDecomposition(pairs);
    expect(d.reliability - d.resolution + d.uncertainty + d.residual).toBeCloseTo(d.brier, 12);
  });
});

describe("regression: Hersbach reliability was computed against the inverted frequency", () => {
  it("sums to the CRPS it decomposes instead of quadrupling it", () => {
    // The interior-interval loop compared the ABOVE-frequency to the below-probability
    // i/n, charging a calibrated ensemble (1 − 2p)² per interval. Surfaced when the
    // temperature panel showed reliability 3.28 against a CRPS of 0.77. The sum identity
    // against the independent estimator in metrics.ts is the guard the original
    // (tautological) total-equals-reliability-plus-potential test failed to be.
    const pairs: EnsemblePair[] = Array.from({ length: 25 }, (_, i) => ({
      members: [60, 61.4, 62.1, 63.9, 64.2, 66],
      observed: 59.5 + (i % 8),
    }));
    const d = hersbachDecomposition(pairs);
    const mean = pairs.reduce((s, p) => s + crps(p.members, p.observed, false), 0) / pairs.length;
    expect(d.total).toBeCloseTo(mean, 10);
    expect(d.reliability).toBeLessThanOrEqual(d.total);
  });
});

describe("regression: constant score differential was reported as untestable", () => {
  it("flags a deterministic advantage instead of swallowing it", () => {
    const base = Array.from({ length: 40 }, (_, i) => 1 + (i % 7) * 0.1);
    expect(dieboldMariano(base.map((b) => b - 1), base).significant).toBe(true);
  });
});

describe("regression: ragged ensemble member series threw", () => {
  it("summarises without throwing", () => {
    expect(() => ensembleStats([[0.1, 0.2, 0.3], [0.1], []])).not.toThrow();
  });
});

describe("regression: NaN coordinates reached the map merge", () => {
  it("drops non-finite coordinates before ranking", () => {
    expect(mergePlaces([place({ lat: Number.NaN, lon: 1 })], null)).toHaveLength(0);
  });
});
