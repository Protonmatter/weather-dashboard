import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { fetchJson, HttpError, isAbort, isCircuitOpen, __resetHttpState } from "../http";
import { mergePlaces } from "../search";
import type { Place } from "../types";

const place = (over: Partial<Place>): Place => ({
  lat: 0,
  lon: 0,
  name: "x",
  admin: "",
  country: "",
  cc: "",
  ...over,
});

const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

describe("fetchJson — abort semantics", () => {
  beforeEach(() => __resetHttpState());
  afterEach(() => vi.restoreAllMocks());

  it("rejects with AbortError when the caller aborts mid-flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          })
      )
    );

    const ctrl = new AbortController();
    const p = fetchJson("https://example.test/a", { signal: ctrl.signal, retries: 0 });
    ctrl.abort();

    await expect(p).rejects.toSatisfy(isAbort);
  });

  it("rejects immediately when handed an already-aborted signal", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const ctrl = new AbortController();
    ctrl.abort();

    await expect(
      fetchJson("https://example.test/b", { signal: ctrl.signal })
    ).rejects.toSatisfy(isAbort);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not trip the circuit breaker on caller aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init?: RequestInit) =>
          new Promise((_res, rej) => {
            init?.signal?.addEventListener("abort", () =>
              rej(new DOMException("Aborted", "AbortError"))
            );
          })
      )
    );

    for (let i = 0; i < 5; i++) {
      const ctrl = new AbortController();
      const p = fetchJson("https://breaker.test/x", { signal: ctrl.signal, retries: 0 });
      ctrl.abort();
      await expect(p).rejects.toSatisfy(isAbort);
    }

    expect(isCircuitOpen("https://breaker.test/x")).toBe(false);
  });
});

describe("fetchJson — retry policy", () => {
  beforeEach(() => __resetHttpState());
  afterEach(() => vi.restoreAllMocks());

  it("does not retry a 4xx", async () => {
    const spy = vi.fn(async () => jsonResponse({}, 404));
    vi.stubGlobal("fetch", spy);

    await expect(fetchJson("https://example.test/c", { retries: 3 })).rejects.toBeInstanceOf(
      HttpError
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx and succeeds on a later attempt", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls < 3 ? jsonResponse({}, 503) : jsonResponse({ ok: true });
      })
    );

    await expect(fetchJson<{ ok: boolean }>("https://example.test/d", { retries: 3 })).resolves.toEqual({
      ok: true,
    });
    expect(calls).toBe(3);
  });

  it("opens the circuit after repeated genuine failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));

    for (let i = 0; i < 3; i++) {
      await expect(fetchJson("https://down.test/e", { retries: 0 })).rejects.toBeTruthy();
    }
    expect(isCircuitOpen("https://down.test/e")).toBe(true);
  });

  it("treats 429 as retryable", () => {
    expect(new HttpError("rate limited", 429).retryable).toBe(true);
    expect(new HttpError("not found", 404).retryable).toBe(false);
    expect(new HttpError("network", undefined).retryable).toBe(true);
  });
});

describe("fetchJson — caching", () => {
  beforeEach(() => __resetHttpState());
  afterEach(() => vi.restoreAllMocks());

  it("serves a second identical request from cache within the TTL", async () => {
    const spy = vi.fn(async () => jsonResponse({ v: 1 }));
    vi.stubGlobal("fetch", spy);

    await fetchJson("https://cache.test/f", { cacheTtlMs: 10_000 });
    await fetchJson("https://cache.test/f", { cacheTtlMs: 10_000 });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("bypasses the cache when no TTL is set", async () => {
    const spy = vi.fn(async () => jsonResponse({ v: 1 }));
    vi.stubGlobal("fetch", spy);

    await fetchJson("https://cache.test/g");
    await fetchJson("https://cache.test/g");

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("mergePlaces", () => {
  it("collapses two hits within the same ~1km cell", () => {
    const out = mergePlaces(
      [place({ lat: 37.4443, lon: -122.1497, name: "Palo Alto" }), place({ lat: 37.4448, lon: -122.1492, name: "Palo Alto" })],
      null
    );
    expect(out).toHaveLength(1);
  });

  it("keeps genuinely distinct places apart", () => {
    const out = mergePlaces(
      [place({ lat: 37.44, lon: -122.14, name: "Palo Alto" }), place({ lat: 35.68, lon: 139.69, name: "Tokyo" })],
      null
    );
    expect(out).toHaveLength(2);
  });

  it("carries a postcode from one source onto a city record from another", () => {
    const out = mergePlaces(
      [
        place({ lat: 37.44, lon: -122.14, name: "Palo Alto", population: 68_000 }),
        place({ lat: 37.44, lon: -122.14, name: "Palo Alto", postcode: "94301" }),
      ],
      null
    );
    expect(out[0]).toMatchObject({ postcode: "94301", population: 68_000 });
  });

  it("ranks exact postal hits above larger cities", () => {
    const out = mergePlaces(
      [
        place({ lat: 1, lon: 1, name: "Big City", population: 9_000_000 }),
        place({ lat: 2, lon: 2, name: "Exact Match", exact: true }),
      ],
      null
    );
    expect(out[0]!.name).toBe("Exact Match");
  });

  it("filters to the requested country when one was parsed", () => {
    const out = mergePlaces(
      [place({ lat: 1, lon: 1, cc: "us", name: "US hit" }), place({ lat: 2, lon: 2, cc: "de", name: "DE hit" })],
      "de"
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("DE hit");
  });

  it("discards records with non-finite coordinates", () => {
    const out = mergePlaces([place({ lat: Number.NaN, lon: 5, name: "bad" })], null);
    expect(out).toHaveLength(0);
  });

  it("caps results at six", () => {
    const many = Array.from({ length: 20 }, (_, i) => place({ lat: i, lon: i, name: `p${i}` }));
    expect(mergePlaces(many, null)).toHaveLength(6);
  });
});
