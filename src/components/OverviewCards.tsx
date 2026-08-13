import { Eye, Wind } from "lucide-react";
import { Card } from "./Card";
import { buildTrendGeometry } from "../lib/presentation/trend";
import { formatLocalWeekday } from "../lib/time";
import type { CurrentConditions, DayPoint } from "../lib/types";

type Convert = (fahrenheit: number) => number;

export function WindVisibilityCard({
  current,
}: {
  current: CurrentConditions;
}) {
  const speedPosition = Math.min(100, Math.max(0, (current.wind / 40) * 100));
  return (
    <Card title="Wind & Visibility" icon={Wind} className="fadein h-full">
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_88px] items-center gap-4">
        <dl className="space-y-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">
              Wind
            </dt>
            <dd className="mt-1 text-3xl font-light tabular-nums">
              {Math.round(current.wind)}
              <span className="ml-1 text-sm font-normal text-white/55">mph</span>
            </dd>
          </div>
          <div className="glass-divider border-t pt-3">
            <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">
              <Eye size={12} aria-hidden="true" />
              Visibility
            </dt>
            <dd className="mt-1 text-lg font-light tabular-nums">
              {current.visibility.toFixed(1)}
              <span className="ml-1 text-xs font-normal text-white/55">mi</span>
            </dd>
          </div>
        </dl>
        <div
          className="relative grid aspect-square place-items-center rounded-full border border-white/15"
          style={{
            background: `conic-gradient(var(--accent-cyan) ${speedPosition}%, rgba(255,255,255,0.08) ${speedPosition}% 100%)`,
          }}
          role="img"
          aria-label={`Wind speed ${Math.round(current.wind)} miles per hour`}
        >
          <div className="grid h-[72%] w-[72%] place-items-center rounded-full bg-slate-950/75 shadow-inner">
            <Wind size={24} strokeWidth={1.45} aria-hidden="true" />
          </div>
        </div>
      </div>
      <p className="mt-3 text-[10.5px] leading-snug text-white/45">
        Forecast-grid wind at 10 m · horizontal visibility estimate
      </p>
    </Card>
  );
}

export function TemperatureTrendCard({
  daily,
  T,
  timezone,
}: {
  daily: readonly DayPoint[];
  T: Convert;
  timezone: string;
}) {
  const days = daily.slice(0, 7);
  if (days.length < 2) {
    return (
      <Card title="Temperature Trend" className="fadein h-full" data-testid="temperature-trend-card">
        <p className="text-sm text-white/60">Temperature trend is unavailable.</p>
      </Card>
    );
  }

  const values = days.map((day) => T((day.low + day.high) / 2));
  const geometry = buildTrendGeometry(values, 300, 104, 10);
  const baseline = 94;
  const area = [
    `M ${geometry.points[0]!.x.toFixed(1)} ${baseline}`,
    ...geometry.points.map(({ x, y }) => `L ${x.toFixed(1)} ${y.toFixed(1)}`),
    `L ${geometry.points.at(-1)!.x.toFixed(1)} ${baseline}`,
    "Z",
  ].join(" ");

  return (
    <Card title="Temperature Trend" className="fadein h-full" data-testid="temperature-trend-card">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-light tabular-nums">
            {values.at(-1)}°
          </p>
          <p className="text-[10.5px] text-white/50">
            Seven-day midpoint · {geometry.min}–{geometry.max}°
          </p>
        </div>
        <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[10px] text-white/60">
          {values.at(-1)! >= values[0]! ? "Warming" : "Cooling"}
        </span>
      </div>

      <svg
        viewBox="0 0 300 104"
        className="mt-3 h-28 w-full overflow-visible"
        role="img"
        aria-label={`Seven-day midpoint temperature trend from ${values[0]} to ${values.at(-1)} degrees`}
      >
        <defs>
          <linearGradient id="temperature-trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#68d7ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#68d7ff" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[24, 58, 92].map((y) => (
          <line
            key={y}
            x1="10"
            x2="290"
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="url(#temperature-trend-area)" aria-hidden="true" />
        <polyline
          points={geometry.polyline}
          fill="none"
          stroke="#68d7ff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {geometry.points.map((point, index) => (
          <circle
            key={`${point.x}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === geometry.points.length - 1 ? 3.5 : 2.2}
            fill={index === geometry.points.length - 1 ? "#fff" : "#68d7ff"}
          />
        ))}
      </svg>

      <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-white/45" aria-hidden="true">
        {days.map((day) => (
          <span key={day.date.toISOString()}>
            {formatLocalWeekday(day.date, timezone).slice(0, 3)}
          </span>
        ))}
      </div>
    </Card>
  );
}
