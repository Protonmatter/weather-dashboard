import { useCallback, useEffect, useRef, useState } from "react";
import { searchPlaces, SearchUnavailableError } from "../lib/search";
import { isAbort } from "../lib/http";
import type { Place } from "../lib/types";

const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;

interface SearchState {
  results: Place[];
  busy: boolean;
  error: string | null;
}

/**
 * Type-ahead place search.
 *
 * Two independent guards against out-of-order resolution:
 *   1. The previous request is aborted the moment a new one starts, so a superseded
 *      fetch stops consuming a connection.
 *   2. A monotonic sequence number gates the setState. Abort is advisory — a response
 *      already in flight can still resolve — so the sequence check is what actually
 *      guarantees only the newest query can write to state.
 */
export function usePlaceSearch(query: string): SearchState {
  const [state, setState] = useState<SearchState>({ results: [], busy: false, error: null });

  const controller = useRef<AbortController | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();

    controller.current?.abort();

    if (q.length < MIN_QUERY) {
      setState({ results: [], busy: false, error: null });
      return;
    }

    const id = ++seq.current;
    const ctrl = new AbortController();
    controller.current = ctrl;

    setState((s) => ({ ...s, busy: true }));

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchPlaces(q, ctrl.signal);
          if (id !== seq.current) return; // superseded
          setState({
            results,
            busy: false,
            error: results.length
              ? null
              : `Nothing matched "${q}". Try adding a country — "10115 Germany".`,
          });
        } catch (err) {
          if (isAbort(err) || id !== seq.current) return;
          setState({
            results: [],
            busy: false,
            error:
              err instanceof SearchUnavailableError
                ? "Place search is unreachable. Coordinates like 35.68, 139.69 still work."
                : "Search failed. Try again in a moment.",
          });
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => () => controller.current?.abort(), []);

  return state;
}

interface WeatherLoader<T> {
  data: T;
  busy: boolean;
  error: string | null;
  load: (place: Place) => Promise<void>;
}

/**
 * Weather loading with the same supersede semantics. Clicking three search results in
 * quick succession must leave the third on screen, not whichever server replied last.
 */
export function useWeatherLoader<T>(
  initial: T,
  loader: (place: Place, signal: AbortSignal) => Promise<T>
): WeatherLoader<T> {
  const [data, setData] = useState<T>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controller = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (place: Place) => {
      controller.current?.abort();
      const id = ++seq.current;
      const ctrl = new AbortController();
      controller.current = ctrl;

      setBusy(true);
      setError(null);

      try {
        const next = await loader(place, ctrl.signal);
        if (id !== seq.current) return;
        setData(next);
        setBusy(false);
      } catch (err) {
        if (isAbort(err) || id !== seq.current) return;
        setBusy(false);
        setError("Couldn't reach the forecast service. Showing the last known forecast.");
      }
    },
    [loader]
  );

  useEffect(() => () => controller.current?.abort(), []);

  return { data, busy, error, load };
}
