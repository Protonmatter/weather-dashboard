import { recordForecast } from "../lib/verification/store";
import { reconcile, scorecard, type Scorecard } from "../lib/verification/verify";
import type { WeatherBundle } from "../lib/types";

export { scorecard };

/** Collect every live bundle independently of whether the score panel is in view. */
export async function collectVerification(bundle: WeatherBundle, signal: AbortSignal): Promise<Scorecard> {
  recordForecast({
    lat: bundle.place.lat,
    lon: bundle.place.lon,
    members: bundle.ensemble.memberSeries ?? [],
    validTimes: bundle.ensemble.validTimes ?? [],
    live: bundle.live && bundle.ensemble.live,
    tempMembers: bundle.ensemble.tempMemberSeries,
  });
  try {
    await reconcile(signal);
  } catch {
    // Retain locally available scores if reference data cannot be fetched.
  }
  return scorecard();
}
