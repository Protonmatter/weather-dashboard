/**
 * Network boundary for every outbound call.
 *
 * Responsibilities, in the order they matter:
 *   1. Abort — a superseded request must not resolve into state. Callers pass a signal;
 *      we never swallow AbortError, so hooks can distinguish "cancelled" from "failed".
 *   2. Timeout — providers here are free community services with no SLA. A hung socket
 *      must not hold the UI in a loading state indefinitely.
 *   3. Retry — transient 5xx and network faults only. Never retry 4xx (the request is
 *      wrong, repeating it is rude) and never retry an abort.
 *   4. Circuit breaking — after repeated failures a provider is skipped for a cooldown
 *      window rather than adding latency to every subsequent search.
 *   5. Cache — a short TTL keeps us inside published rate limits during type-ahead.
 */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string
  ) {
    super(message);
    this.name = "HttpError";
  }

  /** 4xx is a client mistake: repeating it will not help. */
  get retryable(): boolean {
    return this.status === undefined || this.status >= 500 || this.status === 429;
  }
}

export const isAbort = (e: unknown): boolean =>
  e instanceof DOMException ? e.name === "AbortError" : (e as Error)?.name === "AbortError";

export interface FetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  cacheTtlMs?: number;
  /** Isolates optional endpoint failures without changing the default host-wide breaker. */
  circuitBreakerScope?: string;
}

interface CacheEntry {
  at: number;
  value: unknown;
}

export interface FetchJsonMetadata<T> {
  value: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_MAX = 200;

interface Breaker {
  fails: number;
  openUntil: number;
}

const breakers = new Map<string, Breaker>();
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });

/**
 * Links a caller signal to an internal timeout so whichever fires first aborts the fetch.
 * `AbortSignal.any` is not universally available yet, so this is done by hand.
 */
function linkedSignal(external: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  done: () => void;
} {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("Timeout", "AbortError")), timeoutMs);
  const onAbort = (): void => ctrl.abort(external?.reason);
  if (external) {
    if (external.aborted) onAbort();
    else external.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

function breakerKey(url: string, scope?: string): string {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }
  return scope ? `${host}\u0000${scope}` : host;
}

/** True when a provider is in cooldown and should be skipped entirely. */
export function isCircuitOpen(url: string, scope?: string): boolean {
  const b = breakers.get(breakerKey(url, scope));
  return !!b && b.openUntil > Date.now();
}

function recordSuccess(url: string, scope?: string): void {
  breakers.delete(breakerKey(url, scope));
}

function recordFailure(url: string, scope?: string): void {
  const key = breakerKey(url, scope);
  const b = breakers.get(key) ?? { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= BREAKER_THRESHOLD) b.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  breakers.set(key, b);
}

export async function fetchJsonWithMetadata<T>(
  url: string,
  opts: FetchOptions = {}
): Promise<FetchJsonMetadata<T>> {
  const {
    signal,
    timeoutMs = 8000,
    retries = 2,
    cacheTtlMs = 0,
    circuitBreakerScope,
  } = opts;

  if (cacheTtlMs > 0) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < cacheTtlMs) {
      return { value: hit.value as T, fetchedAt: hit.at };
    }
  }

  if (isCircuitOpen(url, circuitBreakerScope)) {
    throw new HttpError("circuit open", undefined, url);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const { signal: linked, done } = linkedSignal(signal, timeoutMs);
    try {
      const res = await fetch(url, { signal: linked });
      if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status, url);
      const body = (await res.json()) as T;
      const fetchedAt = Date.now();

      recordSuccess(url, circuitBreakerScope);
      if (cacheTtlMs > 0) {
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
        cache.set(url, { at: fetchedAt, value: body });
      }
      return { value: body, fetchedAt };
    } catch (err) {
      done();

      // A caller-initiated abort is not a failure. Propagate it untouched and do not
      // penalise the provider's circuit for it.
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      lastError = err;
      const retryable = err instanceof HttpError ? err.retryable : true;
      if (!retryable || attempt === retries) break;

      // Exponential backoff with jitter, so parallel providers don't retry in lockstep.
      await sleep(2 ** attempt * 250 + Math.random() * 150, signal);
    } finally {
      done();
    }
  }

  recordFailure(url, circuitBreakerScope);
  throw lastError instanceof Error ? lastError : new HttpError("request failed", undefined, url);
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const result = await fetchJsonWithMetadata<T>(url, opts);
  return result.value;
}

/** Test seam. */
export function __resetHttpState(): void {
  cache.clear();
  breakers.clear();
}
