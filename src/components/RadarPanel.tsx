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

const CONTROL = "inline-flex items-center justify-center rounded-xl border border-white/20 bg-slate-950/55 text-white focus:outline-none focus:ring-2 focus:ring-white/80";
const PLAYBACK_INTERVAL_MS = 900;

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
  const [selection, setSelection] = useState<{ sourceKey: string; index: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const frames = source?.frames ?? [];
  const sourceKey = source ? `${source.provider}:${source.fetchedAt}:${frames.at(-1)?.id ?? "empty"}` : "loading";
  const timeIndex = selection?.sourceKey === sourceKey
    ? Math.min(selection.index, Math.max(0, frames.length - 1))
    : Math.max(0, frames.length - 1);
  const frame = frames[timeIndex] ?? null;
  const provider = radarProviderFor(place);
  const providerLabel = provider === "noaa-mrms" ? "NOAA / NWS MRMS" : "RainViewer";

  useEffect(() => {
    setPlaying(false);
  }, [sourceKey]);

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  useEffect(() => {
    if (!active || !playing || reducedMotion || !mapVisible || !pageVisible || frames.length < 2) return;
    const timer = window.setInterval(() => {
      setSelection((current) => {
        const index = current?.sourceKey === sourceKey ? current.index : frames.length - 1;
        return { sourceKey, index: (index + 1) % frames.length };
      });
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, frames.length, mapVisible, pageVisible, playing, reducedMotion, sourceKey]);

  const tiles = useMemo(() => visibleTiles(viewport), [viewport]);
  const observed = frame ? frameTime(frame.validAt, timezone) : "Observation time unavailable";
  const radarLabel = frame
    ? `${providerLabel} radar observation for ${place.name}. Observed ${observed}.`
    : `${providerLabel} radar for ${place.name} is unavailable.`;

  const overlay = overlayHost ? createPortal(
    <div className="absolute inset-0 z-10 pointer-events-none" hidden={!active} data-testid="radar-overlay">
      {source?.provider === "noaa-mrms" && frame && size.width > 0 && (
        <img
          key={`${frame.id}:${viewport.center.lat}:${viewport.center.lon}:${viewport.zoom}:${size.width}:${size.height}`}
          src={noaaImageUrl(frame, viewport, size)}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-fill"
          data-testid="radar-noaa-image"
        />
      )}
      {source?.provider === "rainviewer" && source.imageHost && frame && tiles.map((tile) => (
        <img
          key={`${frame.id}:${tile.z}/${tile.worldX}/${tile.y}`}
          src={rainViewerTileUrl(frame, source.imageHost!, tile)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute max-w-none select-none"
          style={{ width: 256, height: 256, left: tile.left, top: tile.top }}
        />
      ))}
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
          <span className="truncate font-medium" aria-live={playing ? "off" : "polite"}>{observed}</span>
          <span className="col-span-2 text-white/60 sm:col-span-1" data-testid="radar-source">
            {providerLabel} · observed, not forecast
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
          aria-valuetext={observed}
          data-testid="radar-time"
        />
        <div className="mt-1 min-h-5 text-[11px] text-white/62">
          {(state.status === "error" || state.status === "stale") && (
            <span>
              {state.error}{" "}
              <button type="button" className={`${CONTROL} ml-1 min-h-11 gap-1 px-2 align-middle underline`} onClick={retry}>
                <RotateCcw size={11} aria-hidden="true" />Retry radar
              </button>
            </span>
          )}
          {source?.coverage === "unavailable" && "No radar frames are currently available for this provider."}
          {source?.coverage === "available" && (
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
