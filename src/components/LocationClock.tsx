import { useEffect, useState } from "react";
import { formatLocalDate, formatLocalWallTime, timezoneLabel } from "../lib/time";

export function LocationClock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setNow(new Date());
    let interval: number | undefined;
    const delay = 1000 - (Date.now() % 1000);
    const timeout = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 1000);
    }, delay);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [timezone]);

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
