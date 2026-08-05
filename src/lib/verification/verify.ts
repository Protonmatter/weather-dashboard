import { fetchJson } from "../http";
import { MEASURABLE_HOURLY } from "../ensemble";
import {
  loadArchive,
  applyObservations,
  verifiedRecords,
  locKey,
  type ForecastRecord,
} from "./store";
import {
  brierScore,
  brierSkillScore,
  brierSkillScore as _bss,
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

void _bss;

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
): Promise<Map<string, number>> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation&past_days=14&forecast_days=1&precipitation_unit=inch&timezone=auto`;

  const j = await fetchJson<{ hourly: { time: string[]; precipitation: (number | null)[] } }>(url, {
    signal,
    cacheTtlMs: 1_800_000,
  });

  const loc = locKey(lat, lon);
  const out = new Map<string, number>();
  const now = Date.now();

  j.hourly.time.forEach((t, i) => {
    const at = new Date(t).getTime();
    if (at >= now) return; // an unelapsed hour is not an observation
    out.set(`${loc}@${at}`, j.hourly.precipitation[i] ?? 0);
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

  const merged = new Map<string, number>();

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
  };
}
