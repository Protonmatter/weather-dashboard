import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useRadar } from "../hooks/useRadar";
import { visibleTiles } from "../lib/map/mercator";
import type { MapViewport } from "../lib/map/types";
import { noaaImageUrl } from "../lib/radar/noaa";
import { radarProviderFor } from "../lib/radar/provider";
import { rainViewerTileUrl } from "../lib/radar/rainViewer";
import { formatLocalDate, formatLocalTime, timezoneLabel } from "../lib/time";
import type { Place } from "../lib/types";
import { RadarImageLayer, type RadarImageSpec } from "./RadarImageLayer";

const CONTROL = "inline-flex items-center justify-center rounded-xl border border-white/20 bg-slate-950/55 text-white focus:outline-none focus:ring-2 focus:ring-white/80";
const PLAYBACK_INTERVAL_MS = 900;
const NOAA_VIEWPORT_SETTLE_MS = 200;

interface RadarPanelProps {
  place: Place;
  timezone: string;
  viewport: MapViewport;
  size: { width: number; height: number };
  overlayHost: HTMLDivElement | null;
  active: boolean;
  reducedMotion: boolean;
  mapVisible: boolean;
  pageVisible: boolean;
}

function frameTime(date: Date, timezone: string): string {
  return `${formatLocalTime(date, timezone)} ${timezoneLabel(date, timezone)} · ${formatLocalDate(date, timezone)}`;
}

function useSettledViewport(viewport: MapViewport): MapViewport {
  const [settled, setSettled] = useState(viewport);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(viewport), NOAA_VIEWPORT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [viewport]);
  return settled;
}

export default function RadarPanel({
  place,
  timezone,
  viewport,
  size,
  overlayHost,
  active,
  reducedMotion,
  mapVisible,
  pageVisible,
}: RadarPanelProps) {
  const { state, source, retry } = useRadar(place, true);
  const settledViewport = useSettledViewport(viewport);
  const [selection, setSelection] = useState<{ sourceKey: string; index: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [imageFailure, setImageFailure] = useState<{ requestKey: string; message: string } | null>(null);
  const [imageRetryGeneration, setImageRetryGeneration] = useState(0);
  const [loadedObservation, setLoadedObservation] = useState<{
    contextKey: string;
    requestKey: string;
    validAt: Date;
  } | null>(null);
  const frames = source?.frames ?? [];
  const sourceKey = source ? `${source.provider}:${source.fetchedAt}:${frames.at(-1)?.id ?? "empty"}` : "loading";
  const timeIndex = selection?.sourceKey === sourceKey
    ? Math.min(selection.index, Math.max(0, frames.length - 1))
    : Math.max(0, frames.length - 1);
  const frame = frames[timeIndex] ?? null;
  const provider = radarProviderFor(place);
  const providerLabel = provider === "noaa-mrms"
    ? "NOAA / NWS MRMS"
    : provider === "rainviewer"
      ? "RainViewer"
      : "Radar unavailable";
  const imageContextKey = `${provider}:${place.lat}:${place.lon}`;

  useEffect(() => {
    setPlaying(false);
  }, [sourceKey]);

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  const tiles = useMemo(() => visibleTiles(viewport), [viewport]);
  const radarImages = useMemo<RadarImageSpec[]>(() => {
    if (source?.provider === "noaa-mrms" && frame && size.width > 0 && size.height > 0) {
      const src = noaaImageUrl(frame, settledViewport, size);
      return [{
        key: src,
        src,
        className: "absolute inset-0 h-full w-full object-fill",
        testId: "radar-noaa-image",
      }];
    }
    if (source?.provider === "rainviewer" && source.imageHost && frame) {
      return tiles.map((tile) => ({
        key: `${frame.id}:${tile.z}/${tile.worldX}/${tile.y}`,
        src: rainViewerTileUrl(frame, source.imageHost!, tile),
        draggable: false,
        className: "absolute max-w-none select-none",
        style: { width: 256, height: 256, left: tile.left, top: tile.top },
      }));
    }
    return [];
  }, [frame, settledViewport, size, source, tiles]);
  const imageRequestKey = `${sourceKey}:${radarImages.map((image) => image.key).join("|")}`;
  const visibleObservation = radarImages.length > 0 && loadedObservation?.contextKey === imageContextKey
    ? loadedObservation
    : null;
  const imageReady = visibleObservation?.requestKey === imageRequestKey;
  const imageError = imageFailure?.requestKey === imageRequestKey ? imageFailure.message : null;

  useEffect(() => {
    if (!active || !playing || reducedMotion || !mapVisible || !pageVisible || frames.length < 2 || !imageReady) return;
    const timer = window.setInterval(() => {
      setSelection((current) => {
        const index = current?.sourceKey === sourceKey ? current.index : frames.length - 1;
        return { sourceKey, index: (index + 1) % frames.length };
      });
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, frames.length, imageReady, mapVisible, pageVisible, playing, reducedMotion, sourceKey]);

  const selectedObserved = frame ? frameTime(frame.validAt, timezone) : "Observation time unavailable";
  const observed = visibleObservation
    ? frameTime(visibleObservation.validAt, timezone)
    : selectedObserved;
  const radarLabel = imageError
    ? visibleObservation
      ? `${providerLabel} radar for ${place.name} is showing the retained observation from ${observed}; the selected replacement could not be loaded.`
      : `${providerLabel} radar imagery for ${place.name} could not be loaded.`
    : visibleObservation
      ? `${providerLabel} radar observation for ${place.name}. Observed ${observed}.`
      : frame
        ? `${providerLabel} radar for ${place.name} is loading the selected observation from ${selectedObserved}.`
        : `${providerLabel} radar for ${place.name} is unavailable.`;

  const overlay = overlayHost ? createPortal(
    <div className="absolute inset-0 z-10 pointer-events-none" hidden={!active} data-testid="radar-overlay">
      {radarImages.length > 0 && (
        <RadarImageLayer
          contextKey={imageContextKey}
          requestKey={imageRequestKey}
          retryGeneration={imageRetryGeneration}
          images={radarImages}
          onLayerError={() => {
            setPlaying(false);
            setImageFailure({
              requestKey: imageRequestKey,
              message: "Radar imagery could not be loaded. The last successful layer remains visible when available.",
            });
          }}
          onLayerLoad={() => {
            if (frame) {
              setLoadedObservation({
                contextKey: imageContextKey,
                requestKey: imageRequestKey,
                validAt: frame.validAt,
              });
            }
            setImageFailure((current) =>
              current?.requestKey === imageRequestKey ? null : current
            );
          }}
        />
      )}
      <div className="sr-only" role="img" aria-label={radarLabel} />
      <div className="absolute bottom-2 left-2 max-w-[70%] rounded-lg bg-slate-950/75 px-2 py-1 text-[10px] text-white/90">
        <div
          className="h-1.5 rounded-full"
          style={{ background: "linear-gradient(90deg, transparent, #42d6ff, #3fd05a, #ffe04a, #ff7b31, #e82f45, #bd44dd)" }}
          aria-hidden="true"
        />
        <div className="mt-1 flex justify-between gap-2" aria-hidden="true">
          <span>Light</span><span>Moderate</span><span>Heavy</span>
        </div>
        <p className="mt-1">Radar reflectivity · precipitation intensity, not a surface total</p>
      </div>
      {(state.status === "loading" || state.status === "refreshing") && !source && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/30" role="status">
          <span className="rounded-xl bg-slate-950/80 px-3 py-2 text-xs">Loading {providerLabel} radar…</span>
        </div>
      )}
    </div>,
    overlayHost
  ) : null;

  return (
    <>
      {overlay}
      <div
        id="radar-map-mode-panel"
        role="tabpanel"
        aria-labelledby="radar-map-tab"
        hidden={!active}
        className="mt-3"
        data-testid="radar-panel"
      >
        <div className="mb-1 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <button
            type="button"
            className={`${CONTROL} min-h-11 gap-1.5 px-3 disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => setPlaying((value) => !value)}
            disabled={frames.length < 2 || reducedMotion}
            aria-label={playing ? "Pause radar animation" : "Play radar animation"}
            title={reducedMotion ? "Playback is off because reduced motion is enabled" : undefined}
          >
            {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {playing ? "Pause" : "Play"}
          </button>
          <span
            className="truncate font-medium"
            aria-live={playing ? "off" : "polite"}
            data-testid="radar-observed-time"
          >
            {observed}
          </span>
          <span className="col-span-2 text-white/60 sm:col-span-1" data-testid="radar-source">
            {provider === "unavailable" ? "Country unknown · radar provider not selected" : `${providerLabel} · observed, not forecast`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={timeIndex}
          disabled={frames.length === 0}
          onChange={(event) => {
            setPlaying(false);
            setSelection({ sourceKey, index: Number(event.currentTarget.value) });
          }}
          className="w-full min-h-11 accent-white"
          aria-label="Radar observation time"
          aria-valuetext={selectedObserved}
          data-testid="radar-time"
        />
        <div className="mt-1 min-h-5 text-[11px] text-white/62">
          {imageError && (
            <span role="alert">
              {imageError}{" "}
              <button
                type="button"
                className={`${CONTROL} ml-1 min-h-11 gap-1 px-2 align-middle underline`}
                onClick={() => {
                  setImageFailure(null);
                  setImageRetryGeneration((value) => value + 1);
                }}
                aria-label="Retry radar imagery"
              >
                <RotateCcw size={11} aria-hidden="true" />Retry imagery
              </button>
            </span>
          )}
          {(state.status === "error" || state.status === "stale") && (
            <span>
              {state.error}{" "}
              <button type="button" className={`${CONTROL} ml-1 min-h-11 gap-1 px-2 align-middle underline`} onClick={retry}>
                <RotateCcw size={11} aria-hidden="true" />Retry radar
              </button>
            </span>
          )}
          {!imageError && source?.provider === "unavailable" && "Radar is unavailable because the location country could not be determined. Search by city or postal code to select the correct provider."}
          {!imageError && source?.provider !== "unavailable" && source?.coverage === "unavailable" && "No radar frames are currently available for this provider."}
          {!imageError && source?.coverage === "available" && (
            <span>
              Coverage varies; a blank layer can mean no precipitation or no radar coverage. Data by{" "}
              <a href={source.attribution.url} target="_blank" rel="noreferrer" className="underline" aria-label={source.attribution.label}>
                {source.attribution.label}
              </a>.
              {reducedMotion ? " Motion reduced; use the slider to inspect observations." : playing ? " Playing recent observations." : " Playback paused."}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
