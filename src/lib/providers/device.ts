import { fetchJson, isAbort } from "../http";
import type { Place } from "../types";

interface ReverseResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
  countryCode?: string;
}

export type DeviceLocationFailureKind =
  | "denied"
  | "timeout"
  | "unavailable"
  | "unsupported"
  | "insecure"
  | "unknown";

export class DeviceLocationError extends Error {
  constructor(
    readonly kind: DeviceLocationFailureKind,
    message: string
  ) {
    super(message);
    this.name = "DeviceLocationError";
  }
}

export function classifyDeviceLocationError(error: unknown): DeviceLocationError {
  if (error instanceof DeviceLocationError) return error;
  const code = error && typeof error === "object"
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === 1) return new DeviceLocationError("denied", "location permission denied");
  if (code === 2) return new DeviceLocationError("unavailable", "location unavailable");
  if (code === 3) return new DeviceLocationError("timeout", "location timeout");
  return new DeviceLocationError("unknown", "location failed");
}

/** Browser geolocation plus reverse geocoding, so the header shows a name not coordinates. */
export async function locateDevice(signal?: AbortSignal): Promise<Place> {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw new DeviceLocationError("insecure", "geolocation requires a secure context");
  }
  if (!navigator.geolocation) {
    throw new DeviceLocationError("unsupported", "geolocation unsupported");
  }
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (error) => reject(classifyDeviceLocationError(error)), {
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
  } catch (error) {
    if (isAbort(error)) throw error;
    // Reverse geocoding is cosmetic. Coordinates alone still produce a valid forecast.
    return base;
  }
}
