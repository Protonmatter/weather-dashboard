import { describe, it, expect } from "vitest";
import { quantile, ensembleStats, temperatureStats, synthMembers, MEASURABLE_24H } from "../ensemble";

describe("quantile", () => {
  it("returns 0 for an empty series", () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it("returns the sole value for a single-element series", () => {
    expect(quantile([4.2], 0.1)).toBe(4.2);
    expect(quantile([4.2], 0.9)).toBe(4.2);
  });

  it("matches type-7 linear interpolation", () => {
    const s = [1, 2, 3, 4];
    // pos = 3 * 0.5 = 1.5 -> midway between 2 and 3
    expect(quantile(s, 0.5)).toBeCloseTo(2.5, 10);
    // pos = 3 * 0.25 = 0.75 -> 1 + 0.75*(2-1)
    expect(quantile(s, 0.25)).toBeCloseTo(1.75, 10);
  });

  it("hits exact endpoints", () => {
    const s = [10, 20, 30];
    expect(quantile(s, 0)).toBe(10);
    expect(quantile(s, 1)).toBe(30);
  });

  it("clamps out-of-range probabilities rather than indexing past the array", () => {
    const s = [1, 2, 3];
    expect(quantile(s, -5)).toBe(1);
    expect(quantile(s, 5)).toBe(3);
  });

  it("is monotonic across increasing q", () => {
    const s = [0, 0, 0.1, 0.4, 0.9, 2.2];
    const qs = [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => quantile(s, q));
    for (let i = 1; i < qs.length; i++) expect(qs[i]!).toBeGreaterThanOrEqual(qs[i - 1]!);
  });
});

describe("ensembleStats", () => {
  it("degrades safely on empty input", () => {
    const s = ensembleStats([]);
    expect(s.n).toBe(0);
    expect(s.perHour).toEqual([]);
    expect(s.peak).toBeGreaterThan(0); // never divide by zero downstream
  });

  it("reports every member dry when nothing precipitates", () => {
    const members = Array.from({ length: 10 }, () => new Array(24).fill(0));
    const s = ensembleStats(members);
    expect(s.pop24).toBe(0);
    expect(s.t90).toBe(0);
  });

  it("reports full agreement when every member is wet", () => {
    const members = Array.from({ length: 10 }, () => new Array(24).fill(0.05));
    const s = ensembleStats(members);
    expect(s.pop24).toBe(100);
    expect(s.t10).toBeCloseTo(1.2, 6);
  });

  it("computes pop24 as the share of members clearing the 24h threshold", () => {
    // 3 of 10 members accumulate above threshold; the rest are bone dry.
    const wet = () => [0.5, ...new Array(23).fill(0)];
    const dry = () => new Array(24).fill(0);
    const members = [wet(), wet(), wet(), dry(), dry(), dry(), dry(), dry(), dry(), dry()];
    const s = ensembleStats(members);
    expect(s.pop24).toBeCloseTo(30, 6);
  });

  it("does not count sub-threshold trace amounts as wet", () => {
    const trace = MEASURABLE_24H / 10;
    const members = Array.from({ length: 8 }, () => [trace, ...new Array(23).fill(0)]);
    expect(ensembleStats(members).pop24).toBe(0);
  });

  it("orders quantiles p10 <= p50 <= p90 for every hour", () => {
    const members = synthMembers([80, 60, 40, 20, 10, ...new Array(19).fill(5)]);
    const s = ensembleStats(members);
    for (const h of s.perHour) {
      expect(h.p10).toBeLessThanOrEqual(h.p50);
      expect(h.p50).toBeLessThanOrEqual(h.p90);
    }
  });

  it("identifies the wettest hour by median", () => {
    const members = Array.from({ length: 5 }, () => {
      const row = new Array(24).fill(0.01);
      row[7] = 0.9;
      return row;
    });
    expect(ensembleStats(members).wettest).toBe(7);
  });

  it("tolerates ragged member series without throwing", () => {
    const members = [[0.1, 0.2, 0.3], [0.1, 0.2], [0.4]];
    expect(() => ensembleStats(members)).not.toThrow();
    expect(ensembleStats(members).n).toBe(3);
  });
});

describe("temperatureStats", () => {
  it("returns an empty array for no members", () => {
    expect(temperatureStats([])).toEqual([]);
  });

  it("returns an empty array when members carry no hours", () => {
    expect(temperatureStats([[], []])).toEqual([]);
  });

  it("produces one quantile triple per hour", () => {
    // 3 members over 2 hours.
    const members = [
      [50, 60],
      [52, 64],
      [54, 68],
    ];
    const s = temperatureStats(members);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ p10: expect.any(Number), p50: 52, p90: expect.any(Number) });
    expect(s[1]!.p50).toBe(64);
  });

  it("keeps p10 <= p50 <= p90 at every hour", () => {
    const members = [
      [30, 71, 12],
      [45, 68, 19],
      [39, 70, 5],
      [50, 66, 22],
      [33, 72, 14],
    ];
    for (const q of temperatureStats(members)) {
      expect(q.p10).toBeLessThanOrEqual(q.p50);
      expect(q.p50).toBeLessThanOrEqual(q.p90);
    }
  });

  it("collapses to a flat band when all members agree", () => {
    const members = [
      [60, 61],
      [60, 61],
      [60, 61],
    ];
    expect(temperatureStats(members)).toEqual([
      { p10: 60, p50: 60, p90: 60 },
      { p10: 61, p50: 61, p90: 61 },
    ]);
  });

  it("handles negative (sub-zero) temperatures", () => {
    const members = [
      [-10, -2],
      [-6, 0],
      [-8, -1],
    ];
    const s = temperatureStats(members);
    expect(s[0]!.p50).toBe(-8);
    expect(s[0]!.p10).toBeLessThan(s[0]!.p90);
  });
});

describe("synthMembers", () => {
  it("is deterministic for a given seed", () => {
    const pop = [70, 50, 30, 10];
    expect(synthMembers(pop, 42)).toEqual(synthMembers(pop, 42));
  });

  it("differs across seeds", () => {
    const pop = [70, 50, 30, 10];
    expect(synthMembers(pop, 1)).not.toEqual(synthMembers(pop, 2));
  });

  it("produces exclusively dry members when probability is zero", () => {
    const members = synthMembers(new Array(24).fill(0));
    expect(members.every((m) => m.every((v) => v === 0))).toBe(true);
  });

  it("emits the requested member count and series length", () => {
    const members = synthMembers(new Array(24).fill(50), 7, 21);
    expect(members).toHaveLength(21);
    expect(members[0]).toHaveLength(24);
  });

  it("never emits negative precipitation", () => {
    const members = synthMembers([100, 90, 80, 5, 0]);
    expect(members.flat().every((v) => v >= 0)).toBe(true);
  });
});
