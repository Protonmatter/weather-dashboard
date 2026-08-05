import type { EnsembleSummary, HourQuantiles } from "./types";

/** Measurable precipitation in an hour, inches. Below this a member counts as dry. */
export const MEASURABLE_HOURLY = 0.004;
/** Measurable 24h accumulation, inches. */
export const MEASURABLE_24H = 0.01;

/**
 * Quantile by linear interpolation between order statistics (type 7, R's default).
 * Input MUST be sorted ascending.
 */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (pos - lo);
}

/**
 * Collapse per-member hourly precipitation series into displayable quantiles.
 * `members` is member-major: members[m][h] is inches in hour h for member m.
 */
export function ensembleStats(
  members: readonly (readonly number[])[]
): Omit<EnsembleSummary, "source" | "live"> {
  const n = members.length;
  const hours = members[0]?.length ?? 0;

  if (n === 0 || hours === 0) {
    return { n: 0, perHour: [], t10: 0, t50: 0, t90: 0, pop24: 0, peak: 0.02, wettest: 0 };
  }

  const perHour: HourQuantiles[] = [];
  for (let h = 0; h < hours; h++) {
    const col = members.map((m) => m[h] ?? 0).sort((a, b) => a - b);
    perHour.push({
      p10: quantile(col, 0.1),
      p50: quantile(col, 0.5),
      p90: quantile(col, 0.9),
      exceed: (col.filter((v) => v >= MEASURABLE_HOURLY).length / n) * 100,
    });
  }

  const totals = members.map((m) => m.reduce((a, b) => a + b, 0)).sort((a, b) => a - b);
  const wettest = perHour.reduce((best, p, i) => (p.p50 > perHour[best]!.p50 ? i : best), 0);

  return {
    n,
    perHour,
    t10: quantile(totals, 0.1),
    t50: quantile(totals, 0.5),
    t90: quantile(totals, 0.9),
    pop24: (totals.filter((v) => v >= MEASURABLE_24H).length / n) * 100,
    peak: Math.max(0.02, ...perHour.map((p) => p.p90)),
    wettest,
  };
}

/**
 * Deterministic pseudo-members derived from hourly precipitation probability.
 *
 * Used ONLY when the ensemble endpoint is unreachable, so the fan chart retains a
 * plausible shape rather than collapsing to a flat line. Callers must label the result
 * as synthetic — see EnsembleSummary.live. Presenting these as real members would be
 * a lie about forecast confidence.
 */
export function synthMembers(hourlyPop: readonly number[], seed = 7, count = 31): number[][] {
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const bias = 0.5 + rnd() * 1.1;
    return hourlyPop.map((p) => {
      const prob = Math.min(1, Math.max(0, p / 100));
      return rnd() < prob ? Number((prob * 0.1 * bias * (0.3 + rnd() * 1.7)).toFixed(4)) : 0;
    });
  });
}
