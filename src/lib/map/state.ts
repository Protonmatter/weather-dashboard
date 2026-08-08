export type MapLoadStatus = "dormant" | "loading" | "ready" | "refreshing" | "stale" | "error";

export interface MapLoadState<T> {
  status: MapLoadStatus;
  data: T | null;
  error: string | null;
  requestId: number;
}

export type MapLoadAction<T> =
  | { type: "start"; requestId: number }
  | { type: "success"; requestId: number; data: T }
  | { type: "failure"; requestId: number; message: string }
  | { type: "abort"; requestId: number }
  | { type: "reset"; requestId: number };

export function initialMapLoadState<T>(): MapLoadState<T> {
  return { status: "dormant", data: null, error: null, requestId: 0 };
}

export function mapLoadReducer<T>(state: MapLoadState<T>, action: MapLoadAction<T>): MapLoadState<T> {
  if (action.type !== "reset" && action.requestId < state.requestId) return state;
  switch (action.type) {
    case "start":
      return {
        ...state,
        status: state.data ? "refreshing" : "loading",
        error: null,
        requestId: action.requestId,
      };
    case "success":
      return { status: "ready", data: action.data, error: null, requestId: action.requestId };
    case "failure":
      return {
        ...state,
        status: state.data ? "stale" : "error",
        error: action.message,
        requestId: action.requestId,
      };
    case "abort":
      return {
        ...state,
        status: state.data ? "ready" : "dormant",
        error: null,
        requestId: action.requestId,
      };
    case "reset":
      return { ...initialMapLoadState<T>(), requestId: action.requestId };
  }
}
