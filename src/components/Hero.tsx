import { decodeWMO } from "../lib/wmo";
import type { CurrentConditions, DayPoint, HourPoint, Place } from "../lib/types";

interface Props {
  place: Place;
  current: CurrentConditions;
  today: DayPoint | undefined;
  hourly: readonly HourPoint[];
  T: (f: number) => number;
}

function summary(hourly: readonly HourPoint[], label: string): string {
  const wetHours = hourly.slice(0, 12).filter((h) => decodeWMO(h.code).wet).length;
  if (wetHours >= 8) return `${label} on and off through the evening.`;
  if (wetHours > 0) return `${label} for the next few hours, then clearing. Mostly dry the rest of the week.`;
  return `${label} conditions holding through the evening.`;
}

export function Hero({ place, current, today, hourly, T }: Props) {
  const cond = decodeWMO(current.code, current.isDay);

  return (
    <header className="fadein mb-5 sm:mb-7">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em" }}>{place.name}</h1>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
          {[place.admin, place.country].filter(Boolean).join(", ")}
        </span>
      </div>
      <div className="flex items-start gap-3">
        <div style={{ fontSize: "clamp(76px, 15vw, 132px)", fontWeight: 200, lineHeight: 0.95, letterSpacing: "-0.04em", marginTop: 2 }}>
          {T(current.temp)}°
        </div>
        <cond.Icon size={44} strokeWidth={1.4} style={{ marginTop: 16, opacity: 0.9 }} />
      </div>
      <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.78)", marginTop: 6 }}>
        Feels Like: {T(current.feels)}°
        {today && ` · H:${T(today.high)}° L:${T(today.low)}°`}
      </p>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.66)", maxWidth: 340, marginTop: 4, lineHeight: 1.35 }}>
        {summary(hourly, cond.label)}
      </p>
    </header>
  );
}
