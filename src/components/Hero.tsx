import { CloudRain, Droplets, Wind } from "lucide-react";
import { decodeWMO } from "../lib/wmo";
import { LocationClock } from "./LocationClock";
import { Card } from "./Card";
import type { CurrentConditions, DayPoint, HourPoint, Place } from "../lib/types";

interface Props {
  place: Place;
  current: CurrentConditions;
  today: DayPoint | undefined;
  hourly: readonly HourPoint[];
  T: (fahrenheit: number) => number;
  timezone: string;
}

function summary(hourly: readonly HourPoint[], label: string): string {
  const wetHours = hourly.slice(0, 12).filter((hour) => decodeWMO(hour.code).wet).length;
  if (wetHours >= 8) return `${label} on and off through the evening.`;
  if (wetHours > 0) {
    return `${label} for the next few hours, then clearing. Mostly dry the rest of the week.`;
  }
  return `${label} conditions holding through the evening.`;
}

export function Hero({ place, current, today, hourly, T, timezone }: Props) {
  const condition = decodeWMO(current.code, current.isDay);
  const ConditionIcon = condition.Icon;

  return (
    <Card
      as="header"
      level="hero"
      className="fadein h-full overflow-hidden"
      data-testid="current-conditions-hero"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="min-w-0 break-words text-[26px] font-medium tracking-[-0.01em]">
          {place.name}
        </h1>
        <span className="text-[13px] text-white/55">
          {[place.admin, place.country].filter(Boolean).join(", ")}
        </span>
      </div>

      <div className="mt-1 text-xs">
        <LocationClock timezone={timezone} />
      </div>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-[clamp(76px,12vw,126px)] font-extralight leading-[0.9] tracking-[-0.055em]">
            {T(current.temp)}°
          </div>
          <p className="mt-2 text-sm font-medium">{condition.label}</p>
        </div>
        <div className="glass-inset grid h-20 w-20 shrink-0 place-items-center rounded-[1.65rem]">
          <ConditionIcon size={48} strokeWidth={1.25} className="opacity-95" aria-hidden="true" />
        </div>
      </div>

      <p className="mt-2 text-[13.5px] text-white/80">
        Feels Like: {T(current.feels)}°
        {today && ` · H:${T(today.high)}° L:${T(today.low)}°`}
      </p>
      <p className="mt-1 max-w-[430px] text-[13px] leading-snug text-white/65">
        {summary(hourly, condition.label)}
      </p>

      <dl className="mt-auto grid grid-cols-3 gap-2 pt-5">
        <div className="glass-inset rounded-2xl px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/50">
            <Droplets size={11} aria-hidden="true" />
            Humidity
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{current.humidity}%</dd>
        </div>
        <div className="glass-inset rounded-2xl px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/50">
            <Wind size={11} aria-hidden="true" />
            Wind
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{Math.round(current.wind)} mph</dd>
        </div>
        <div className="glass-inset rounded-2xl px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/50">
            <CloudRain size={11} aria-hidden="true" />
            Interval
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">
            {current.precipitationIn.toFixed(2)} in
          </dd>
        </div>
      </dl>
    </Card>
  );
}
