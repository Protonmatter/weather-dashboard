import { fetchJson } from "../http";
import type { Place } from "../types";

interface ZipResponse {
  country?: string;
  "country abbreviation"?: string;
  "post code"?: string;
  places?: Array<{
    "place name": string;
    latitude: string;
    longitude: string;
    state?: string;
  }>;
}

/** Authoritative structured lookup for a known postal code. 404s for unknown codes. */
export async function searchPostal(
  code: string,
  cc: string,
  signal?: AbortSignal
): Promise<Place[]> {
  const url = `https://api.zippopotam.us/${cc}/${encodeURIComponent(code)}`;
  const j = await fetchJson<ZipResponse>(url, { signal, cacheTtlMs: 86_400_000, retries: 0 });
  return (j.places ?? []).map((p) => ({
    lat: Number.parseFloat(p.latitude),
    lon: Number.parseFloat(p.longitude),
    name: p["place name"],
    admin: p.state ?? "",
    country: j.country ?? "",
    cc: (j["country abbreviation"] ?? cc).toLowerCase(),
    postcode: j["post code"] ?? code,
    population: 0,
    exact: true,
    source: "zippopotam" as const,
  }));
}
