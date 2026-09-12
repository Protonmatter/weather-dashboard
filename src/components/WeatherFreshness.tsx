import { useClock } from "./LocationClock";

export function WeatherFreshness({ updatedAt, live, refreshing, failed }: {
  updatedAt: Date; live: boolean; refreshing: boolean; failed: boolean;
}) {
  const now = useClock(60_000);
  const age = Math.max(0, Math.floor((+now - +updatedAt) / 60_000));
  return <p className="mb-3 text-xs text-white/75" data-testid="weather-freshness" role="status">
    {live ? "Open-Meteo" : "Sample forecast"} · Updated {age} min ago
    {refreshing ? " · Refreshing…" : failed ? " · Refresh failed; retained forecast" : live && age >= 10 ? " · Stale forecast" : ""}
  </p>;
}
