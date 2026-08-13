import { Card } from "./Card";
import type { CurrentConditions, DayPoint } from "../lib/types";

type Convert = (fahrenheit: number) => number;

export function WindVisibilityCard({ current }: { current: CurrentConditions }) {
  const strength = Math.min(100, (current.wind / 40) * 100);
  return (
    <Card title="Wind & Visibility" className="fadein h-full">
      <dl className="grid flex-1 grid-cols-2 items-center gap-3">
        <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Wind</dt><dd className="mt-1 text-3xl font-light tabular-nums">{Math.round(current.wind)}<span className="ml-1 text-sm text-white/55">mph</span></dd></div>
        <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Visibility</dt><dd className="mt-1 text-3xl font-light tabular-nums">{current.visibility.toFixed(1)}<span className="ml-1 text-sm text-white/55">mi</span></dd></div>
      </dl>
      <div className="glass-inset mt-4 h-2 overflow-hidden rounded-full" aria-hidden="true"><div className="h-full rounded-full bg-sky-300" style={{ width: `${strength}%` }} /></div>
      <p className="mt-2 text-[10px] text-white/45">Forecast-grid wind at 10 m</p>
    </Card>
  );
}

export function TemperatureTrendCard({ daily, T }: { daily: readonly DayPoint[]; T: Convert }) {
  const days = daily.slice(0, 7);
  if (days.length < 2) return <Card title="Temperature Trend" className="h-full" data-testid="temperature-trend-card"><p className="text-sm text-white/60">Temperature trend is unavailable.</p></Card>;
  const values = days.map((day) => T((day.low + day.high) / 2));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => `${10 + index * (280 / (values.length - 1))},${88 - ((value - min) / span) * 68}`).join(" ");
  return (
    <Card title="Temperature Trend" className="fadein h-full" data-testid="temperature-trend-card">
      <div className="flex items-baseline justify-between gap-3"><span className="text-3xl font-light tabular-nums">{values.at(-1)}°</span><span className="text-[10px] text-white/50">{min}–{max}° midpoint</span></div>
      <svg viewBox="0 0 300 100" className="mt-2 h-28 w-full" role="img" aria-label={`Seven-day temperature trend from ${values[0]} to ${values.at(-1)} degrees`}><polyline points={points} fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </Card>
  );
}
