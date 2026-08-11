import { useEffect, useState } from "react";
import { useComparison } from "../hooks/useComparison";
import type { ComparisonCache, ComparisonCardState } from "../lib/comparison/types";
import { formatLocalHour, formatLocalTime, formatLocalWeekday, timezoneLabel } from "../lib/time";
import type { Place } from "../lib/types";
import { f2c } from "../lib/units";
import { decodeWMO } from "../lib/wmo";

interface Props {
  places: readonly Place[];
  unit: "F" | "C";
  cache: ComparisonCache;
  onOpenFull: (place: Place) => void;
}

const surface = {
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.16)",
  backdropFilter: "blur(28px) saturate(150%)",
  WebkitBackdropFilter: "blur(28px) saturate(150%)",
};

function SummaryCard({ card, unit, now, onOpen, onRetry }: {
  card: ComparisonCardState;
  unit: "F" | "C";
  now: Date;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const T = (fahrenheit: number): number => Math.round(unit === "F" ? fahrenheit : f2c(fahrenheit));
  const summary = "summary" in card ? card.summary : null;

  return (
    <article
      className="min-w-0 rounded-3xl p-4 sm:p-5"
      style={surface}
      data-testid="comparison-card"
      data-status={card.status}
      aria-busy={card.status === "loading" || card.status === "refreshing" || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{card.place.name}</h2>
          <p className="truncate text-xs text-white/55">
            {[card.place.admin, card.place.country].filter(Boolean).join(", ")}
          </p>
        </div>
        {summary && (
          <div className="shrink-0 text-right">
            <span className="block text-[10px] uppercase tracking-wider text-white/45">Local time</span>
            <time className="text-sm font-medium">
              {formatLocalTime(now, summary.timezone)} {timezoneLabel(now, summary.timezone)}
            </time>
          </div>
        )}
      </div>

      {!summary && card.status === "loading" && (
        <p className="mt-8 min-h-64 text-sm text-white/60" role="status">Loading summary…</p>
      )}

      {!summary && card.status === "error" && (
        <div className="mt-8 min-h-64" role="status">
          <p className="text-sm text-white/70">{card.error}</p>
          <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-white/15 px-4 py-2.5 text-sm" aria-label={`Retry ${card.place.name} comparison`}>
            Retry
          </button>
        </div>
      )}

      {summary && (() => {
        const condition = decodeWMO(summary.current.code, summary.current.isDay);
        const ConditionIcon = condition.Icon;
        return (
          <>
            <div className="mt-5 flex items-end justify-between gap-3">
              <div className="flex items-center gap-3">
                <ConditionIcon size={30} aria-hidden="true" />
                <div>
                  <p className="text-4xl font-light" data-testid="comparison-temperature">{T(summary.current.temperatureF)}°</p>
                  <p className="text-xs text-white/60">Feels {T(summary.current.apparentF)}°</p>
                </div>
              </div>
              <div className="text-right text-sm">
                <p>{condition.label}</p>
                <p className="text-xs text-white/55">H {T(summary.today.highF)}° · L {T(summary.today.lowF)}°</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/[0.07] px-2 py-3"><dt className="text-[10px] uppercase tracking-wide text-white/50">Humidity</dt><dd className="mt-1 text-sm font-semibold">{Math.round(summary.current.humidityPercent)}%</dd></div>
              <div className="rounded-2xl bg-white/[0.07] px-2 py-3"><dt className="text-[10px] uppercase tracking-wide text-white/50">UV</dt><dd className="mt-1 text-sm font-semibold">{Math.round(summary.today.uvMax)}</dd></div>
              <div className="rounded-2xl bg-white/[0.07] px-2 py-3"><dt className="text-[10px] uppercase tracking-wide text-white/50">Rain today</dt><dd className="mt-1 text-sm font-semibold">{summary.today.rainSoFarIn.toFixed(2)} in</dd></div>
            </dl>

            <section className="mt-5" aria-label={`${card.place.name} next six hours`}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Next 6 hours</h3>
              <div className="mt-2 grid grid-cols-6 gap-1">
                {summary.hourly.map((hour) => {
                  const label = decodeWMO(hour.code, hour.isDay).label;
                  return (
                    <div
                      key={hour.time.toISOString()}
                      className="min-w-0 text-center"
                      data-testid="comparison-hour"
                      aria-label={`${label}, ${Math.round(hour.pop)}% chance, ${hour.precipitationIn.toFixed(2)} inches`}
                    >
                      <time className="block text-[9px] text-white/50">{formatLocalHour(hour.time, summary.timezone)}</time>
                      <span className="mt-1 block truncate text-[8px] text-white/55" title={label}>{label}</span>
                      <span className="block text-xs font-medium">{T(hour.tempF)}°</span>
                      <span className="block text-[9px] text-sky-200">{Math.round(hour.pop)}%</span>
                      <span className="block text-[8px] text-white/45">{hour.precipitationIn.toFixed(2)} in</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-5" aria-label={`${card.place.name} next three days`}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Next 3 days</h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {summary.daily.map((day) => {
                  const label = decodeWMO(day.code).label;
                  return (
                    <div key={day.date.toISOString()} className="rounded-xl bg-white/[0.06] p-2 text-center" data-testid="comparison-day">
                      <time className="block text-[10px] text-white/55">{formatLocalWeekday(day.date, summary.timezone)}</time>
                      <span className="mt-1 block truncate text-[9px] text-white/60" title={label}>{label}</span>
                      <span className="block text-xs">{T(day.highF)}° / {T(day.lowF)}°</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {(card.status === "refreshing" || card.status === "stale") && (
              <p className="mt-3 text-xs text-white/55" role="status">{card.status === "refreshing" ? "Refreshing cached summary…" : card.error}</p>
            )}
            {card.status === "stale" && (
              <button type="button" onClick={onRetry} className="mt-2 rounded-full bg-white/15 px-3 py-2 text-xs" aria-label={`Retry ${card.place.name} comparison`}>Retry</button>
            )}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <p className="text-[10px] text-white/45">Open-Meteo · Updated {formatLocalTime(summary.updatedAt, summary.timezone)}</p>
              <button type="button" onClick={onOpen} className="shrink-0 rounded-full bg-white/15 px-3 py-2.5 text-xs font-medium" aria-label={`Open ${card.place.name} full forecast`}>
                Open full forecast
              </button>
            </div>
          </>
        );
      })()}
    </article>
  );
}

export default function ComparisonView({ places, unit, cache, onOpenFull }: Props) {
  const { cards, retry } = useComparison(places, cache);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section aria-labelledby="comparison-title">
      <div className="mb-4">
        <h1 id="comparison-title" className="text-xl font-semibold">Compare saved locations</h1>
        <p className="mt-1 text-xs text-white/55">Curated conditions and outlooks. Rain today is an estimated local-day model total.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="comparison-grid">
        {cards.map((card) => (
          <SummaryCard key={card.id} card={card} unit={unit} now={now} onOpen={() => onOpenFull(card.place)} onRetry={() => retry(card.place)} />
        ))}
      </div>
    </section>
  );
}
