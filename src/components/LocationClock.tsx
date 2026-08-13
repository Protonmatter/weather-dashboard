import { useEffect, useState } from "react";
import { formatLocalDate, formatLocalWallTime, timezoneLabel } from "../lib/time";

export function useClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs]);
  return now;
}

export function LocationClock({ timezone }: { timezone: string }) {
  const now = useClock();
  return (
    <time
      dateTime={now.toISOString()}
      data-testid="location-clock"
      className="inline-flex flex-wrap items-baseline gap-x-2 text-white/70"
    >
      <span className="font-medium tabular-nums text-white/90">{formatLocalWallTime(now, timezone)}</span>
      <span>{timezoneLabel(now, timezone)}</span>
      <span className="text-white/50">{formatLocalDate(now, timezone)}</span>
    </time>
  );
}
