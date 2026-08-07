import { MEASURABLE_HOURLY } from "../ensemble";

/**
 * Forecast archive.
 *
 * Verification needs forecasts recorded BEFORE the outcome is known — scoring against
 * data you fetched after the fact proves nothing. Each record is written when a forecast
 * is displayed and sealed; only `observed` is filled in later.
 *
 * localStorage is the right store for a client-only app: no backend, and the archive is
 * inherently per-device anyway. It is a real limitation and the UI says so.
 */

export interface ForecastRecord {
  /** Location key, rounded to ~1km so a re-search of the same city keeps accumulating. */
  loc: string;
  /** When the forecast was made. */
  issued: number;
  /** The hour being forecast. */
  valid: number;
  /** Forecast probability of measurable precipitation, 0-1. */
  p: number;
  /** Member values, inches. Empty when the ensemble was synthetic. */
  members: number[];
  /** True when members came from a real ensemble. Synthetic forecasts are never scored. */
  live: boolean;
  /** Observed precipitation, inches. Undefined until verified. */
  observed?: number;
  /** Member temperatures, °F, rounded to 0.1. Absent when the model omitted temperature. */
  tMembers?: number[];
  /** Observed temperature, °F. Undefined until verified. */
  tObserved?: number;
}

const KEY = "wx.verification.v1";
const MAX_RECORDS = 4000;
const MAX_AGE_MS = 30 * 24 * 3600e3;

export const locKey = (lat: number, lon: number): string =>
  `${lat.toFixed(2)},${lon.toFixed(2)}`;

function safeRead(): ForecastRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ForecastRecord[]) : [];
  } catch {
    // Corrupt or unavailable storage must not take down the app.
    return [];
  }
}

function safeWrite(records: readonly ForecastRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // Quota exceeded or storage disabled. Verification degrades; the forecast still works.
  }
}

export function loadArchive(): ForecastRecord[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return safeRead().filter((r) => r.valid > cutoff);
}

export function saveArchive(records: readonly ForecastRecord[]): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  const kept = records
    .filter((r) => r.valid > cutoff)
    .sort((a, b) => a.valid - b.valid)
    .slice(-MAX_RECORDS);
  safeWrite(kept);
}

export interface RecordInput {
  lat: number;
  lon: number;
  /** Member-major hourly series: members[m][h]. */
  members: readonly (readonly number[])[];
  /** Valid times aligned to the hour axis of `members`. */
  validTimes: readonly Date[];
  live: boolean;
  /** Member-major hourly temperatures (°F), same axis as `members`. Optional: models may omit it. */
  tempMembers?: readonly (readonly number[])[];
}

/**
 * Archive one forecast as a set of per-hour records, skipping hours already recorded
 * for the same location and valid time. Re-opening the app should not double-count a
 * forecast it already holds — that would silently inflate the sample size.
 */
export function recordForecast(input: RecordInput, now = Date.now()): number {
  if (!input.live || input.members.length === 0) return 0;

  const existing = loadArchive();
  const seen = new Set(existing.map((r) => `${r.loc}@${r.valid}`));
  const loc = locKey(input.lat, input.lon);
  const added: ForecastRecord[] = [];

  input.validTimes.forEach((time, h) => {
    const valid = time.getTime();
    if (valid <= now) return; // only forecasts, never hindcasts
    if (seen.has(`${loc}@${valid}`)) return;

    const members = input.members.map((m) => m[h] ?? 0);
    const wet = members.filter((v) => v >= MEASURABLE_HOURLY).length;

    // 0.1 °F is two orders of magnitude below GFS ensemble spread; rounding at write
    // time bounds archive growth without perturbing CRPS (RFC 0002 §3.1).
    const tMembers = input.tempMembers?.length
      ? input.tempMembers.map((m) => Math.round((m[h] ?? 0) * 10) / 10)
      : undefined;

    added.push({
      loc,
      issued: now,
      valid,
      p: wet / members.length,
      members,
      live: true,
      ...(tMembers ? { tMembers } : {}),
    });
  });

  if (added.length) saveArchive([...existing, ...added]);
  return added.length;
}

/** Attach observations to records whose valid time has passed. */
export function applyObservations(observations: ReadonlyMap<string, number>): number {
  const archive = loadArchive();
  let filled = 0;

  const updated = archive.map((r) => {
    if (r.observed !== undefined) return r;
    const obs = observations.get(`${r.loc}@${r.valid}`);
    if (obs === undefined) return r;
    filled++;
    return { ...r, observed: obs };
  });

  if (filled) saveArchive(updated);
  return filled;
}

export const verifiedRecords = (archive: readonly ForecastRecord[]): ForecastRecord[] =>
  archive.filter((r) => r.observed !== undefined && r.live);

/** Records scoreable on the temperature track: live, observed, and holding a real member set. */
export const tempVerifiedRecords = (archive: readonly ForecastRecord[]): ForecastRecord[] =>
  archive.filter((r) => r.live && r.tObserved !== undefined && (r.tMembers?.length ?? 0) > 1);

export function clearArchive(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
