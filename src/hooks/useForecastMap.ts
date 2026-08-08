import { useEffect, useReducer, useRef, useState } from "react";
import { fetchMapForecast } from "../lib/providers/mapForecast";
import { isMapForecastFresh } from "../lib/map/cache";
import { initialMapLoadState, mapLoadReducer } from "../lib/map/state";
import type { MapForecastGrid, MapGridSpec } from "../lib/map/types";

const CACHE_LIMIT = 4;

function remember(cache: Map<string, MapForecastGrid>, grid: MapForecastGrid): void {
  cache.delete(grid.key);
  cache.set(grid.key, grid);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

export function useForecastMap(spec: MapGridSpec | null, enabled: boolean) {
  const [state, dispatch] = useReducer(mapLoadReducer<MapForecastGrid>, undefined, initialMapLoadState);
  const [retry, setRetry] = useState(0);
  const requestId = useRef(0);
  const cache = useRef(new Map<string, MapForecastGrid>());

  useEffect(() => {
    if (!enabled || !spec) {
      // Invalidate the active generation before aborting it. Fetch normally honours the
      // signal, but the generation guard also protects us from a non-compliant transport
      // resolving after the map has been disabled.
      dispatch({ type: "reset", requestId: ++requestId.current });
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      dispatch({ type: "start", requestId: id });
      const cached = cache.current.get(spec.key);
      if (cached && isMapForecastFresh(cached)) {
        cache.current.delete(spec.key);
        cache.current.set(spec.key, cached);
        dispatch({ type: "success", requestId: id, data: cached });
        return;
      }
      if (cached) cache.current.delete(spec.key);

      void fetchMapForecast(spec, controller.signal)
        .then((grid) => {
          remember(cache.current, grid);
          dispatch({ type: "success", requestId: id, data: grid });
        })
        .catch((error: unknown) => {
          // AbortError also represents fetchJson's internal timeout. Only this hook's
          // controller identifies a superseded or disabled request as cancellation.
          if (controller.signal.aborted) {
            dispatch({ type: "abort", requestId: id });
            return;
          }
          dispatch({
            type: "failure",
            requestId: id,
            message: "The forecast field could not be loaded. Try this area again.",
          });
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, retry, spec?.key]);

  return {
    state,
    retry: () => setRetry((value) => value + 1),
  };
}
