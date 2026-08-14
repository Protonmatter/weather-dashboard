import { describe, expect, it } from "vitest";
import {
  matchesRadarLayerIdentity,
  radarLayerContextKey,
  shouldDisplayRetainedRadarLayer,
} from "../layerState";
import type { MapViewport } from "../../map/types";
import type { Place } from "../../types";

const place: Place = {
  lat: 37.4443,
  lon: -122.1497,
  name: "Palo Alto",
  admin: "California",
  country: "United States",
  cc: "US",
};

const viewport: MapViewport = {
  center: { lat: 37.4443, lon: -122.1497 },
  zoom: 5,
  width: 800,
  height: 420,
};

describe("radar layer identity", () => {
  it("rejects a settled load event after the live viewport has changed", () => {
    const oldContextKey = radarLayerContextKey(place, viewport, "noaa-mrms");
    const newContextKey = radarLayerContextKey(
      place,
      { ...viewport, center: { ...viewport.center, lon: viewport.center.lon + 4 } },
      "noaa-mrms"
    );
    const event = {
      contextKey: oldContextKey,
      sourceKey: "noaa-mrms:source-a",
      frameId: "frame-a",
    };

    expect(matchesRadarLayerIdentity(event, {
      contextKey: oldContextKey,
      sourceKey: "noaa-mrms:source-a",
      frameId: "frame-a",
    })).toBe(true);
    expect(matchesRadarLayerIdentity(event, {
      contextKey: newContextKey,
      sourceKey: "noaa-mrms:source-a",
      frameId: "frame-a",
    })).toBe(false);
  });

  it("drops a same-context retained layer when the provider catalogue is empty", () => {
    expect(shouldDisplayRetainedRadarLayer("context-a", "context-a", false)).toBe(true);
    expect(shouldDisplayRetainedRadarLayer("context-a", "context-a", true)).toBe(false);
  });
});
