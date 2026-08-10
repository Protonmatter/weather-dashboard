import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { initialMapLoadState, mapLoadReducer } from "../lib/map/state";
import { loadRadarSource, radarKey } from "../lib/radar/provider";
import type { RadarSource } from "../lib/radar/types";
import type { Place } from "../lib/types";

interface RadarLoad {
  key: string;
  source: RadarSource;
}

export function useRadar(place: Place, enabled: boolean) {
  const key = radarKey(place);
  const [state, dispatch] = useReducer(mapLoadReducer<RadarLoad>, undefined, initialMapLoadState);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    if (!enabled) {
      dispatch({ type: "reset", requestId: id });
      return;
    }

    const controller = new AbortController();
    dispatch({ type: "start", requestId: id });
    void loadRadarSource(place, controller.signal)
      .then((source) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        dispatch({ type: "success", requestId: id, data: { key, source } });
      })
      .catch(() => {
        if (controller.signal.aborted) {
          dispatch({ type: "abort", requestId: id });
          return;
        }
        dispatch({
          type: "failure",
          requestId: id,
          message: "Radar observations could not be loaded. Try again in a moment.",
        });
      });

    return () => controller.abort();
  }, [enabled, key, retryGeneration]);

  const source = useMemo(
    () => state.data?.key === key ? state.data.source : null,
    [key, state.data]
  );

  return {
    state,
    source,
    retry: () => setRetryGeneration((value) => value + 1),
  };
}
