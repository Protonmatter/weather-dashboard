import { describe, expect, it } from "vitest";
import { initialMapLoadState, mapLoadReducer } from "../state";
import type { MapLoadState } from "../state";

describe("map load state", () => {
  it("moves through initial loading and ready", () => {
    let state = initialMapLoadState<string>();
    state = mapLoadReducer(state, { type: "start", requestId: 1 });
    expect(state.status).toBe("loading");
    state = mapLoadReducer(state, { type: "success", requestId: 1, data: "grid" });
    expect(state).toMatchObject({ status: "ready", data: "grid" });
  });

  it("retains existing data as stale when refresh fails", () => {
    let state: MapLoadState<string> = {
      ...initialMapLoadState<string>(),
      status: "ready",
      data: "old",
      requestId: 1,
    };
    state = mapLoadReducer(state, { type: "start", requestId: 2 });
    expect(state.status).toBe("refreshing");
    state = mapLoadReducer(state, { type: "failure", requestId: 2, message: "failed" });
    expect(state).toMatchObject({ status: "stale", data: "old", error: "failed" });
  });

  it("ignores stale generations", () => {
    const state = { ...initialMapLoadState<string>(), status: "loading" as const, requestId: 3 };
    expect(mapLoadReducer(state, { type: "success", requestId: 2, data: "late" })).toBe(state);
  });

  it("invalidates a late generation when reset", () => {
    const loading = mapLoadReducer(initialMapLoadState<string>(), { type: "start", requestId: 1 });
    const reset = mapLoadReducer(loading, { type: "reset", requestId: 2 });
    expect(reset).toMatchObject({ status: "dormant", data: null, requestId: 2 });
    expect(mapLoadReducer(reset, { type: "success", requestId: 1, data: "late" })).toBe(reset);
  });

  it("does not expose an aborted initial request as an error", () => {
    const loading = mapLoadReducer(initialMapLoadState<string>(), { type: "start", requestId: 1 });
    expect(mapLoadReducer(loading, { type: "abort", requestId: 1 }).status).toBe("dormant");
  });
});
