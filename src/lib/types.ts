/** Domain types. Provider responses are validated at the boundary in `providers/`. */

export interface Place {
  lat: number;
  lon: number;
  name: string;
  admin: string;
  country: string;
  cc: string;
  postcode?: string;
  population?: number;
  /** Exact postal-code or coordinate hit; ranked above fuzzy matches. */
  exact?: boolean;
  source?: "open-meteo" | "zippopotam" | "photon" | "coords" | "device";
}

export interface HourPoint {
  time: Date;
  temp: number;
  code: number;
  isDay: boolean;
  pop: number;
}

export interface DayPoint {
  date: Date;
  low: number;
  high: number;
  code: number;
  uv: number;
  sunrise: Date | null;
  sunset: Date | null;
}

export interface CurrentConditions {
  temp: number;
  feels: number;
  code: number;
  isDay: boolean;
  humidity: number;
  wind: number;
  visibility: number;
  pressure: number;
}

export interface HourQuantiles {
  p10: number;
  p50: number;
  p90: number;
  /** Percent of members exceeding a measurable-precipitation threshold. */
  exceed: number;
}

export interface EnsembleSummary {
  n: number;
  perHour: HourQuantiles[];
  /** 24h accumulation quantiles, inches. */
  t10: number;
  t50: number;
  t90: number;
  /** Percent of members whose 24h total clears MEASURABLE_24H. */
  pop24: number;
  peak: number;
  wettest: number;
  source: string;
  /** False when members are synthetic. Never present synthetic data as real. */
  live: boolean;
  /** Raw member-major series, retained only for verification archiving. */
  memberSeries?: number[][];
}

export interface WeatherBundle {
  place: Place;
  current: CurrentConditions;
  hourly: HourPoint[];
  daily: DayPoint[];
  aqi: number | null;
  ensemble: EnsembleSummary;
  live: boolean;
}
