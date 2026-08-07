import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordForecast,
  loadArchive,
  saveArchive,
  applyObservations,
  tempVerifiedRecords,
  locKey,
  type ForecastRecord,
  type ObservedHour,
} from "../store";

/**
 * The store runs against real localStorage in the browser; vitest runs in a node
 * environment, so a Map-backed stub stands in. The stub is deliberately minimal —
 * anything beyond getItem/setItem/removeItem would be testing the stub.
 */
function stubStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

// Anchored to the real clock: loadArchive prunes against Date.now() internally, so a
// fixed historical epoch would age every test record out of the archive.
const NOW = Date.now();
const HOUR = 3_600_000;

/** A minimal live input: two members, hours starting one hour after `NOW`. */
function input(overrides: Partial<Parameters<typeof recordForecast>[0]> = {}) {
  return {
    lat: 37.44,
    lon: -122.14,
    members: [
      [0.1, 0],
      [0, 0.2],
    ],
    validTimes: [new Date(NOW + HOUR), new Date(NOW + 2 * HOUR)],
    live: true,
    ...overrides,
  };
}

beforeEach(() => {
  stubStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recordForecast", () => {
  it("refuses a synthetic forecast even when temperature members are supplied", () => {
    const added = recordForecast(input({ live: false, tempMembers: [[68], [70]] }), NOW);
    expect(added).toBe(0);
    expect(loadArchive()).toEqual([]);
  });

  it("records temperature members rounded to one decimal", () => {
    recordForecast(input({ tempMembers: [[68.34999, 70], [71.05, 69]] }), NOW);
    const archive = loadArchive();
    // 68.34999 * 10 = 683.4999 → rounds to 683 → 68.3
    expect(archive[0]?.tMembers).toEqual([68.3, 71.1]);
    expect(archive[1]?.tMembers).toEqual([70, 69]);
  });

  it("omits tMembers entirely when the input has no temperature members", () => {
    recordForecast(input(), NOW);
    const archive = loadArchive();
    expect(archive.length).toBe(2);
    for (const r of archive) {
      expect("tMembers" in r).toBe(false);
    }
  });

  it("omits tMembers when the temperature member list is empty", () => {
    recordForecast(input({ tempMembers: [] }), NOW);
    expect(loadArchive().every((r) => r.tMembers === undefined)).toBe(true);
  });

  it("does not backfill temperature into an hour already recorded without it", () => {
    // First load: model omitted temperature. Second load an hour later: temp present.
    // The second fetch is a shorter-lead forecast; splicing it into the sealed record
    // would mix lead times (RFC 0002 §3.2).
    recordForecast(input(), NOW);
    recordForecast(input({ tempMembers: [[68, 70], [71, 69]] }), NOW);
    const archive = loadArchive();
    expect(archive.length).toBe(2);
    for (const r of archive) {
      expect(r.tMembers).toBeUndefined();
      expect(r.issued).toBe(NOW);
    }
  });

  it("skips hours that have already elapsed", () => {
    const added = recordForecast(
      input({ validTimes: [new Date(NOW - HOUR), new Date(NOW + HOUR)] }),
      NOW
    );
    expect(added).toBe(1);
  });

  it("leaves precipitation records byte-identical to the pre-temperature format", () => {
    recordForecast(input(), NOW);
    const r = loadArchive()[0];
    expect(r).toEqual({
      loc: locKey(37.44, -122.14),
      issued: NOW,
      valid: NOW + HOUR,
      p: 0.5,
      members: [0.1, 0],
      live: true,
    });
  });
});

describe("applyObservations", () => {
  const sealed: ForecastRecord = {
    loc: "37.44,-122.14",
    issued: NOW - 2 * HOUR,
    valid: NOW - HOUR,
    p: 0.5,
    members: [0.1, 0],
    live: true,
    tMembers: [68, 70],
  };
  const key = `${sealed.loc}@${sealed.valid}`;

  it("fills precipitation and temperature from one observed hour", () => {
    saveArchive([sealed]);
    const filled = applyObservations(new Map([[key, { precip: 0.02, temp: 69.4 }]]));
    expect(filled).toBe(1);
    const r = loadArchive()[0];
    expect(r?.observed).toBe(0.02);
    expect(r?.tObserved).toBe(69.4);
  });

  it("fills temperature on a record whose precipitation was observed earlier", () => {
    saveArchive([{ ...sealed, observed: 0.02 }]);
    const filled = applyObservations(new Map([[key, { precip: 0.02, temp: 69.4 }]]));
    expect(filled).toBe(1);
    expect(loadArchive()[0]?.tObserved).toBe(69.4);
  });

  it("never overwrites an existing observation", () => {
    saveArchive([{ ...sealed, observed: 0.02, tObserved: 69.4 }]);
    const filled = applyObservations(new Map([[key, { precip: 9, temp: 99 }]]));
    expect(filled).toBe(0);
    const r = loadArchive()[0];
    expect(r?.observed).toBe(0.02);
    expect(r?.tObserved).toBe(69.4);
  });

  it("leaves temperature unset when the observed hour omits it", () => {
    saveArchive([sealed]);
    applyObservations(new Map([[key, { precip: 0.02 }]]));
    const r = loadArchive()[0];
    expect(r?.observed).toBe(0.02);
    expect(r?.tObserved).toBeUndefined();
  });

  it("does not attach a temperature observation to a record without members to score it", () => {
    const { tMembers: _tm, ...precipOnly } = sealed;
    void _tm;
    saveArchive([precipOnly]);
    applyObservations(new Map([[key, { precip: 0.02, temp: 69.4 }]]));
    const r = loadArchive()[0];
    expect(r?.observed).toBe(0.02);
    expect(r?.tObserved).toBeUndefined();
  });

  it("returns 0 for an empty observation map", () => {
    saveArchive([sealed]);
    expect(applyObservations(new Map<string, ObservedHour>())).toBe(0);
  });
});

describe("tempVerifiedRecords", () => {
  const base: ForecastRecord = {
    loc: "37.44,-122.14",
    issued: NOW,
    valid: NOW + HOUR,
    p: 0.5,
    members: [0.1, 0],
    live: true,
    tMembers: [68, 70],
    tObserved: 69,
  };

  it("returns records that are live, temperature-observed, and hold a real member set", () => {
    expect(tempVerifiedRecords([base])).toEqual([base]);
  });

  it("excludes records missing an observed temperature", () => {
    expect(tempVerifiedRecords([{ ...base, tObserved: undefined }])).toEqual([]);
  });

  it("excludes records with missing or singleton temperature members", () => {
    expect(tempVerifiedRecords([{ ...base, tMembers: undefined }])).toEqual([]);
    expect(tempVerifiedRecords([{ ...base, tMembers: [68] }])).toEqual([]);
  });

  it("excludes synthetic records even when fully populated", () => {
    expect(tempVerifiedRecords([{ ...base, live: false }])).toEqual([]);
  });

  it("returns an empty list for an empty archive", () => {
    expect(tempVerifiedRecords([])).toEqual([]);
  });
});

describe("loadArchive", () => {
  it("round-trips a pre-temperature record unchanged — the no-migration claim as a test", () => {
    const v1: ForecastRecord = {
      loc: "40.71,-74.01",
      issued: NOW - HOUR,
      valid: NOW + HOUR,
      p: 0.25,
      members: [0, 0, 0.05, 0],
      live: true,
      observed: 0.01,
    };
    saveArchive([v1]);
    const loaded = loadArchive();
    expect(loaded).toEqual([v1]);
    saveArchive(loaded);
    expect(loadArchive()).toEqual([v1]);
  });
});
