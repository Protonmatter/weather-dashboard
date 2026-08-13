import { Eye, Wind } from "lucide-react";
import type { DayPoint } from "../lib/types";
import { Card } from "./Card";

interface WindVisibilityCardProps {
  windMph: number;
  visibilityMi: number;
}

export function WindVisibilityCard({ windMph, visibilityMi }: WindVisibilityCardProps) {
  return (
    <Card title="Wind & visibility" icon={Wind} className="min-h-0">
      <dl className="grid grid-cols-2 gap-3">
        <div className="glass-inset rounded-2xl px-3 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/50">
            <Wind size={12} aria-hidden="true" /> Wind
          </dt>
          <dd className="mt-1 text-2xl font-light tabular-nums">{windMph} mph</dd>
        </div>
        <div className="glass-inset rounded-2xl px-3 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/50">
            <Eye size={12} aria-hidden="true" /> Visibility
          </dt>
          <dd className="mt-1 text-2xl font-light tabular-nums">{visibilityMi.toFixed(1)} mi</dd>
        </div>
      </dl>
    </Card>
  );
}

interface TemperatureTrendCardProps {
  daily: readonly DayPoint[];
  T: (fahrenheit: number) => number;
}

export function TemperatureTrendCard({ daily, T }: TemperatureTrendCardProps) {
  const days = daily.slice(0, 7);
  const values = days.map((day) => T((day.high + day.low) / 2));
  const min = Math.min(...values), max = Math.max(...values), span = max - min;
  const points = values
    .map((value, index) => `${10 + (index / 6) * 280},${span ? 88 - ((value - min) / span) * 68 : 54}`)
    .join(" ");
  return (
    <Card title="7-day temperature trend" className="min-h-0" data-testid="temperature-trend-card">
      <svg viewBox="0 0 300 110" className="h-24 w-full" role="img" aria-label="Seven-day midpoint temperature trend">
        <defs>
          <linearGradient id="trend-stroke" x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent-cyan)" />
            <stop offset="1" stopColor="var(--accent-amber)" />
          </linearGradient>
        </defs>
        <path d="M10 88 H290" stroke="rgb(255 255 255 / 0.10)" strokeWidth="1" />
        <polyline points={points} fill="none" stroke="url(#trend-stroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((value, index) => {
          const [x, y] = points.split(" ")[index]!.split(",");
          return <circle key={`${days[index]!.date.toISOString()}-${value}`} cx={x} cy={y} r="3" fill="white" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-white/50">
        <span>{min}°</span><span>{max}°</span>
      </div>
    </Card>
  );
}
