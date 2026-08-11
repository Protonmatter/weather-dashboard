import type { Place } from "../types";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SavedLocationsState {
  locations: Place[];
  persistent: boolean;
  warning: string | null;
}

export type AddSavedLocationResult =
  | { ok: true; locations: Place[] }
  | { ok: false; reason: "invalid" | "duplicate" | "limit"; locations: Place[] };

export const MAX_SAVED_LOCATIONS = 6;
export const SAVED_LOCATIONS_KEY = "wx.saved-locations.v1";
export const LOCATION_ONBOARDING_KEY = "wx.location-onboarding.v1";

export const DEFAULT_SAVED_LOCATIONS: readonly Place[] = Object.freeze([
  Object.freeze({
    lat: 37.4419,
    lon: -122.143,
    name: "Palo Alto",
    admin: "California",
    country: "United States",
    cc: "us",
  }),
  Object.freeze({
    lat: 40.7128,
    lon: -74.006,
    name: "New York",
    admin: "New York",
    country: "United States",
    cc: "us",
  }),
  Object.freeze({
    lat: 51.5072,
    lon: -0.1276,
    name: "London",
    admin: "England",
    country: "United Kingdom",
    cc: "gb",
  }),
]);

const SESSION_WARNING = "Saved locations are available for this session only.";
const SOURCES = new Set<NonNullable<Place["source"]>>([
  "open-meteo",
  "zippopotam",
  "photon",
  "coords",
  "device",
]);

function text(value: unknown, max: number, required: boolean): string | null {
  if (typeof value !== "string") return required ? null : "";
  const normalized = value.trim().slice(0, max);
  return required && !normalized ? null : normalized;
}

function normalizePlace(value: unknown): Place | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const lat = candidate["lat"];
  const lon = candidate["lon"];
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  const name = text(candidate["name"], 120, true);
  const admin = text(candidate["admin"], 120, false);
  const country = text(candidate["country"], 120, false);
  const rawCc = text(candidate["cc"], 2, false);
  if (name === null || admin === null || country === null || rawCc === null) return null;
  const cc = rawCc.toLowerCase();
  if (cc && !/^[a-z]{2}$/.test(cc)) return null;

  const normalized: Place = { lat, lon, name, admin, country, cc };
  const postcode = text(candidate["postcode"], 32, false);
  if (postcode) normalized.postcode = postcode;
  if (typeof candidate["population"] === "number" && Number.isFinite(candidate["population"]) && candidate["population"] >= 0) {
    normalized.population = candidate["population"];
  }
  if (typeof candidate["exact"] === "boolean") normalized.exact = candidate["exact"];
  if (typeof candidate["source"] === "string" && SOURCES.has(candidate["source"] as NonNullable<Place["source"]>)) {
    normalized.source = candidate["source"] as NonNullable<Place["source"]>;
  }
  return normalized;
}

function normalizeList(values: readonly unknown[]): Place[] {
  const unique = new Map<string, Place>();
  for (const value of values) {
    const place = normalizePlace(value);
    if (!place) continue;
    const id = savedPlaceId(place);
    if (!unique.has(id)) unique.set(id, place);
    if (unique.size === MAX_SAVED_LOCATIONS) break;
  }
  return [...unique.values()];
}

function defaults(): Place[] {
  return DEFAULT_SAVED_LOCATIONS.map((place) => ({ ...place }));
}

export function savedPlaceId(place: Place): string {
  return `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
}

export function writeSavedLocations(
  storage: StorageLike | null,
  locations: readonly Place[]
): SavedLocationsState {
  const normalized = normalizeList(locations);
  if (!storage) return { locations: normalized, persistent: false, warning: SESSION_WARNING };
  try {
    storage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify({ version: 1, locations: normalized }));
    return { locations: normalized, persistent: true, warning: null };
  } catch {
    return { locations: normalized, persistent: false, warning: SESSION_WARNING };
  }
}

export function readSavedLocations(storage: StorageLike | null): SavedLocationsState {
  if (!storage) return { locations: defaults(), persistent: false, warning: SESSION_WARNING };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVED_LOCATIONS_KEY);
  } catch {
    return { locations: defaults(), persistent: false, warning: SESSION_WARNING };
  }

  if (raw === null) return writeSavedLocations(storage, defaults());

  try {
    const document = JSON.parse(raw) as unknown;
    if (!document || typeof document !== "object") throw new Error("invalid document");
    const record = document as Record<string, unknown>;
    if (record["version"] !== 1 || !Array.isArray(record["locations"])) {
      throw new Error("invalid document");
    }
    if (record["locations"].length === 0) {
      return { locations: [], persistent: true, warning: null };
    }
    const locations = normalizeList(record["locations"]);
    if (!locations.length) throw new Error("invalid locations");
    return { locations, persistent: true, warning: null };
  } catch {
    return writeSavedLocations(storage, defaults());
  }
}

export function addSavedLocation(
  locations: readonly Place[],
  place: Place
): AddSavedLocationResult {
  const current = [...locations];
  const normalized = normalizePlace(place);
  if (!normalized) return { ok: false, reason: "invalid", locations: current };
  if (current.some((candidate) => savedPlaceId(candidate) === savedPlaceId(normalized))) {
    return { ok: false, reason: "duplicate", locations: current };
  }
  if (current.length >= MAX_SAVED_LOCATIONS) {
    return { ok: false, reason: "limit", locations: current };
  }
  return { ok: true, locations: [...current, normalized] };
}

export function removeSavedLocation(locations: readonly Place[], id: string): Place[] {
  return locations.filter((place) => savedPlaceId(place) !== id);
}

export function readLocationOnboardingComplete(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    const value = JSON.parse(storage.getItem(LOCATION_ONBOARDING_KEY) ?? "null") as unknown;
    return Boolean(
      value &&
      typeof value === "object" &&
      (value as Record<string, unknown>)["version"] === 1 &&
      (value as Record<string, unknown>)["complete"] === true
    );
  } catch {
    return false;
  }
}

export function writeLocationOnboardingComplete(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LOCATION_ONBOARDING_KEY, JSON.stringify({ version: 1, complete: true }));
    return true;
  } catch {
    return false;
  }
}
