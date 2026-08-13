import { decodeWMO } from "../lib/wmo";
import { LocationClock } from "./LocationClock";
import { Card } from "./Card";
import type { CurrentConditions, DayPoint, HourPoint, Place } from "../lib/types";

interface Props {
  place: Place;
  current: CurrentConditions;
  today: DayPoint | undefined;
  hourly: readonly HourPoint[];
  T: (f: number) => number;
  timezone: string;
}

function summary(hourly: readonly HourPoint[], label: string): string {
  const wetHours = hourly.slice(0, 12).filter((hour) => decodeWMO(hour.code).wet).length;
  if (wetHours >= 8) return `${label} on and off through the evening.`;
  if (wetHours > 0) return `${label} for the next few hours, then clearing. Mostly dry the rest of the week.`;
  return `${label} conditions holding through the evening.`;
}

export function Hero({ place, current, today, hourly, T, timezone }: Props) {
  const cond = decodeWMO(current.code, current.isDay);
  return (
    <Card as="header" level="hero" className="fadein mb-5 sm:mb-7" data-testid="current-conditions-hero">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="min-w-0 break-words text-[26px] font-medium tracking-[-0.01em]">{place.name}</h1>
        <span className="text-[13px] text-white/55">{[place.admin, place.country].filter(Boolean).join(", ")}</span>
      </div>
      <div className="mt-1 text-xs"><LocationClock timezone={timezone} /></div>
      <div className="mt-2 flex items-start gap-3">
        <div className="text-[clamp(76px,15vw,132px)] font-extralight leading-[0.95] tracking-[-0.04em]">{T(current.temp)}°</div>
        <cond.Icon size={44} strokeWidth={1.4} className="mt-4 opacity-90" aria-hidden="true" />
      </div>
      <p className="mt-1 text-[13.5px] text-white/80">
        Feels Like: {T(current.feels)}°{today && ` · H:${T(today.high)}° L:${T(today.low)}°`}
      </p>
      <p className="mt-1 max-w-[360px] text-[13px] leading-snug text-white/65">{summary(hourly, cond.label)}</p>
    </Card>
  );
}
