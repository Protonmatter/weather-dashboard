import { decodeWMO } from "../lib/wmo";
import { LocationClock } from "./LocationClock";
import { Card } from "./Card";
import type { CurrentConditions, DayPoint, HourPoint, Place } from "../lib/types";

interface Props {
  place: Place;
  current: CurrentConditions;
  today?: DayPoint;
  hourly: readonly HourPoint[];
  T: (fahrenheit: number) => number;
  timezone: string;
}

function summary(hourly: readonly HourPoint[], label: string): string {
  const wet = hourly.slice(0, 12).filter((hour) => decodeWMO(hour.code).wet).length;
  if (wet >= 8) return `${label} on and off through the evening.`;
  if (wet) return `${label} for the next few hours, then clearing. Mostly dry the rest of the week.`;
  return `${label} conditions holding through the evening.`;
}

export function Hero({ place, current, today, hourly, T, timezone }: Props) {
  const condition = decodeWMO(current.code, current.isDay);
  const metrics = [
    ["Humidity", `${current.humidity}%`],
    ["Wind", `${Math.round(current.wind)} mph`],
    ["Interval", `${current.precipitationIn.toFixed(2)} in`],
  ] as const;

  return (
    <Card as="header" level="hero" className="fadein h-full" data-testid="current-conditions-hero">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-[26px] font-medium tracking-tight">{place.name}</h1>
        <span className="text-[13px] text-white/55">
          {[place.admin, place.country].filter(Boolean).join(", ")}
        </span>
      </div>
      <div className="mt-1 text-xs"><LocationClock timezone={timezone} /></div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[clamp(76px,12vw,126px)] font-extralight leading-[0.9] tracking-[-0.055em]">
            {T(current.temp)}°
          </div>
          <p className="mt-2 text-sm font-medium">{condition.label}</p>
        </div>
        <span className="glass-inset grid h-20 w-20 shrink-0 place-items-center rounded-[1.65rem]">
          <condition.Icon size={48} strokeWidth={1.25} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-[13px] text-white/75">
        Feels Like: {T(current.feels)}°{today && ` · H:${T(today.high)}° L:${T(today.low)}°`}
      </p>
      <p className="mt-1 max-w-md text-[13px] leading-snug text-white/60">
        {summary(hourly, condition.label)}
      </p>
      <dl className="mt-auto grid grid-cols-3 gap-2 pt-5">
        {metrics.map(([label, value]) => (
          <div key={label} className="glass-inset rounded-2xl px-3 py-2.5">
            <dt className="text-[9px] font-semibold uppercase tracking-wider text-white/50">{label}</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
