import { fetchForecast, fetchAqi, fetchEnsemble } from "./providers/openMeteo";
import { ensembleStats, temperatureStats, synthMembers } from "./ensemble";
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
  signal?: AbortSignal
): Promise<EnsembleSummary> {
  try {
    const { precip, temp } = await fetchEnsemble(lat, lon, signal);
    const tempSpread = temperatureStats(temp);
    return {
      ...ensembleStats(precip),
      source: "GFS ensemble",
      live: true,
      memberSeries: precip,
      ...(temp.length ? { tempMemberSeries: temp } : {}),
      ...(tempSpread.length ? { tempSpread } : {}),
    };
  } catch (err) {
    if (isAbort(err)) throw err;
    return {
      // The synthetic spread models the same 24h window a live ensemble covers.
      ...ensembleStats(synthMembers(hourly.slice(0, 24).map((h) => h.pop))),
      source: "modeled spread",
      live: false,
    };
  }
}

export async function loadWeather(
  place: Place,
  signal?: AbortSignal
): Promise<WeatherBundle> {
  const { lat, lon } = place;

  // Forecast is required; AQI is optional and must not fail the load.
  const [forecast, aqiResult] = await Promise.all([
    fetchForecast(lat, lon, signal),
    fetchAqi(lat, lon, signal).catch((e) => {
      if (isAbort(e)) throw e;
      return null;
    }),
  ]);

  const ensemble = await ensembleFor(lat, lon, forecast.hourly, signal);

  return {
    place,
    current: forecast.current,
    hourly: forecast.hourly,
    daily: forecast.daily,
    aqi: aqiResult,
    ensemble,
    live: true,
    timezone: forecast.timezone,
    timezoneAbbreviation: forecast.timezoneAbbreviation,
    utcOffsetSeconds: forecast.utcOffsetSeconds,
    updatedAt: forecast.updatedAt,
    rainTodayIn: forecast.rainTodayIn,
  };
}
