import type { Place } from "../types";

export interface ComparisonHour {
  time: Date;
  tempF: number;
  code: number;
  isDay: boolean;
  pop: number;
  precipitationIn: number;
}

export interface ComparisonDay {
  date: Date;
  lowF: number;
  highF: number;
  code: number;
}

export interface ComparisonSummary {
  place: Place;
  timezone: string;
  updatedAt: Date;
  current: {
    temperatureF: number;
    apparentF: number;
    code: number;
    isDay: boolean;
    humidityPercent: number;
  };
  today: {
    lowF: number;
    highF: number;
    uvMax: number;
    rainSoFarIn: number;
  };
  hourly: readonly ComparisonHour[];
  daily: readonly ComparisonDay[];
}

export type ComparisonCardState =
  | { id: string; place: Place; status: "loading" }
  | { id: string; place: Place; status: "refreshing"; summary: ComparisonSummary }
  | { id: string; place: Place; status: "ready"; summary: ComparisonSummary }
  | { id: string; place: Place; status: "stale"; summary: ComparisonSummary; error: string }
  | { id: string; place: Place; status: "error"; error: string };

export interface ComparisonCacheEntry {
  summary: ComparisonSummary;
  storedAt: number;
}

export type ComparisonCache = Map<string, ComparisonCacheEntry>;
