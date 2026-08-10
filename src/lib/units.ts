import { formatLocalHour, formatLocalTime } from "./time";

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const f2c = (f: number): number => (f - 32) * (5 / 9);

/** Cold-to-hot ramp, deep blue through cyan and amber to red. Input is degrees F. */
export function tempColor(f: number): string {
  const t = clamp((f - 15) / 85, 0, 1);
  const hue = 225 - 225 * Math.pow(t, 0.92);
  const sat = 72 + 20 * t;
  const light = 52 + 8 * (1 - Math.abs(t - 0.5) * 2);
  return `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
}

export const uvLabel = (v: number): string =>
  v <= 2 ? "Low" : v <= 5 ? "Moderate" : v <= 7 ? "High" : v <= 10 ? "Very High" : "Extreme";

export const AQI_BANDS: ReadonlyArray<readonly [number, string, string]> = [
  [50, "Good", "#3fd67c"],
  [100, "Moderate", "#f7d94c"],
  [150, "Unhealthy for Some", "#f79a3e"],
  [200, "Unhealthy", "#ee5b5b"],
  [300, "Very Unhealthy", "#a25ddc"],
  [500, "Hazardous", "#8b3a4d"],
];

export const aqiBand = (v: number): readonly [number, string, string] =>
  AQI_BANDS.find((b) => v <= b[0]) ?? AQI_BANDS[AQI_BANDS.length - 1]!;

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function fmtHour(d: Date, timeZone?: string): string {
  if (timeZone) return formatLocalHour(d, timeZone);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "AM" : "PM"}`;
}

export function fmtClock(d: Date, timeZone?: string): string {
  if (timeZone) return formatLocalTime(d, timeZone);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** Regional-indicator flag from an ISO-3166 alpha-2 code. */
export const flag = (cc: string): string =>
  cc && cc.length === 2
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : "";
