import type { CurrentConditions, DayPoint, HourPoint, Place } from "../lib/types";
import { decodeWMO } from "../lib/wmo";
import { Card } from "./Card";
import { LocationClock } from "./LocationClock";

interface Props {
  place: Place;
  timezone: string;
  current: CurrentConditions;
  hourly: readonly HourPoint[];
  today?: DayPoint;
  T: (fahrenheit: number) => number;
}

function summary(
  current: CurrentConditions,
  hourly: readonly HourPoint[]
): string {
  const now = decodeWMO(current.code, current.isDay);
  const later = hourly[4]
    ? decodeWMO(hourly[4].code, hourly[4].isDay)
    : null;
  if (!later || later.label === now.label) {
    return `${now.label} conditions are expected to hold through the next few hours.`;
  }
  return `${now.label} now, trending toward ${later.label.toLowerCase()} conditions later.`;
}

export function Hero({
  place,
  timezone,
  current,
  hourly,
  today,
  T,
}: Props) {
  const condition = decodeWMO(current.code, current.isDay);
  const Icon = condition.Icon;
  const metrics = [
    ["Humidity", `${Math.round(current.humidity)}%`],
    ["Wind", `${Math.round(current.wind)} mph`],
    ["Modeled rate", `${(current.precipRateMmH / 25.4).toFixed(2)} in/h`],
  ] as const;

  return (
    <Card
      as="header"
      level="hero"
      padding="none"
      className="hero-card fadein min-h-[19rem] p-5 sm:p-6"
      data-testid="current-conditions-hero"
    >
      <div className="relative z-10 flex h-full min-h-[17rem] flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-white/80">
              <Icon size={22} aria-hidden="true" />
              <span>{condition.label}</span>
            </div>
            <h1 className="mt-3 truncate text-2xl font-semibold sm:text-3xl">
              {place.name}
            </h1>
            <p className="truncate text-xs text-white/55 sm:text-sm">
              {[place.admin, place.country].filter(Boolean).join(", ")}
            </p>
          </div>
          <LocationClock timezone={timezone} />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.75fr)] sm:items-end">
          <div>
            <div className="flex items-start">
              <span className="tabular-nums text-[5.4rem] font-thin leading-none tracking-[-0.07em] sm:text-[6.6rem]">
                {T(current.temp)}
              </span>
              <span className="ml-1 mt-1 text-2xl font-light text-white/70">
                °
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
              {summary(current, hourly)}
            </p>
            <p className="mt-2 text-xs text-white/55">
              Feels like {T(current.feels)}°
              {today
                ? ` · High ${T(today.high)}° · Low ${T(today.low)}°`
                : ""}
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-2 sm:grid-cols-1">
            {metrics.map(([label, value]) => (
              <div
                key={label}
                className="glass-inset rounded-2xl px-3 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums sm:mt-0">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  );
}
