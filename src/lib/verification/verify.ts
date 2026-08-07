import { fetchJson } from "../http";
import { MEASURABLE_HOURLY } from "../ensemble";
import {
  loadArchive,
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
  pitValues,
  pitHistogram,
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
  /** Moving-block bootstrap interval on the CRPS mean — scores are serially dependent. */
  crpsCI: Interval;
  /** Hersbach split: crps ≈ reliability + potential. Lower reliability is better. */
  reliability: number;
  /** CRPS achievable after perfect recalibration. The irreducible part. */
  potential: number;
  spreadSkill: SpreadSkill;
  /** 10-bin PIT histogram. Uniform under calibration. */
  pit: number[];
  confident: boolean;
}

/**
 * Observations for verification.
 *
 * Open-Meteo's `past_days` returns its best-estimate analysis for elapsed hours. That is
 * a reanalysis, not a rain gauge — good enough to detect miscalibration, but the UI must
 * not claim these are station observations.
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
    `&precipitation_unit=inch&temperature_unit=fahrenheit&timezone=auto`;

  const j = await fetchJson<{
    hourly: {
      time: string[];
      precipitation: (number | null)[];
      temperature_2m?: (number | null)[];
    };
  }>(url, { signal, cacheTtlMs: 1_800_000 });

  const loc = locKey(lat, lon);
  const out = new Map<string, ObservedHour>();
  const now = Date.now();

  j.hourly.time.forEach((t, i) => {
    const at = new Date(t).getTime();
    if (at >= now) return; // an unelapsed hour is not an observation
    const temp = j.hourly.temperature_2m?.[i];
    out.set(`${loc}@${at}`, {
      precip: j.hourly.precipitation[i] ?? 0,
      ...(temp !== null && temp !== undefined ? { temp } : {}),
    });
  });

  return out;
}

/** Locations with records old enough to verify but not yet scored. */
function pendingLocations(archive: readonly ForecastRecord[]): string[] {
  const now = Date.now();
  const locs = new Set<string>();
  for (const r of archive) {
    if (r.observed === undefined && r.valid < now) locs.add(r.loc);
  }
  return [...locs];
}

/** Fetch observations for every location with unscored elapsed forecasts. */
export async function reconcile(signal?: AbortSignal): Promise<number> {
  const archive = loadArchive();
  const locs = pendingLocations(archive);
  if (locs.length === 0) return 0;

  const merged = new Map<string, ObservedHour>();

  await Promise.allSettled(
    locs.slice(0, 5).map(async (loc) => {
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
    crpsCI: blockBootstrapCI(crpsSeries(pairs)),
    reliability: hersbach.reliability,
    potential: hersbach.potential,
    spreadSkill: spreadSkillRatio(pairs),
    pit: pitHistogram(pitValues(pairs)),
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

  const ranks = rankHistogram(ensemble);
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
    flatness: rankHistogramFlatness(ranks),
    confident: scored.length >= MIN_CONFIDENT_SAMPLES,
    locations: new Set(scored.map((r) => r.loc)).size,
    temp: tempScorecard(archive),
  };
}
