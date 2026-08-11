import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetHttpState } from "../http";
import {
  classifyDeviceLocationError,
  locateDevice,
} from "../providers/device";

function position(lat = 37.44, lon = -122.14): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy: 25,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({ latitude: lat, longitude: lon, accuracy: 25 }),
    },
    timestamp: 1_786_291_200_000,
    toJSON: () => ({ timestamp: 1_786_291_200_000 }),
  };
}

function installGeolocation(result: GeolocationPosition = position()): void {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (resolve: PositionCallback) => resolve(result),
    },
  });
  vi.stubGlobal("window", { isSecureContext: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetHttpState();
});

describe("device location failure classification", () => {
  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ] as const)("maps browser error code %s to %s", (code, kind) => {
    expect(classifyDeviceLocationError({ code })).toMatchObject({
      name: "DeviceLocationError",
      kind,
    });
  });

  it("classifies unknown failures without exposing their message", () => {
    const error = classifyDeviceLocationError(new Error("precise internal failure"));

    expect(error).toMatchObject({ kind: "unknown", message: "location failed" });
    expect(error.message).not.toContain("precise internal failure");
  });
});

describe("device location boundary", () => {
  it("returns an unsupported failure when browser geolocation is absent", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { isSecureContext: true });

    await expect(locateDevice()).rejects.toMatchObject({
      name: "DeviceLocationError",
      kind: "unsupported",
      message: "geolocation unsupported",
    });
  });

  it("returns an insecure failure before asking the browser for a position", async () => {
    const getCurrentPosition = vi.fn((_resolve: PositionCallback, reject: PositionErrorCallback) => {
      reject({ code: 1 } as GeolocationPositionError);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    vi.stubGlobal("window", { isSecureContext: false });

    await expect(locateDevice()).rejects.toMatchObject({ kind: "insecure" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("does not swallow caller abort while reverse geocoding", async () => {
    installGeolocation();
    const controller = new AbortController();
    controller.abort();

    await expect(locateDevice(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps rounded coordinates when non-abort reverse geocoding fails", async () => {
    installGeolocation(position(35.68, 139.69));
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));

    await expect(locateDevice()).resolves.toMatchObject({
      lat: 35.68,
      lon: 139.69,
      name: "35.680, 139.690",
      source: "device",
    });
  });
});
