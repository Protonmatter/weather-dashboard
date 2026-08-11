import { describe, expect, it } from "vitest";
import type { Place } from "../../types";
import {
  DEFAULT_SAVED_LOCATIONS,
  LOCATION_ONBOARDING_KEY,
  MAX_SAVED_LOCATIONS,
  SAVED_LOCATIONS_KEY,
  addSavedLocation,
  readLocationOnboardingComplete,
  readSavedLocations,
  removeSavedLocation,
  savedPlaceId,
  writeLocationOnboardingComplete,
  writeSavedLocations,
  type StorageLike,
} from "../store";

interface MemoryStorage extends StorageLike {
  readonly values: Map<string, string>;
}

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function place(index: number, overrides: Partial<Place> = {}): Place {
  return {
    lat: index,
    lon: index,
    name: `Place ${index}`,
    admin: "Region",
    country: "Test Country",
    cc: "tc",
    ...overrides,
  };
}

describe("saved location persistence", () => {
  it("seeds and persists starter locations only when the document is missing", () => {
    const storage = memoryStorage();

    const state = readSavedLocations(storage);

    expect(state.locations.map((candidate) => candidate.name)).toEqual([
      "Palo Alto",
      "New York",
      "London",
    ]);
    expect(state.persistent).toBe(true);
    expect(JSON.parse(storage.values.get(SAVED_LOCATIONS_KEY) ?? "null")).toMatchObject({
      version: 1,
      locations: expect.any(Array),
    });
  });

  it("preserves a valid empty list instead of restoring starter locations", () => {
    const storage = memoryStorage({
      [SAVED_LOCATIONS_KEY]: JSON.stringify({ version: 1, locations: [] }),
    });

    expect(readSavedLocations(storage)).toEqual({
      locations: [],
      persistent: true,
      warning: null,
    });
  });

  it("recovers malformed or wholly invalid documents with starter locations", () => {
    const malformed = memoryStorage({ [SAVED_LOCATIONS_KEY]: "not-json" });
    const invalid = memoryStorage({
      [SAVED_LOCATIONS_KEY]: JSON.stringify({
        version: 1,
        locations: [place(1, { lat: 91 }), place(2, { name: "   " })],
      }),
    });

    expect(readSavedLocations(malformed).locations.map((candidate) => candidate.name)).toEqual([
      "Palo Alto",
      "New York",
      "London",
    ]);
    expect(readSavedLocations(invalid).locations.map((candidate) => candidate.name)).toEqual([
      "Palo Alto",
      "New York",
      "London",
    ]);
  });

  it("drops invalid entries while preserving valid document order", () => {
    const storage = memoryStorage({
      [SAVED_LOCATIONS_KEY]: JSON.stringify({
        version: 1,
        locations: [place(2), place(3, { lon: Number.POSITIVE_INFINITY }), place(1)],
      }),
    });

    expect(readSavedLocations(storage).locations.map((candidate) => candidate.name)).toEqual([
      "Place 2",
      "Place 1",
    ]);
  });

  it("falls back to the session value when storage cannot be read or written", () => {
    const throwingStorage: StorageLike = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    const read = readSavedLocations(throwingStorage);
    const write = writeSavedLocations(throwingStorage, [place(4)]);

    expect(read.locations).toHaveLength(3);
    expect(read.persistent).toBe(false);
    expect(read.warning).toMatch(/this session/i);
    expect(write.locations.map((candidate) => candidate.name)).toEqual(["Place 4"]);
    expect(write.persistent).toBe(false);
    expect(write.warning).toMatch(/this session/i);
  });
});

describe("saved location mutations", () => {
  it("deduplicates coordinates at four decimal places", () => {
    const existing = [place(1, { lat: 37.4419, lon: -122.143 })];

    const result = addSavedLocation(existing, place(2, { lat: 37.44191, lon: -122.14301 }));

    expect(result).toEqual({ ok: false, reason: "duplicate", locations: existing });
    expect(savedPlaceId(existing[0]!)).toBe("37.4419,-122.1430");
  });

  it("rejects invalid coordinates and required display fields", () => {
    expect(addSavedLocation([], place(1, { lat: Number.NaN }))).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(addSavedLocation([], place(1, { lon: 181 }))).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(addSavedLocation([], place(1, { name: " " }))).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects a seventh place without dropping the existing six", () => {
    const existing = Array.from({ length: MAX_SAVED_LOCATIONS }, (_, index) => place(index));

    const result = addSavedLocation(existing, place(7));

    expect(result).toEqual({ ok: false, reason: "limit", locations: existing });
  });

  it("normalizes a new location and appends it without mutating the source", () => {
    const existing = [place(1)];

    const result = addSavedLocation(existing, place(2, {
      name: "  New place  ",
      admin: "  Region  ",
      country: "  Country  ",
      cc: "US",
    }));

    expect(result).toEqual({
      ok: true,
      locations: [
        place(1),
        place(2, { name: "New place", admin: "Region", country: "Country", cc: "us" }),
      ],
    });
    expect(existing).toEqual([place(1)]);
  });

  it("removes only the requested coordinate and preserves order", () => {
    const locations = [place(3), place(1), place(2)];

    expect(removeSavedLocation(locations, savedPlaceId(place(1))).map((candidate) => candidate.name)).toEqual([
      "Place 3",
      "Place 2",
    ]);
    expect(locations.map((candidate) => candidate.name)).toEqual(["Place 3", "Place 1", "Place 2"]);
  });
});

describe("location onboarding persistence", () => {
  it("is incomplete until a versioned completion record is written", () => {
    const storage = memoryStorage();

    expect(readLocationOnboardingComplete(storage)).toBe(false);
    expect(writeLocationOnboardingComplete(storage)).toBe(true);
    expect(readLocationOnboardingComplete(storage)).toBe(true);
    expect(JSON.parse(storage.values.get(LOCATION_ONBOARDING_KEY) ?? "null")).toEqual({
      version: 1,
      complete: true,
    });
  });

  it("treats malformed and unavailable storage as incomplete without throwing", () => {
    const malformed = memoryStorage({ [LOCATION_ONBOARDING_KEY]: "{}" });
    const unavailable: StorageLike = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    expect(readLocationOnboardingComplete(malformed)).toBe(false);
    expect(readLocationOnboardingComplete(unavailable)).toBe(false);
    expect(writeLocationOnboardingComplete(unavailable)).toBe(false);
  });
});

it("defines exactly three independent removable starter values", () => {
  expect(DEFAULT_SAVED_LOCATIONS).toHaveLength(3);
  expect(DEFAULT_SAVED_LOCATIONS.map(savedPlaceId)).toEqual([
    "37.4419,-122.1430",
    "40.7128,-74.0060",
    "51.5072,-0.1276",
  ]);
});
