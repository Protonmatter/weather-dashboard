import { fetchJson } from "../http";
import type { Place } from "../types";

interface PhotonResponse {
  features?: Array<{
    geometry: { coordinates: [number, number] };
    properties: {
      name?: string;
      city?: string;
      district?: string;
      state?: string;
      county?: string;
      country?: string;
      countrycode?: string;
      postcode?: string;
    };
  }>;
}

/** OSM-backed catch-all: postcodes, addresses, villages, landmarks. */
export async function searchFreeform(text: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=8&lang=en`;
  const j = await fetchJson<PhotonResponse>(url, { signal, cacheTtlMs: 300_000, retries: 1 });
  return (j.features ?? []).map((f) => {
    const p = f.properties;
    return {
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      name: p.name ?? p.city ?? p.district ?? p.postcode ?? text,
      admin: p.state ?? p.county ?? "",
      country: p.country ?? "",
      cc: (p.countrycode ?? "").toLowerCase(),
      postcode: p.postcode ?? "",
      population: 0,
      source: "photon" as const,
    };
  });
}
