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
  /** Deterministic hour-ending precipitation total, inches. */
  precipitationIn: number;
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
  /** Backward-looking provider interval total, inches. */
  precipitationIn: number;
  /** Current interval normalized to a visual intensity rate, millimetres/hour. */
  precipRateMmH: number;
  /** Total cloud cover, percent. */
  cloudCover: number;
}

export interface HourQuantiles {
  p10: number;
  p50: number;
  p90: number;
  /** Percent of members exceeding a measurable-precipitation threshold. */
  exceed: number;
}

/** Per-hour temperature quantiles across ensemble members, in the source unit (°F). */
export interface TempQuantiles {
  p10: number;
  p50: number;
  p90: number;
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
  /** Raw member-major temperature series (°F), retained only for verification archiving. Live path only. */
  tempMemberSeries?: number[][];
  /**
   * Per-hour temperature spread across ensemble members, aligned to the 24h hourly axis.
   * Present ONLY on the live path — a synthetic ensemble never fabricates a temperature band.
   */
  tempSpread?: TempQuantiles[];
}

export interface WeatherBundle {
  place: Place;
  current: CurrentConditions;
  hourly: HourPoint[];
  daily: DayPoint[];
  aqi: number | null;
  ensemble: EnsembleSummary;
  live: boolean;
  timezone: string;
  timezoneAbbreviation: string;
  utcOffsetSeconds: number;
  updatedAt: Date;
  /** Estimated model/analysis accumulation since local midnight, inches. */
  rainTodayIn: number;
}
