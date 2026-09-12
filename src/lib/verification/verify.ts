import { fetchJsonWithMetadata } from "../http";
import { MEASURABLE_HOURLY } from "../ensemble";
import {
  loadArchive,
  loadReconciliationCursor,
  saveReconciliationCursor,
  applyObservations,
  verifiedRecords,
  tempVerifiedRecords,
  locKey,
  type ForecastRecord,
  type ObservedHour,
} from "./store";
import {
  brierScore,
  brierSkillScore,
  murphyDecomposition,
  meanCrps,
  rankHistogram,
  rankHistogramFlatness,
  reliabilityBins,
  type BinaryPair,
  type EnsemblePair,
  type ReliabilityBin,
  type MurphyDecomposition,
} from "./metrics";
import {
  hersbachDecomposition,
  spreadSkillRatio,
  ensemblePitHistogram,
  blockBootstrapCI,
  crpsSeries,
  type Interval,
  type SpreadSkill,
} from "./advanced";

/**
 * Sample size below which scores are reported but visibly marked as provisional.
 * Ten pairs of anything produce a number; that number is noise.
 */
export const MIN_CONFIDENT_SAMPLES = 100;

export interface Scorecard {
  samples: number;
  baseRate: number;
  brier: number;
  brierSkill: number | null;
  decomposition: MurphyDecomposition;
  crps: number;
  reliability: ReliabilityBin[];
  ranks: number[];
  /** Raw ranks for a shared member count; normalized rank PIT when counts vary. */
  rankMode?: "rank" | "rank-pit";
  flatness: number;
  confident: boolean;
  /** Distinct locations contributing, for honesty about generalisation. */
  locations: number;
  /** Temperature track (RFC 0002). Null until a temperature-verified record exists. */
  temp: TempScorecard | null;
}

/** Scores for the continuous temperature track. All temperatures in °F. */
export interface TempScorecard {
  samples: number;
  locations: number;
  /** Mean fair CRPS, °F. */
  crps: number;
  /** Ordinary empirical CRPS, decomposed by the Hersbach components below. */
  empiricalCrps: number;
  /** Moving-block bootstrap interval on the CRPS mean — scores are serially dependent. */
  crpsCI: Interval;
  /** Hersbach split of empiricalCrps, not the fair finite-ensemble estimator. */
  reliability: number;
  /** Hersbach potential component for this empirical sample decomposition. */
  potential: number;
  spreadSkill: SpreadSkill;
  /** Fractional finite-ensemble rank PIT; uniform under exchangeability. */
  pit: number[];
  confident: boolean;
}

/**
 * Observations for verification.
 *
 * Open-Meteo's `past_days` supplies elapsed operational model values. This is a model
 * reference, not station observations or an independent reanalysis validation.
 */
async function fetchObserved(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<Map<string, ObservedHour>> {
  // temperature_unit is NOT inherited from anywhere: omit it and temperature_2m arrives
  // in Celsius, and every CRPS downstream is plausibly-sized and wrong (RFC 0002 §3.3).
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation,temperature_2m&past_days=14&forecast_days=1` +
    `&precipitation_unit=inch&temperature_unit=fahrenheit&timezone=auto&timeformat=unixtime`;

  const { value: j, fetchedAt } = await fetchJsonWithMetadata<{
    hourly: {
      time: number[];
      precipitation?: (number | null)[];
      temperature_2m?: (number | null)[];
    };
  }>(url, { signal, cacheTtlMs: 1_800_000 });

  const loc = locKey(lat, lon);
  const out = new Map<string, ObservedHour>();
  const now = Date.now();

  j.hourly.time.forEach((t, i) => {
    if (typeof t !== "number" || !Number.isFinite(t)) return;
    const at = t * 1000;
    if (!Number.isFinite(new Date(at).getTime())) return;
    // A cached full-day forecast must not become a reference merely because time
    // passed: the hour must also have elapsed when these values were retrieved.
    if (at >= Math.min(now, fetchedAt)) return;
    const temp = j.hourly.temperature_2m?.[i];
    const precip = j.hourly.precipitation?.[i];
    const hasTemp = typeof temp === "number" && Number.isFinite(temp);
    const hasPrecip = typeof precip === "number" && Number.isFinite(precip) && precip >= 0;
    if (!hasTemp && !hasPrecip) return;
    out.set(`${loc}@${at}`, {
      ...(hasPrecip ? { precip } : {}),
      ...(hasTemp ? { temp } : {}),
      fetchedAt,
      referenceSource: "open-meteo-forecast-past",
    });
  });

  return out;
}

/** Locations with records old enough to verify but not yet scored. */
function pendingLocations(archive: readonly ForecastRecord[]): string[] {
  const now = Date.now();
  const locs = new Set<string>();
  for (const r of archive) {
    const missingTemp = (r.tMembers?.length ?? 0) > 1 && r.tObserved === undefined;
    if ((r.observed === undefined || missingTemp) && r.valid < now) locs.add(r.loc);
  }
  return [...locs];
}

/** Fetch at most five pending locations, rotating past missing or failed references. */
export async function reconcile(signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) return 0;
  const archive = loadArchive();
  const locs = pendingLocations(archive).sort();
  if (locs.length === 0) return 0;

  const cursor = loadReconciliationCursor();
  const next = locs.findIndex(loc => loc > cursor);
  const start = next < 0 ? 0 : next;
  const batch = [...locs.slice(start), ...locs.slice(0, start)].slice(0, 5);
  // Claim before awaiting I/O so overlapping passes in this session advance too.
  // Missing references (including those beyond past_days) must not monopolize a batch.
  saveReconciliationCursor(batch[batch.length - 1]!);

  const merged = new Map<string, ObservedHour>();

  await Promise.allSettled(
    batch.map(async (loc) => {
      const [latStr, lonStr] = loc.split(",");
      const lat = Number.parseFloat(latStr ?? "");
      const lon = Number.parseFloat(lonStr ?? "");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const obs = await fetchObserved(lat, lon, signal);
      for (const [k, v] of obs) merged.set(k, v);
    })
  );

  return applyObservations(merged);
}

function tempScorecard(archive: readonly ForecastRecord[]): TempScorecard | null {
  // Sorted by valid time: the moving-block bootstrap assumes serial order, and an
  // archive merged across locations does not arrive chronologically.
  const scored = [...tempVerifiedRecords(archive)].sort((a, b) => a.valid - b.valid);
  if (scored.length === 0) return null;

  const pairs: EnsemblePair[] = scored.map((r) => ({
    members: r.tMembers ?? [],
    observed: r.tObserved ?? 0,
  }));

  const hersbach = hersbachDecomposition(pairs);

  return {
    samples: scored.length,
    locations: new Set(scored.map((r) => r.loc)).size,
    crps: meanCrps(pairs),
    empiricalCrps: meanCrps(pairs, false),
    crpsCI: blockBootstrapCI(crpsSeries(pairs)),
    reliability: hersbach.reliability,
    potential: hersbach.potential,
    spreadSkill: spreadSkillRatio(pairs),
    pit: ensemblePitHistogram(pairs),
    confident: scored.length >= MIN_CONFIDENT_SAMPLES,
  };
}

export function scorecard(archive: readonly ForecastRecord[] = loadArchive()): Scorecard {
  const scored = verifiedRecords(archive);

  const binary: BinaryPair[] = scored.map((r) => ({
    p: r.p,
    occurred: (r.observed ?? 0) >= MEASURABLE_HOURLY,
  }));

  const ensemble: EnsemblePair[] = scored
    .filter((r) => r.members.length > 1)
    .map((r) => ({ members: r.members, observed: r.observed ?? 0 }));

  const mixedCounts = new Set(ensemble.map(pair => pair.members.length)).size > 1;
  const ranks = mixedCounts ? ensemblePitHistogram(ensemble) : rankHistogram(ensemble);
  const occurred = binary.filter((b) => b.occurred).length;

  return {
    samples: scored.length,
    baseRate: binary.length ? occurred / binary.length : 0,
    brier: brierScore(binary),
    brierSkill: brierSkillScore(binary),
    decomposition: murphyDecomposition(binary),
    crps: meanCrps(ensemble),
    reliability: reliabilityBins(binary),
    ranks,
    rankMode: mixedCounts ? "rank-pit" : "rank",
    flatness: rankHistogramFlatness(ranks),
    confident: scored.length >= MIN_CONFIDENT_SAMPLES,
    locations: new Set(scored.map((r) => r.loc)).size,
    temp: tempScorecard(archive),
  };
}
