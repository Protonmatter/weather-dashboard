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
  const wetHours = hourly.slice(0, 12).filter((h) => decodeWMO(h.code).wet).length;
  if (wetHours >= 8) return `${label} on and off through the evening.`;
  if (wetHours > 0) return `${label} for the next few hours, then clearing.`;
  return `${label} conditions holding through the evening.`;
}

export function Hero({ place, current, today, hourly, T, timezone }: Props) {
  const cond = decodeWMO(current.code, current.isDay);

  return (
    <Card surface="hero" className="fadein mb-5 sm:mb-7 overflow-hidden">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.03em" }}>{place.name}</h1>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
          {[place.admin, place.country].filter(Boolean).join(", ")}
        </span>
      </div>
      <div className="mt-1 text-xs"><LocationClock timezone={timezone} /></div>
      <div className="flex items-start gap-4 mt-2">
        <div style={{ fontSize: "clamp(82px, 15vw, 140px)", fontWeight: 200, lineHeight: .9, letterSpacing: "-0.06em" }}>
          {T(current.temp)}°
        </div>
        <cond.Icon size={52} strokeWidth={1.3} style={{ marginTop: 18, opacity: .9 }} />
      </div>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,.8)" }}>
        Feels Like: {T(current.feels)}°{today && ` · H:${T(today.high)}° L:${T(today.low)}°`}
      </p>
      <p className="mt-2" style={{ fontSize: 14, color: "rgba(255,255,255,.65)", maxWidth: 420 }}>
        {summary(hourly, cond.label)}
      </p>
    </Card>
  );
}
