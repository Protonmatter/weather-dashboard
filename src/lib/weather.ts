import { fetchForecast, fetchAqi, fetchEnsemble } from "./providers/openMeteo";
import { ensembleStats, temperatureStats, synthMembers, precipitationWindow } from "./ensemble";
import { isAbort } from "./http";
import type { Place, WeatherBundle, EnsembleSummary, HourPoint } from "./types";

/**
 * The single seam that knows where ensemble members come from.
 * Repoint this at a fusion layer and every downstream consumer works unchanged.
 */
export async function ensembleFor(
  lat: number,
  lon: number,
  hourly: readonly HourPoint[],
  signal?: AbortSignal,
  referenceMs = Date.now()
): Promise<EnsembleSummary> {
  const window = precipitationWindow(referenceMs, hourly.map(hour => hour.time));
  try {
    const { precip, temp, tempForHours, ...window } = await fetchEnsemble(
      lat, lon, signal, referenceMs, hourly.slice(0, 24).map(hour => hour.time)
    );
    const tempSpread = temperatureStats(tempForHours ?? []);
    return {
      ...ensembleStats(precip),
      ...window,
      source: "GFS ensemble",
      live: true,
      memberSeries: precip,
      ...(temp.length ? { tempMemberSeries: temp } : {}),
      ...(tempSpread.length ? { tempSpread } : {}),
    };
  } catch (err) {
    if (isAbort(err)) throw err;
    const pointHours = new Map(hourly.map(hour => [hour.time.getTime(), hour]));
    const probabilities = window.validTimes.map(time => pointHours.get(time.getTime())?.pop);
    const complete = probabilities.every((pop): pop is number => typeof pop === "number" && Number.isFinite(pop));
    return {
      ...ensembleStats(complete ? synthMembers(probabilities) : []),
      ...window,
      source: complete ? "modeled spread" : "spread unavailable",
      live: false,
    };
  }
}

export async function loadWeather(
  place: Place,
  signal?: AbortSignal
): Promise<WeatherBundle> {
  const { lat, lon } = place;
  const referenceMs = Date.now();

  // Forecast is required; AQI is optional and must not fail the load.
  const [forecast, aqiResult] = await Promise.all([
    fetchForecast(lat, lon, signal, referenceMs),
    fetchAqi(lat, lon, signal).catch((e) => {
      if (isAbort(e)) throw e;
      return null;
    }),
  ]);

  const ensemble = await ensembleFor(lat, lon, forecast.hourly, signal, referenceMs);

  return {
    place,
    current: forecast.current,
    hourly: forecast.hourly,
    daily: forecast.daily,
    aqi: aqiResult,
    ensemble,
    live: true,
    timezone: forecast.timezone,
    updatedAt: forecast.updatedAt,
    rainTodayIn: forecast.rainTodayIn,
  };
}
