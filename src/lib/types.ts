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
  /** Daily peak UV index; null when the provider does not supply it. */
  uv: number | null;
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
  /** Horizontal visibility in miles; null when the provider does not supply it. */
  visibility: number | null;
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
  /** Absolute hour-ending precipitation timestamps, one per member-series column. */
  validTimes?: Date[];
  /** Bounds of the complete 24-hour interval, starting on the next complete provider hour. */
  windowStart?: Date;
  windowEnd?: Date;
  /** Raw member-major series, retained only for verification archiving. */
  memberSeries?: number[][];
  /** Raw temperature series (°F) aligned to validTimes for archiving. Live path only. */
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
  updatedAt: Date;
  /** Estimated model/analysis liquid rain plus showers since local midnight, inches. */
  rainTodayIn: number;
}
