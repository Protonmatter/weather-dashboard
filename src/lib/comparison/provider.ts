import { fetchJson } from "../http";
import { assertTimeZone, localDateKey } from "../time";
import type { Place } from "../types";
import type { ComparisonDay, ComparisonHour, ComparisonSummary } from "./types";

const FORECAST = "https://api.open-meteo.com/v1/forecast";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`comparison: invalid ${label}`);
  }
  return value as JsonRecord;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`comparison: invalid ${label}`);
  }
  return value;
}

function finiteArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`comparison: invalid ${label}`);
  }
  return value;
}

function unit(units: JsonRecord, field: string, expected: string): void {
  if (units[field] !== expected) {
    throw new Error(`comparison: invalid ${field} unit`);
  }
}

function aligned(label: string, count: number, ...series: readonly number[][]): void {
  if (count < 1 || series.some((values) => values.length !== count)) {
    throw new Error(`comparison: invalid ${label} axis`);
  }
}

function instant(seconds: unknown, label: string): Date {
  const date = new Date(finite(seconds, label) * 1000);
  if (Number.isNaN(date.getTime())) throw new Error(`comparison: invalid ${label}`);
  return date;
}

export function comparisonUrl(place: Pick<Place, "lat" | "lon">): string {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability,precipitation,is_day",
    minutely_15: "rain,showers",
    past_minutely_15: "104",
    forecast_minutely_15: "1",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,uv_index_max",
    temperature_unit: "fahrenheit",
    precipitation_unit: "inch",
    timeformat: "unixtime",
    timezone: "auto",
    forecast_hours: "6",
    forecast_days: "3",
  });
  return `${FORECAST}?${params.toString()}`;
}

export function parseComparisonResponse(
  value: unknown,
  place: Place,
  nowMs = Date.now()
): ComparisonSummary {
  const root = record(value, "response");
  const timezone = assertTimeZone(root.timezone);
  const currentUnits = record(root.current_units, "current units");
  const hourlyUnits = record(root.hourly_units, "hourly units");
  const minutelyUnits = record(root.minutely_15_units, "15-minute units");
  const dailyUnits = record(root.daily_units, "daily units");
  unit(currentUnits, "time", "unixtime");
  unit(currentUnits, "temperature_2m", "°F");
  unit(currentUnits, "apparent_temperature", "°F");
  unit(currentUnits, "relative_humidity_2m", "%");
  unit(hourlyUnits, "time", "unixtime");
  unit(hourlyUnits, "temperature_2m", "°F");
  unit(hourlyUnits, "precipitation_probability", "%");
  unit(hourlyUnits, "precipitation", "inch");
  unit(minutelyUnits, "time", "unixtime");
  unit(minutelyUnits, "rain", "inch");
  unit(minutelyUnits, "showers", "inch");
  unit(dailyUnits, "time", "unixtime");
  unit(dailyUnits, "temperature_2m_max", "°F");
  unit(dailyUnits, "temperature_2m_min", "°F");

  const current = record(root.current, "current conditions");
  const updatedAt = instant(current.time, "current time");
  const humidityPercent = finite(current.relative_humidity_2m, "humidity");
  if (humidityPercent < 0 || humidityPercent > 100) {
    throw new Error("comparison: invalid humidity");
  }

  const hourlyRaw = record(root.hourly, "hourly forecast");
  const hourTimes = finiteArray(hourlyRaw.time, "hourly time");
  const hourTemps = finiteArray(hourlyRaw.temperature_2m, "hourly temperature");
  const hourCodes = finiteArray(hourlyRaw.weather_code, "hourly weather code");
  const hourPop = finiteArray(hourlyRaw.precipitation_probability, "hourly precipitation probability");
  const hourPrecip = finiteArray(hourlyRaw.precipitation, "hourly precipitation");
  const hourDay = finiteArray(hourlyRaw.is_day, "hourly daylight");
  aligned("hourly", hourTimes.length, hourTemps, hourCodes, hourPop, hourPrecip, hourDay);
  if (hourTimes.length < 6) throw new Error("comparison: short hourly axis");
  const hourly: ComparisonHour[] = hourTimes.slice(0, 6).map((seconds, index) => ({
    time: instant(seconds, "hourly time"),
    tempF: hourTemps[index]!,
    code: hourCodes[index]!,
    isDay: hourDay[index] === 1,
    pop: hourPop[index]!,
    precipitationIn: hourPrecip[index]!,
  }));

  const dailyRaw = record(root.daily, "daily forecast");
  const dayTimes = finiteArray(dailyRaw.time, "daily time");
  const dayCodes = finiteArray(dailyRaw.weather_code, "daily weather code");
  const dayHighs = finiteArray(dailyRaw.temperature_2m_max, "daily high");
  const dayLows = finiteArray(dailyRaw.temperature_2m_min, "daily low");
  const dayUv = finiteArray(dailyRaw.uv_index_max, "daily UV");
  aligned("daily", dayTimes.length, dayCodes, dayHighs, dayLows, dayUv);
  if (dayTimes.length < 3) throw new Error("comparison: short daily axis");
  const daily: ComparisonDay[] = dayTimes.slice(0, 3).map((seconds, index) => ({
    date: instant(seconds, "daily time"),
    lowF: dayLows[index]!,
    highF: dayHighs[index]!,
    code: dayCodes[index]!,
  }));

  const minutelyRaw = record(root.minutely_15, "15-minute forecast");
  const rainTimes = finiteArray(minutelyRaw.time, "15-minute time");
  const rain = finiteArray(minutelyRaw.rain, "15-minute rain");
  const showers = finiteArray(minutelyRaw.showers, "15-minute showers");
  aligned("15-minute", rainTimes.length, rain, showers);
  const todayKey = localDateKey(new Date(nowMs), timezone);
  const rainSoFarIn = rainTimes.reduce((total, seconds, index) => {
    const time = instant(seconds, "15-minute time");
    const intervalDay = localDateKey(new Date(time.getTime() - 1), timezone);
    return time <= updatedAt && intervalDay === todayKey
      ? total + rain[index]! + showers[index]!
      : total;
  }, 0);
  const roundedRainSoFarIn = Math.round(rainSoFarIn * 1_000_000) / 1_000_000;

  return {
    place,
    timezone,
    updatedAt,
    current: {
      temperatureF: finite(current.temperature_2m, "temperature"),
      apparentF: finite(current.apparent_temperature, "apparent temperature"),
      code: finite(current.weather_code, "weather code"),
      isDay: finite(current.is_day, "daylight") === 1,
      humidityPercent,
    },
    today: {
      lowF: dayLows[0]!,
      highF: dayHighs[0]!,
      uvMax: dayUv[0]!,
      rainSoFarIn: roundedRainSoFarIn,
    },
    hourly,
    daily,
  };
}

export async function fetchComparison(
  place: Place,
  signal?: AbortSignal
): Promise<ComparisonSummary> {
  const value = await fetchJson<unknown>(comparisonUrl(place), {
    signal,
    retries: 1,
    circuitBreakerScope: "comparison",
  });
  return parseComparisonResponse(value, place);
}
