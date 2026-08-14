import { useEffect, useRef } from "react";
import { frameAt } from "../lib/map/grid";
import { renderMap } from "../lib/map/render";
import type { MapForecastGrid, MapViewport } from "../lib/map/types";

export interface ForecastPrecipitationLayerProps {
  active: boolean;
  grid: MapForecastGrid | null;
  forecastIndex: number | null;
  viewport: MapViewport;
  ariaLabel: string;
}

/** Renders one already-loaded GFS precipitation frame without issuing another request. */
export function ForecastPrecipitationLayer({
  active,
  grid,
  forecastIndex,
  viewport,
  ariaLabel,
}: ForecastPrecipitationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!active || !grid || forecastIndex == null) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    renderMap({
      canvas,
      frame: frameAt(grid, forecastIndex),
      layer: "precipitation",
      rows: grid.rows,
      cols: grid.cols,
      width: viewport.width,
      height: viewport.height,
      wind: false,
    });
  }, [active, forecastIndex, grid, viewport.height, viewport.width]);

  return (
    <canvas
      ref={canvasRef}
      hidden={!active}
      className="absolute inset-0 pointer-events-none"
      role="img"
      aria-label={ariaLabel}
      data-testid="precipitation-forecast-overlay"
    />
  );
}
