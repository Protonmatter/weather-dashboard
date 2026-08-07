import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scorecard, reconcile, MIN_CONFIDENT_SAMPLES } from "../verify";
import { saveArchive, type ForecastRecord } from "../store";
import { __resetHttpState } from "../../http";

function stubStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
}

// Anchored to the real clock: the store prunes against Date.now() internally.
const NOW = Date.now();
const HOUR = 3_600_000;

/** A verified record on both tracks, one elapsed hour ago. */
function record(overrides: Partial<ForecastRecord> = {}): ForecastRecord {
  return {
    loc: "37.44,-122.14",
    issued: NOW - 2 * HOUR,
    valid: NOW - HOUR,
    p: 0.5,
    members: [0.1, 0],
    live: true,
    observed: 0.02,
    tMembers: [60, 64],
    tObserved: 62,
    ...overrides,
  };
}

beforeEach(() => {
  stubStorage();
  __resetHttpState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scorecard", () => {
  it("reports a null temperature track for an empty archive", () => {
    expect(scorecard([]).temp).toBeNull();
  });

  it("reports a null temperature track for a precipitation-only archive", () => {
    const { tMembers: _tm, tObserved: _to, ...precipOnly } = record();
    void _tm;
    void _to;
    expect(scorecard([precipOnly]).temp).toBeNull();
  });

  it("computes the mean fair CRPS from the archived temperature pairs", () => {
    // Record A: members [60, 64], observed 62.
    //   E|X−y| = (|60−62| + |64−62|) / 2 = 2
    //   fair spread = Σᵢⱼ|xᵢ−xⱼ| / (2n(n−1)) = (0+4+4+0) / 4 = 2
    //   crps = 2 − 2 = 0
    // Record B: members [60, 64], observed 66.
    //   E|X−y| = (6 + 2) / 2 = 4;  crps = 4 − 2 = 2
    // Mean fair CRPS = (0 + 2) / 2 = 1.
    const temp = scorecard([
      record(),
      record({ valid: NOW - 2 * HOUR, tObserved: 66 }),
    ]).temp;
    expect(temp?.crps).toBeCloseTo(1, 10);
  });

  it("counts samples and distinct locations on the temperature track", () => {
    const temp = scorecard([
      record(),
      record({ valid: NOW - 2 * HOUR, loc: "40.71,-74.01" }),
    ]).temp;
    expect(temp?.samples).toBe(2);
    expect(temp?.locations).toBe(2);
  });

  it("excludes records the temperature track cannot score", () => {
    const temp = scorecard([
      record(),
      record({ valid: NOW - 2 * HOUR, tObserved: undefined }),
      record({ valid: NOW - 3 * HOUR, tMembers: [60] }),
      record({ valid: NOW - 4 * HOUR, live: false }),
    ]).temp;
    expect(temp?.samples).toBe(1);
  });

  it("sums the PIT histogram to the sample count", () => {
    const temp = scorecard([
      record(),
      record({ valid: NOW - 2 * HOUR, tObserved: 59 }),
      record({ valid: NOW - 3 * HOUR, tObserved: 66 }),
    ]).temp;
    expect(temp?.pit.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("marks the temperature track provisional below the shared sample threshold", () => {
    const many = (n: number): ForecastRecord[] =>
      Array.from({ length: n }, (_, i) => record({ valid: NOW - (i + 1) * HOUR }));
    expect(scorecard(many(MIN_CONFIDENT_SAMPLES - 1)).temp?.confident).toBe(false);
    expect(scorecard(many(MIN_CONFIDENT_SAMPLES)).temp?.confident).toBe(true);
  });

  it("keeps a bounded bootstrap interval around the CRPS point estimate", () => {
    const temp = scorecard(
      Array.from({ length: 40 }, (_, i) =>
        record({ valid: NOW - (i + 1) * HOUR, tObserved: 58 + (i % 9) })
      )
    ).temp;
    expect(temp).not.toBeNull();
    expect(temp!.crpsCI.lower).toBeLessThanOrEqual(temp!.crps);
    expect(temp!.crpsCI.upper).toBeGreaterThanOrEqual(temp!.crps);
  });

  it("leaves the precipitation scores unchanged by a temperature-free archive", () => {
    const { tMembers: _tm, tObserved: _to, ...precipOnly } = record({ p: 1, observed: 0.5 });
    void _tm;
    void _to;
    const s = scorecard([precipOnly]);
    // One pair, p = 1, occurred = true: brier = (1 − 1)² = 0.
    expect(s.samples).toBe(1);
    expect(s.brier).toBeCloseTo(0, 10);
    expect(s.temp).toBeNull();
  });
});

describe("reconcile", () => {
  /** Stub fetch with one canned response; returns the captured request URLs. */
  function stubFetch(hourly: Record<string, unknown>): string[] {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return { ok: true, json: async () => ({ hourly }) };
      })
    );
    return urls;
  }

  const elapsedIso = new Date(NOW - HOUR).toISOString();

  it("requests both variables with Fahrenheit spelled out — the unit trap", () => {
    // Omitting temperature_unit silently yields Celsius and a plausibly-sized,
    // wrong CRPS (RFC 0002 §3.3). This pins the request, not the parser.
    saveArchive([record({ observed: undefined, tObserved: undefined })]);
    const urls = stubFetch({ time: [elapsedIso], precipitation: [0.01], temperature_2m: [68] });
    return reconcile().then(() => {
      expect(urls.length).toBe(1);
      expect(urls[0]).toContain("hourly=precipitation,temperature_2m");
      expect(urls[0]).toContain("temperature_unit=fahrenheit");
      expect(urls[0]).toContain("precipitation_unit=inch");
    });
  });

  it("fills both observations from one response", async () => {
    saveArchive([record({ observed: undefined, tObserved: undefined })]);
    stubFetch({ time: [elapsedIso], precipitation: [0.01], temperature_2m: [68] });
    const filled = await reconcile();
    expect(filled).toBe(1);
    const temp = scorecard().temp;
    expect(temp?.samples).toBe(1);
  });

  it("still fills precipitation when the response omits the temperature array", async () => {
    saveArchive([record({ observed: undefined, tObserved: undefined })]);
    stubFetch({ time: [elapsedIso], precipitation: [0.01] });
    const filled = await reconcile();
    expect(filled).toBe(1);
    const s = scorecard();
    expect(s.samples).toBe(1);
    expect(s.temp).toBeNull();
  });
});
