import { parseQuery, AMBIGUOUS_POSTAL_COUNTRIES } from "./query";
import { searchCities } from "./providers/openMeteo";
import { searchPostal } from "./providers/zippopotam";
import { searchFreeform } from "./providers/photon";
import { isAbort } from "./http";
import type { Place } from "./types";

/** Grid cell for de-duplication, ~1km. Two hits this close are the same place. */
const gridKey = (p: Place): string => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

export function mergePlaces(all: readonly Place[], filterCc: string | null): Place[] {
  const seen = new Map<string, Place>();

  for (const r of all) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    if (filterCc && r.cc && r.cc !== filterCc) continue;

    const key = gridKey(r);
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, r);
      continue;
    }
    // Field-wise merge: a Photon hit contributes its postcode to an Open-Meteo city record.
    seen.set(key, {
      ...prev,
      postcode: prev.postcode || r.postcode,
      admin: prev.admin || r.admin,
      country: prev.country || r.country,
      cc: prev.cc || r.cc,
      population: Math.max(prev.population ?? 0, r.population ?? 0),
      exact: prev.exact || r.exact,
    });
  }

  return [...seen.values()]
    .sort((a, b) => Number(b.exact ?? false) - Number(a.exact ?? false) || (b.population ?? 0) - (a.population ?? 0))
    .slice(0, 6);
}

export class SearchUnavailableError extends Error {
  constructor() {
    super("all providers failed");
    this.name = "SearchUnavailableError";
  }
}

/**
 * Fan out to the providers that can answer this query shape, then merge.
 * Aborts propagate; partial provider failure does not fail the search.
 */
export async function searchPlaces(raw: string, signal?: AbortSignal): Promise<Place[]> {
  const p = parseQuery(raw);

  if (p.kind === "coords") {
    return [
      {
        lat: p.lat,
        lon: p.lon,
        name: `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`,
        admin: "",
        country: "Pinned coordinates",
        cc: "",
        exact: true,
        source: "coords",
      },
    ];
  }

  const jobs: Promise<Place[]>[] = [];
  if (p.kind === "postal") {
    const ccs = p.cc ? [p.cc] : AMBIGUOUS_POSTAL_COUNTRIES;
    for (const cc of ccs) jobs.push(searchPostal(p.code, cc, signal));
    jobs.push(searchFreeform(p.text, signal));
  } else {
    jobs.push(searchCities(p.text, signal));
    jobs.push(searchFreeform(p.text, signal));
  }

  const settled = await Promise.allSettled(jobs);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const aborted = settled.some((s) => s.status === "rejected" && isAbort(s.reason));
  if (aborted) throw new DOMException("Aborted", "AbortError");

  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));

  // Zippopotam 404s are expected for ambiguous codes, so "everything failed" only counts
  // as an outage when nothing succeeded at all.
  if (all.length === 0 && settled.every((s) => s.status === "rejected")) {
    throw new SearchUnavailableError();
  }

  return mergePlaces(all, p.cc);
}
