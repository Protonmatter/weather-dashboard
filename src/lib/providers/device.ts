import { fetchJson } from "../http";
import type { Place } from "../types";

interface ReverseResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
  countryCode?: string;
}

/** Browser geolocation plus reverse geocoding, so the header shows a name not coordinates. */
export async function locateDevice(signal?: AbortSignal): Promise<Place> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10_000,
      maximumAge: 600_000,
    });
  });

  const { latitude: lat, longitude: lon } = pos.coords;
  const base: Place = {
    lat,
    lon,
    name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    admin: "",
    country: "",
    cc: "",
    source: "device",
  };

  try {
    const j = await fetchJson<ReverseResponse>(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal, retries: 1, timeoutMs: 5000 }
    );
    return {
      ...base,
      name: j.city || j.locality || j.principalSubdivision || base.name,
      admin: j.principalSubdivision ?? "",
      country: j.countryName ?? "",
      cc: (j.countryCode ?? "").toLowerCase(),
    };
  } catch {
    // Reverse geocoding is cosmetic. Coordinates alone still produce a valid forecast.
    return base;
  }
}
