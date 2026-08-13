import { useComparison } from "../hooks/useComparison";
import type { ComparisonCache, ComparisonCardState } from "../lib/comparison/types";
import { formatLocalHour, formatLocalTime, formatLocalWeekday, timezoneLabel } from "../lib/time";
import type { Place } from "../lib/types";
import { f2c } from "../lib/units";
import { decodeWMO } from "../lib/wmo";
import { useClock } from "./LocationClock";

interface Props {
  places: readonly Place[];
  unit: "F" | "C";
  cache: ComparisonCache;
  onOpenFull: (place: Place) => void;
}

function SummaryCard({ card, unit, now, onOpen, onRetry }: {
  card: ComparisonCardState;
  unit: "F" | "C";
  now: Date;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const T = (f: number): number => Math.round(unit === "F" ? f : f2c(f));
  const summary = "summary" in card ? card.summary : null;
  const condition = summary && decodeWMO(summary.current.code, summary.current.isDay);
  const action = "glass-control glass-inset rounded-full px-3 py-2.5 text-xs";
  return (
    <article className="glass-surface p-4" data-testid="comparison-card" data-status={card.status} aria-busy={card.status === "loading" || card.status === "refreshing"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="truncate text-lg font-semibold">{card.place.name}</h2><p className="truncate text-xs text-white/55">{[card.place.admin, card.place.country].filter(Boolean).join(", ")}</p></div>
        {summary && <div className="shrink-0 text-right"><span className="block text-[10px] uppercase tracking-wider text-white/45">Local time</span><time className="text-sm font-medium">{formatLocalTime(now, summary.timezone)} {timezoneLabel(now, summary.timezone)}</time></div>}
      </div>
      {!summary && card.status === "loading" && <p className="mt-8 min-h-64 text-sm text-white/60" role="status">Loading summary…</p>}
      {!summary && card.status === "error" && <div className="glass-inset mt-8 min-h-64 rounded-2xl p-4" role="status"><p className="text-sm text-white/70">{card.error}</p><button type="button" onClick={onRetry} className={`${action} mt-4`} aria-label={`Retry ${card.place.name} comparison`}>Retry</button></div>}
      {summary && condition && <>
          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="flex items-center gap-3"><condition.Icon /><div><p className="text-4xl font-light" data-testid="comparison-temperature">{T(summary.current.temperatureF)}°</p><p className="text-xs">Feels {T(summary.current.apparentF)}°</p></div></div>
            <div className="text-right text-sm"><p>{condition.label}</p><p className="text-xs text-white/55">H {T(summary.today.highF)}° · L {T(summary.today.lowF)}°</p></div>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="glass-inset rounded-2xl px-2 py-3"><dt className="text-[10px] uppercase tracking-wide text-white/50">Humidity</dt><dd className="mt-1 text-sm font-semibold">{Math.round(summary.current.humidityPercent)}%</dd></div>
            <div className="glass-inset rounded-2xl px-2 py-3"><dt className="text-[10px] uppercase tracking-wide text-white/50">UV</dt><dd className="mt-1 text-sm font-semibold">{Math.round(summary.today.uvMax)}</dd></div>
            <div className="glass-inset rounded-2xl px-2 py-3"><dt className="text-[10px] uppercase tracking-wide text-white/50">Rain today</dt><dd className="mt-1 text-sm font-semibold">{summary.today.rainSoFarIn.toFixed(2)} in · modeled</dd></div>
          </dl>
          <section className="glass-inset mt-5 grid grid-cols-6 gap-1 rounded-2xl p-2" aria-label={`${card.place.name} next six hours`}>
            {summary.hourly.map((hour) => { const label = decodeWMO(hour.code, hour.isDay).label; return <div key={hour.time.toISOString()} className="text-center" data-testid="comparison-hour" aria-label={`${label}, ${Math.round(hour.pop)}% chance, ${hour.precipitationIn.toFixed(2)} inches`}><time className="block text-[9px] text-white/50">{formatLocalHour(hour.time, summary.timezone)}</time><span className="block truncate text-[8px] text-white/55">{label}</span><span className="block text-xs font-medium">{T(hour.tempF)}°</span><span className="block text-[9px] text-sky-200">{Math.round(hour.pop)}%</span><span className="block text-[8px] text-white/45">{hour.precipitationIn.toFixed(2)} in</span></div>; })}
          </section>
          <section className="mt-5 grid grid-cols-3 gap-2" aria-label={`${card.place.name} next three days`}>
            {summary.daily.map((day) => { const label = decodeWMO(day.code).label; return <div key={day.date.toISOString()} className="glass-inset rounded-xl p-2 text-center" data-testid="comparison-day"><time className="block text-[10px] text-white/55">{formatLocalWeekday(day.date, summary.timezone)}</time><span className="mt-1 block truncate text-[9px] text-white/60">{label}</span><span className="block text-xs">{T(day.highF)}° / {T(day.lowF)}°</span></div>; })}
          </section>
          {(card.status === "refreshing" || card.status === "stale") && <p className="mt-3 text-xs" role="status">{card.status === "refreshing" ? "Refreshing cached summary…" : card.error}</p>}
          {card.status === "stale" && <button type="button" onClick={onRetry} className={`${action} mt-2`} aria-label={`Retry ${card.place.name} comparison`}>Retry</button>}
          <div className="glass-divider mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-[10px] text-white/45">Open-Meteo · Updated {formatLocalTime(summary.updatedAt, summary.timezone)}<button type="button" onClick={onOpen} className={`${action} text-white`} aria-label={`Open ${card.place.name} full forecast`}>Open full forecast</button></div>
        </>}
    </article>
  );
}

export default function ComparisonView({ places, unit, cache, onOpenFull }: Props) {
  const { cards, retry } = useComparison(places, cache);
  const now = useClock(30_000);
  return <section aria-labelledby="comparison-title"><h1 id="comparison-title" className="mb-4 text-xl font-semibold">Compare saved locations</h1><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="comparison-grid">{cards.map((card) => <SummaryCard key={card.id} card={card} unit={unit} now={now} onOpen={() => onOpenFull(card.place)} onRetry={() => retry(card.place)} />)}</div></section>;
}
