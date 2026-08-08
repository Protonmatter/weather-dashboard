import { contourLevels, contourSegments } from "./contours";
import { findPressureExtrema } from "./extrema";
import { bilinearSample } from "./grid";
import type { MapFrame, MapLayer } from "./types";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function fieldColor(layer: MapLayer, value: number): string {
  if (layer === "temperature") {
    const t = clamp01((value + 30) / 70);
    return `hsla(${(225 - t * 225).toFixed(0)}, 82%, 54%, 0.62)`;
  }
  if (layer === "precipitation") {
    if (value < 0.05) return "rgba(0,0,0,0)";
    const t = clamp01(Math.sqrt(value / 10));
    return `hsla(${(205 + t * 55).toFixed(0)}, 90%, ${(70 - t * 28).toFixed(0)}%, ${(0.25 + t * 0.55).toFixed(2)})`;
  }
  const t = clamp01((value - 980) / 60);
  return `hsla(${(218 - t * 190).toFixed(0)}, 68%, 53%, 0.38)`;
}

const valuesForLayer = (frame: MapFrame, layer: MapLayer): Array<number | null> => {
  if (layer === "temperature") return frame.temperatureC;
  if (layer === "precipitation") return frame.precipitationMm;
  return frame.pressureHpa;
};

/** Canvas angle for an arrow that points toward flow from a meteorological "from" bearing. */
export const windFlowAngle = (fromDegrees: number): number =>
  ((fromDegrees + 180 - 90) * Math.PI) / 180;

function drawField(
  context: CanvasRenderingContext2D,
  frame: MapFrame,
  layer: MapLayer,
  rows: number,
  cols: number,
  width: number,
  height: number
): void {
  const values = valuesForLayer(frame, layer);
  const block = 5;
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      const value = bilinearSample(values, rows, cols, (x + block / 2) / width, (y + block / 2) / height);
      if (value == null) continue;
      context.fillStyle = fieldColor(layer, value);
      context.fillRect(x, y, block + 1, block + 1);
    }
  }
}

function drawPressure(
  context: CanvasRenderingContext2D,
  frame: MapFrame,
  rows: number,
  cols: number,
  width: number,
  height: number
): void {
  context.save();
  context.strokeStyle = "rgba(255,255,255,0.88)";
  context.lineWidth = 1.1;
  context.font = "600 10px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const level of contourLevels(frame.pressureHpa, 4)) {
    const segments = contourSegments(frame.pressureHpa, rows, cols, level, width, height);
    context.beginPath();
    for (const segment of segments) {
      context.moveTo(segment.a.x, segment.a.y);
      context.lineTo(segment.b.x, segment.b.y);
    }
    context.stroke();

    const label = segments
      .filter((segment) => Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) > 20)
      .sort((a, b) => {
        const am = Math.hypot((a.a.x + a.b.x) / 2 - width / 2, (a.a.y + a.b.y) / 2 - height / 2);
        const bm = Math.hypot((b.a.x + b.b.x) / 2 - width / 2, (b.a.y + b.b.y) / 2 - height / 2);
        return am - bm;
      })[0];
    if (label) {
      const x = (label.a.x + label.b.x) / 2;
      const y = (label.a.y + label.b.y) / 2;
      const text = String(level);
      const measured = context.measureText(text).width;
      context.fillStyle = "rgba(18,27,43,0.78)";
      context.fillRect(x - measured / 2 - 3, y - 7, measured + 6, 14);
      context.fillStyle = "white";
      context.fillText(text, x, y);
    }
  }

  for (const item of findPressureExtrema(frame.pressureHpa, rows, cols, width, height)) {
    context.beginPath();
    context.fillStyle = item.kind === "H" ? "rgba(230,62,76,0.92)" : "rgba(49,112,225,0.92)";
    context.arc(item.x, item.y, 15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "white";
    context.font = "700 15px system-ui, sans-serif";
    context.fillText(item.kind, item.x, item.y - 1);
    context.font = "600 9px system-ui, sans-serif";
    context.fillText(String(Math.round(item.value)), item.x, item.y + 20);
  }
  context.restore();
}

function drawWind(
  context: CanvasRenderingContext2D,
  frame: MapFrame,
  rows: number,
  cols: number,
  width: number,
  height: number
): void {
  context.save();
  context.strokeStyle = "rgba(255,255,255,0.92)";
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.lineWidth = 1.4;
  for (let row = 0; row < rows; row += 2) {
    for (let col = 0; col < cols; col += 2) {
      const index = row * cols + col;
      const speed = frame.windKmh[index];
      const from = frame.windFromDeg[index];
      if (speed == null || from == null) continue;
      const x = (col / (cols - 1)) * width;
      const y = (row / (rows - 1)) * height;
      const length = 10 + Math.min(14, speed / 5);
      const angle = windFlowAngle(from);
      const dx = Math.cos(angle) * length;
      const dy = Math.sin(angle) * length;
      const endX = x + dx;
      const endY = y + dy;
      context.beginPath();
      context.moveTo(x - dx * 0.3, y - dy * 0.3);
      context.lineTo(endX, endY);
      context.stroke();
      context.beginPath();
      context.moveTo(endX, endY);
      context.lineTo(endX - Math.cos(angle - 0.55) * 5, endY - Math.sin(angle - 0.55) * 5);
      context.lineTo(endX - Math.cos(angle + 0.55) * 5, endY - Math.sin(angle + 0.55) * 5);
      context.closePath();
      context.fill();
    }
  }
  context.restore();
}

export interface RenderMapOptions {
  canvas: HTMLCanvasElement;
  frame: MapFrame;
  layer: MapLayer;
  rows: number;
  cols: number;
  width: number;
  height: number;
  wind: boolean;
}

export function renderMap(options: RenderMapOptions): void {
  const { canvas, frame, layer, rows, cols, width, height, wind } = options;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  drawField(context, frame, layer, rows, cols, width, height);
  if (layer === "pressure") drawPressure(context, frame, rows, cols, width, height);
  if (wind) drawWind(context, frame, rows, cols, width, height);
}

const finiteRange = (values: readonly (number | null)[]): readonly [number, number] | null => {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length ? [Math.min(...finite), Math.max(...finite)] : null;
};

export function frameSummary(frame: MapFrame, layer: MapLayer, unit: "F" | "C"): string {
  const range = finiteRange(valuesForLayer(frame, layer));
  if (!range) return `${layer} forecast unavailable for this frame`;
  if (layer === "temperature") {
    const convert = (c: number): number => unit === "F" ? c * 9 / 5 + 32 : c;
    return `Temperature forecast ${Math.round(convert(range[0]))} to ${Math.round(convert(range[1]))} degrees ${unit}`;
  }
  if (layer === "precipitation") {
    return `Hour-ending forecast precipitation ${range[0].toFixed(1)} to ${range[1].toFixed(1)} millimetres`;
  }
  return `Mean-sea-level pressure forecast ${Math.round(range[0])} to ${Math.round(range[1])} hectopascals`;
}
