import type { RadarFrame, RadarProviderId } from "../radar/types";

export type PrecipitationHorizonHours = 24 | 48;
export type ObservationProviderId = Exclude<RadarProviderId, "unavailable">;

export interface SourceAttribution {
  label: string;
  url: string;
}

export interface ObservationPrecipitationFrame {
  kind: "observation";
  id: string;
  validAt: Date;
  provider: ObservationProviderId;
  radarFrame: RadarFrame;
}

export interface ForecastPrecipitationFrame {
  kind: "forecast";
  id: string;
  validAt: Date;
  provider: "open-meteo-gfs";
  forecastIndex: number;
}

export type PrecipitationFrame =
  | ObservationPrecipitationFrame
  | ForecastPrecipitationFrame;

export interface FuturePrecipitationFrame {
  id: string;
  validAt: Date;
  sourceIndex: number;
}

export interface FuturePrecipitationSource {
  provider: "open-meteo-gfs" | "hrrr-simulated-reflectivity";
  kind: "modeled-precipitation" | "simulated-reflectivity";
  frames: readonly FuturePrecipitationFrame[];
  attribution: SourceAttribution;
  coverage: "available" | "unavailable";
}

export interface PrecipitationTimeline {
  frames: readonly PrecipitationFrame[];
  now: Date;
  nowPercent: number;
  earliestAt: Date | null;
  latestAt: Date | null;
  latestObservationIndex: number | null;
  firstForecastIndex: number | null;
  defaultIndex: number | null;
  horizonHours: PrecipitationHorizonHours;
}

export interface PrecipitationSelection {
  id: string;
  validAtMs: number;
}
