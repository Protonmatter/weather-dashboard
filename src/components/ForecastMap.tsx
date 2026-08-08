import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon, Minus, Navigation, Plus, RotateCcw, Wind } from "lucide-react";
import { Card } from "./Card";
import { useForecastMap } from "../hooks/useForecastMap";
import { createGridSpec, frameAt, mapHeightForTarget } from "../lib/map/grid";
import { frameSummary, renderMap } from "../lib/map/render";
import { geoToScreen, panViewport, visibleTiles } from "../lib/map/mercator";
import { tileProviderConfig } from "../lib/map/config";
import type { MapLayer, MapProps, MapViewport } from "../lib/map/types";

const MIN_ZOOM = 2;
const MAX_ZOOM = 7;
const CONTROL = "inline-flex items-center justify-center rounded-xl border border-white/20 bg-slate-950/55 text-white focus:outline-none focus:ring-2 focus:ring-white/80";

const validTime = (raw: string): string => {
  const date = new Date(`${raw}Z`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
};

const layerLabel: Record<MapLayer, string> = {
  pressure: "Pressure",
  temperature: "Temperature",
  precipitation: "Precipitation",
};

function legend(layer: MapLayer, unit: "F" | "C"): { stops: string; labels: string[]; note: string } {
  if (layer === "temperature") {
    return {
      stops: "#315ddc, #35c8db, #f4cf4d, #e43e4c",
      labels: unit === "F" ? ["-22°F", "32°F", "68°F", "104°F"] : ["-30°C", "0°C", "20°C", "40°C"],
      note: "2 m air temperature",
    };
  }
  if (layer === "precipitation") {
    return {
      stops: "rgba(0,0,0,0), #4fc3f7, #4464d9, #6d2ab3",
      labels: ["0", "1", "5", "10+ mm"],
      note: "Hour-ending forecast total — not radar",
    };
  }
  return {
    stops: "#315ddc, #67a8d8, #d5b66a, #d84444",
    labels: ["980", "1000", "1020", "1040 hPa"],
    note: "Mean-sea-level pressure; contours every 4 hPa",
  };
}

export default function ForecastMap({ place, target, unit, enabled }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchScale = useRef(1);
  const targetHeight = mapHeightForTarget(target);
  const [size, setSize] = useState({ width: 0, height: targetHeight });
  const [viewport, setViewport] = useState<MapViewport>({
    center: { lat: place.lat, lon: place.lon },
    zoom: target === "phone" ? 4 : 5,
    width: 0,
    height: size.height,
  });
  const [layer, setLayer] = useState<MapLayer>("pressure");
  const [wind, setWind] = useState(true);
  const [timeIndex, setTimeIndex] = useState(0);

  const tileConfig = useMemo(() => {
    try {
      return tileProviderConfig();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      setSize((current) => ({ ...current, width }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSize((current) => current.height === targetHeight ? current : { ...current, height: targetHeight });
  }, [targetHeight]);

  useEffect(() => {
    setViewport((current) => ({
      ...current,
      center: { lat: place.lat, lon: place.lon },
      zoom: target === "phone" ? 4 : 5,
    }));
    setTimeIndex(0);
  }, [place.lat, place.lon, target]);

  useEffect(() => {
    setViewport((current) => ({ ...current, width: size.width, height: size.height }));
  }, [size]);

  const spec = useMemo(
    () => viewport.width > 0 && viewport.height > 0 ? createGridSpec(viewport, target) : null,
    [target, viewport]
  );
  const { state, retry } = useForecastMap(spec, enabled);
  const grid = state.data?.key === spec?.key ? state.data : null;
  const frame = grid ? frameAt(grid, timeIndex) : null;

  useEffect(() => {
    if (grid && timeIndex >= grid.times.length) setTimeIndex(grid.times.length - 1);
  }, [grid, timeIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!frame || !grid) {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    renderMap({
      canvas,
      frame,
      layer,
      rows: grid.rows,
      cols: grid.cols,
      width: viewport.width,
      height: viewport.height,
      wind,
    });
  }, [frame, grid, layer, viewport.height, viewport.width, wind]);

  const changeZoom = (delta: number): void => {
    setViewport((current) => ({
      ...current,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(current.zoom + delta))),
    }));
  };

  const recenter = (): void => {
    setViewport((current) => ({ ...current, center: { lat: place.lat, lon: place.lon } }));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.current.values()];
    if (after.length === 1) {
      setViewport((current) => panViewport(current, event.clientX - previous.x, event.clientY - previous.y));
      return;
    }
    if (after.length === 2 && before.length === 2) {
      const oldCenter = { x: (before[0]!.x + before[1]!.x) / 2, y: (before[0]!.y + before[1]!.y) / 2 };
      const newCenter = { x: (after[0]!.x + after[1]!.x) / 2, y: (after[0]!.y + after[1]!.y) / 2 };
      setViewport((current) => panViewport(current, newCenter.x - oldCenter.x, newCenter.y - oldCenter.y));
      const oldDistance = Math.hypot(before[0]!.x - before[1]!.x, before[0]!.y - before[1]!.y);
      const newDistance = Math.hypot(after[0]!.x - after[1]!.x, after[0]!.y - after[1]!.y);
      if (oldDistance > 0) pinchScale.current *= newDistance / oldDistance;
      if (pinchScale.current >= 1.25) {
        changeZoom(1);
        pinchScale.current = 1;
      } else if (pinchScale.current <= 0.8) {
        changeZoom(-1);
        pinchScale.current = 1;
      }
    }
  };

  const releasePointer = (event: React.PointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchScale.current = 1;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const pan: Record<string, readonly [number, number]> = {
      ArrowLeft: [64, 0],
      ArrowRight: [-64, 0],
      ArrowUp: [0, 64],
      ArrowDown: [0, -64],
    };
    if (event.key in pan) {
      event.preventDefault();
      const [dx, dy] = pan[event.key]!;
      setViewport((current) => panViewport(current, dx, dy));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      changeZoom(1);
    } else if (event.key === "-") {
      event.preventDefault();
      changeZoom(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      recenter();
    }
  };

  const tiles = tileConfig ? visibleTiles(viewport) : [];
  const marker = geoToScreen({ lat: place.lat, lon: place.lon }, viewport);
  const currentLegend = legend(layer, unit);
  const summary = frame
    ? `${frameSummary(frame, layer, unit)}. Valid ${validTime(frame.time)}. Wind arrows ${wind ? "shown" : "hidden"}.`
    : `Forecast map centred on ${place.name}. Forecast field not loaded.`;
  const busy = state.status === "loading" || state.status === "refreshing" || (!!state.data && !grid);

  return (
    <Card title="48-hour forecast map" icon={MapIcon} className="mt-4" data-testid="forecast-map-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Forecast map layer">
          {(Object.keys(layerLabel) as MapLayer[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`${CONTROL} px-3 min-h-11 text-xs ${layer === value ? "bg-white/25" : ""}`}
              aria-pressed={layer === value}
              onClick={() => setLayer(value)}
            >
              {layerLabel[value]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${CONTROL} gap-1.5 px-3 min-h-11 text-xs ${wind ? "bg-white/25" : ""}`}
          aria-pressed={wind}
          onClick={() => setWind((value) => !value)}
        >
          <Wind size={14} aria-hidden="true" /> Wind
        </button>
      </div>

      <div
        ref={mapRef}
        className="relative overflow-hidden rounded-2xl bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-white/80"
        style={{ height: size.height, touchAction: "none", userSelect: "none" }}
        tabIndex={0}
        role="region"
        aria-label="Interactive forecast map. Arrow keys pan, plus and minus zoom, Home recentres."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onWheel={(event) => {
          event.preventDefault();
          changeZoom(event.deltaY < 0 ? 1 : -1);
        }}
        data-testid="forecast-map-viewport"
      >
        <div className="absolute inset-0 bg-slate-700" aria-hidden="true">
          {tiles.map((tile) => (
            <img
              key={`${tile.z}/${tile.worldX}/${tile.y}`}
              src={tileConfig!.template
                .replace("{z}", String(tile.z))
                .replace("{x}", String(tile.x))
                .replace("{y}", String(tile.y))}
              alt=""
              draggable={false}
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute max-w-none select-none"
              style={{ width: 256, height: 256, left: tile.left, top: tile.top }}
            />
          ))}
        </div>
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" role="img" aria-label={summary} />

        {marker.x >= 0 && marker.x <= viewport.width && marker.y >= 0 && marker.y <= viewport.height && (
          <div
            className="absolute -ml-2 -mt-2 h-4 w-4 rounded-full border-2 border-white bg-sky-400 shadow-lg"
            style={{ left: marker.x, top: marker.y }}
            aria-hidden="true"
          />
        )}

        <div className="absolute left-2 top-2 flex flex-col gap-1" aria-label="Map navigation controls">
          <button type="button" className={`${CONTROL} h-11 w-11`} onClick={() => changeZoom(1)} aria-label="Zoom in">
            <Plus size={18} aria-hidden="true" />
          </button>
          <button type="button" className={`${CONTROL} h-11 w-11`} onClick={() => changeZoom(-1)} aria-label="Zoom out">
            <Minus size={18} aria-hidden="true" />
          </button>
          <button type="button" className={`${CONTROL} h-11 w-11`} onClick={recenter} aria-label={`Recenter on ${place.name}`}>
            <Navigation size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="absolute bottom-2 left-2 max-w-[70%] rounded-lg bg-slate-950/70 px-2 py-1 text-[10px] text-white/90">
          <div className="h-1.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${currentLegend.stops})` }} aria-hidden="true" />
          <div className="mt-1 flex justify-between gap-2" aria-hidden="true">
            {currentLegend.labels.map((label) => <span key={label}>{label}</span>)}
          </div>
          <p className="mt-1">{currentLegend.note}{wind ? " · arrows point toward motion" : ""}</p>
        </div>

        {tileConfig && (
          <a
            className="absolute bottom-1 right-1 rounded bg-slate-950/75 px-1.5 py-1 text-[9px] text-white underline"
            href={tileConfig.attributionUrl}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {tileConfig.attribution}
          </a>
        )}

        {busy && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/30" role="status">
            <span className="rounded-xl bg-slate-950/75 px-3 py-2 text-xs">Loading forecast field…</span>
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
          <span className="font-medium">{frame ? validTime(frame.time) : "Valid time unavailable"}</span>
          <span className="text-white/60">UTC · {viewport.zoom.toFixed(0)}×</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, (grid?.times.length ?? 1) - 1)}
          value={Math.min(timeIndex, Math.max(0, (grid?.times.length ?? 1) - 1))}
          disabled={!grid}
          onChange={(event) => setTimeIndex(Number(event.currentTarget.value))}
          className="w-full min-h-11 accent-white"
          aria-label="Forecast valid time"
          aria-valuetext={frame ? validTime(frame.time) : "Unavailable"}
          data-testid="forecast-map-time"
        />
      </div>

      <div className="mt-1 min-h-5 text-[11px] text-white/62" aria-live="polite">
        {!enabled && "Map waits for a live selected-place forecast."}
        {(state.status === "stale" || state.status === "error") && (
          <span>
            {state.error}{" "}
            <button
              type="button"
              className={`${CONTROL} ml-1 min-h-11 min-w-11 gap-1 px-2 align-middle underline`}
              onClick={retry}
            >
              <RotateCcw size={11} aria-hidden="true" />Retry
            </button>
          </span>
        )}
        {grid && frame && state.status !== "stale" && frameSummary(frame, layer, unit)}
        {!tileConfig && " Base tiles are unavailable because tile configuration is invalid."}
      </div>
    </Card>
  );
}
