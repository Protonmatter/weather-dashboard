import { useEffect, useMemo, useState } from "react";
import { visibleTiles } from "../lib/map/mercator";
import type { MapViewport } from "../lib/map/types";
import { noaaImageLayers } from "../lib/radar/noaa";
import { radarProviderFor } from "../lib/radar/provider";
import { rainViewerTileUrl } from "../lib/radar/rainViewer";
import type { RadarFrame, RadarSource } from "../lib/radar/types";
import type { Place } from "../lib/types";
import { RadarImageLayer, type RadarImageSpec } from "./RadarImageLayer";

const NOAA_VIEWPORT_SETTLE_MS = 200;

export interface ObservedRadarLayerProps {
  active: boolean;
  place: Place;
  source: RadarSource | null;
  frame: RadarFrame | null;
  viewport: MapViewport;
  retryGeneration: number;
  onLayerLoad(validAt: Date): void;
  onLayerError(message: string): void;
}

function useSettledViewport(viewport: MapViewport): MapViewport {
  const [settled, setSettled] = useState(viewport);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(viewport), NOAA_VIEWPORT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [viewport]);
  return settled;
}

function sameViewport(left: MapViewport, right: MapViewport): boolean {
  return left.center.lat === right.center.lat &&
    left.center.lon === right.center.lon &&
    left.zoom === right.zoom &&
    left.width === right.width &&
    left.height === right.height;
}

export function ObservedRadarLayer({
  active,
  place,
  source,
  frame,
  viewport,
  retryGeneration,
  onLayerLoad,
  onLayerError,
}: ObservedRadarLayerProps) {
  const settledViewport = useSettledViewport(viewport);
  const provider = source?.provider ?? radarProviderFor(place);
  const sourceKey = source
    ? `${source.provider}:${source.fetchedAt}:${source.frames.at(-1)?.id ?? "empty"}`
    : "loading";
  const tiles = useMemo(() => visibleTiles(settledViewport), [settledViewport]);
  const contextKey = [
    provider,
    place.lat,
    place.lon,
    settledViewport.center.lat,
    settledViewport.center.lon,
    settledViewport.zoom,
    settledViewport.width,
    settledViewport.height,
  ].join(":");
  const images = useMemo<RadarImageSpec[]>(() => {
    if (
      source?.provider === "noaa-mrms" &&
      frame &&
      settledViewport.width > 0 &&
      settledViewport.height > 0
    ) {
      return noaaImageLayers(frame, settledViewport).map((layer, index) => ({
        key: layer.src,
        src: layer.src,
        className: "absolute top-0 h-full object-fill",
        style: { left: layer.left, width: layer.width },
        testId: index === 0 ? "radar-noaa-image" : undefined,
      }));
    }
    if (source?.provider === "rainviewer" && source.imageHost && frame) {
      return tiles.map((tile) => ({
        key: `${frame.id}:${tile.z}/${tile.worldX}/${tile.y}`,
        src: rainViewerTileUrl(frame, source.imageHost!, {
          z: tile.z,
          x: tile.x,
          y: tile.y,
        }),
        draggable: false,
        className: "absolute max-w-none select-none",
        style: { width: 256, height: 256, left: tile.left, top: tile.top },
      }));
    }
    return [];
  }, [frame, settledViewport, source, tiles]);
  const requestKey = `${sourceKey}:${images.map((image) => image.key).join("|")}`;
  const imageActive =
    active &&
    frame !== null &&
    images.length > 0 &&
    sameViewport(settledViewport, viewport);

  return (
    <div
      hidden={!active}
      className="absolute inset-0 z-10 pointer-events-none"
      data-testid="precipitation-observation-overlay"
    >
      <RadarImageLayer
        active={imageActive}
        contextKey={contextKey}
        requestKey={requestKey}
        retryGeneration={retryGeneration}
        images={images}
        onLayerLoad={() => frame && onLayerLoad(frame.validAt)}
        onLayerError={() =>
          onLayerError(
            "Radar imagery could not be loaded. The last successful layer remains visible when available."
          )
        }
      />
    </div>
  );
}
