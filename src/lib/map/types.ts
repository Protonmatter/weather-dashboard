import type { Place } from "../types";

export type MapLayer = "pressure" | "temperature" | "precipitation";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface MapViewport {
  center: GeoPoint;
  zoom: number;
  width: number;
  height: number;
}

export interface MapGridPoint extends GeoPoint {
  row: number;
  col: number;
}

export interface MapGridSpec {
  key: string;
  rows: number;
  cols: number;
  points: MapGridPoint[];
  viewport: MapViewport;
}

export interface MapForecastPoint {
  requested: MapGridPoint;
  resolved: GeoPoint;
  temperatureC: Array<number | null>;
  pressureHpa: Array<number | null>;
  precipitationMm: Array<number | null>;
  windKmh: Array<number | null>;
  windFromDeg: Array<number | null>;
}

export interface MapForecastGrid {
  key: string;
  rows: number;
  cols: number;
  times: string[];
  points: MapForecastPoint[];
  fetchedAt: number;
}

export interface MapFrame {
  time: string;
  temperatureC: Array<number | null>;
  pressureHpa: Array<number | null>;
  precipitationMm: Array<number | null>;
  windKmh: Array<number | null>;
  windFromDeg: Array<number | null>;
}

export interface MapProps {
  place: Place;
  target: "phone" | "tablet" | "cinema";
  unit: "F" | "C";
  enabled: boolean;
}
