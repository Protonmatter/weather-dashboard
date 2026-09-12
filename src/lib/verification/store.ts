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
  /** Retrieval/sealing time on this device, not the model initialization time. */
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
  /** Source and hour-ending precipitation interval, recorded by the v2 writer. */
  source?: "open-meteo-gfs025";
  intervalStart?: number;
  /** Model reference provenance; these values are not station observations. */
  referenceSource?: "open-meteo-forecast-past";
  observedFetchedAt?: number;
  tObservedFetchedAt?: number;
}

// v1 may contain shifted timestamps and nulls converted to zero. Preserve it untouched:
// corrected scores start with a new series rather than reinterpreting old evidence.
const KEY = "wx.verification.v2";
const MAX_RECORDS = 4000;
const MAX_AGE_MS = 30 * 24 * 3600e3;

export const locKey = (lat: number, lon: number): string =>
  `${lat.toFixed(2)},${lon.toFixed(2)}`;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const finiteArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.every(finite);
const validInstant = (value: unknown): value is number =>
  finite(value) && Number.isFinite(new Date(value).getTime());

function validRecord(value: unknown): value is ForecastRecord {
  if (value === null || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (typeof r.loc !== "string" || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(r.loc)) return false;
  const [lat, lon] = r.loc.split(",").map(Number);
  if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (!validInstant(r.issued) || !validInstant(r.valid) || typeof r.live !== "boolean" ||
      !finite(r.p) || r.p < 0 || r.p > 1 || !finiteArray(r.members) || r.members.some((v) => v < 0)) return false;
  if (r.observed !== undefined && (!finite(r.observed) || r.observed < 0)) return false;
  if (r.tMembers !== undefined && !finiteArray(r.tMembers)) return false;
  if (r.tObserved !== undefined && !finite(r.tObserved)) return false;
  if (r.source !== undefined && r.source !== "open-meteo-gfs025") return false;
  if (r.referenceSource !== undefined && r.referenceSource !== "open-meteo-forecast-past") return false;
  return [r.intervalStart, r.observedFetchedAt, r.tObservedFetchedAt]
    .every((at) => at === undefined || validInstant(at));
}

function safeRead(): ForecastRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validRecord) : [];
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
    .filter((r) => validRecord(r) && r.valid > cutoff)
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
  if (!input.live || input.members.length === 0 || !validInstant(now) ||
      !finite(input.lat) || !finite(input.lon) || Math.abs(input.lat) > 90 || Math.abs(input.lon) > 180) return 0;

  const existing = loadArchive();
  const seen = new Set(existing.map((r) => `${r.loc}@${r.valid}`));
  const loc = locKey(input.lat, input.lon);
  const added: ForecastRecord[] = [];

  input.validTimes.forEach((time, h) => {
    const valid = time.getTime();
    if (!validInstant(valid) || valid <= now) return; // only forecasts, never hindcasts
    if (seen.has(`${loc}@${valid}`)) return;

    const members = input.members.map((m) => m[h]);
    if (!finiteArray(members) || members.some((v) => v < 0)) return;
    const wet = members.filter((v) => v >= MEASURABLE_HOURLY).length;

    // Preserve valid zero temperatures; a missing member makes this hour's
    // temperature set unavailable. Rounding bounds storage at 0.1 °F precision.
    const rawTemp = input.tempMembers?.map((m) => m[h]);
    const tMembers = finiteArray(rawTemp) ? rawTemp.map((v) => Math.round(v * 10) / 10) : undefined;

    added.push({
      loc,
      issued: now,
      valid,
      p: wet / members.length,
      members,
      live: true,
      source: "open-meteo-gfs025",
      intervalStart: valid - 3_600_000,
      ...(tMembers ? { tMembers } : {}),
    });
    seen.add(`${loc}@${valid}`);
  });

  if (added.length) saveArchive([...existing, ...added]);
  return added.length;
}

/** One elapsed model-reference hour. Missing variables remain absent. */
export interface ObservedHour {
  /** Observed precipitation, inches. */
  precip?: number;
  /** Observed temperature, °F. Absent when the response omitted it. */
  temp?: number;
  fetchedAt?: number;
  referenceSource?: "open-meteo-forecast-past";
}

/**
 * Attach observations to records whose valid time has passed. Each variable fills
 * independently — a record may gain its temperature on a later pass than its
 * precipitation if a response omitted one array — and neither is ever overwritten.
 */
export function applyObservations(observations: ReadonlyMap<string, ObservedHour>): number {
  const archive = loadArchive();
  let filled = 0;

  const updated = archive.map((r) => {
    const obs = observations.get(`${r.loc}@${r.valid}`);
    if (obs === undefined || r.valid >= Date.now()) return r;
    if (obs.fetchedAt !== undefined && (!validInstant(obs.fetchedAt) || r.valid >= obs.fetchedAt)) return r;

    const wantPrecip = r.observed === undefined && finite(obs.precip) && obs.precip >= 0;
    // Temperature observations are only stored where members exist to score them
    // against; a sealed precip-only record would carry the value as dead weight.
    const wantTemp = r.tObserved === undefined && finite(obs.temp) && !!r.tMembers?.length;
    if (!wantPrecip && !wantTemp) return r;

    filled++;
    return {
      ...r,
      ...(wantPrecip ? { observed: obs.precip } : {}),
      ...(wantTemp ? { tObserved: obs.temp } : {}),
      ...(wantPrecip && validInstant(obs.fetchedAt) ? { observedFetchedAt: obs.fetchedAt } : {}),
      ...(wantTemp && validInstant(obs.fetchedAt) ? { tObservedFetchedAt: obs.fetchedAt } : {}),
      ...(obs.referenceSource ? { referenceSource: obs.referenceSource } : {}),
    };
  });

  if (filled) saveArchive(updated);
  return filled;
}

export const verifiedRecords = (archive: readonly ForecastRecord[]): ForecastRecord[] =>
  archive.filter((r) => validRecord(r) && r.observed !== undefined && r.live);

/** Records scoreable on the temperature track: live, observed, and holding a real member set. */
export const tempVerifiedRecords = (archive: readonly ForecastRecord[]): ForecastRecord[] =>
  archive.filter((r) => validRecord(r) && r.live && r.tObserved !== undefined && (r.tMembers?.length ?? 0) > 1);

export function clearArchive(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
