import { Hero } from "./Hero";
import { PrecipitationCard } from "./PrecipitationCard";
import {
  AirQualityCard,
  HourlyStrip,
  SunsetCard,
  TenDayForecast,
  UvCard,
} from "./Panels";
import { TemperatureTrendCard, WindVisibilityCard } from "./OverviewCards";
import type {
  CurrentConditions,
  DayPoint,
  EnsembleSummary,
  HourPoint,
  Place,
} from "../lib/types";

type Convert = (fahrenheit: number) => number;
type PresentationTarget = "phone" | "tablet" | "cinema";

interface Props {
  target: PresentationTarget;
  place: Place;
  current: CurrentConditions;
  daily: readonly DayPoint[];
  hourly: readonly HourPoint[];
  aqi: number | null;
  ensemble: EnsembleSummary;
  timezone: string;
  T: Convert;
  wet: boolean;
}

export function ForecastOverview({
  target,
  place,
  current,
  daily,
  hourly,
  aqi,
  ensemble,
  timezone,
  T,
  wet,
}: Props) {
  const today = daily[0];

  return (
    <section
      className="forecast-overview"
      aria-label="Forecast overview"
      data-testid="forecast-overview"
      data-layout="responsive-matrix"
      data-presentation-target={target}
    >
      <div className="contents" data-testid="forecast-summary">
        <div className="forecast-overview__hero">
          <Hero
            place={place}
            current={current}
            today={today}
            hourly={hourly}
            T={T}
            timezone={timezone}
          />
        </div>

        <div className="forecast-overview__hourly">
          <HourlyStrip
            hourly={hourly}
            T={T}
            spread={ensemble.tempSpread}
            timezone={timezone}
          />
        </div>

        <div className="forecast-overview__daily">
          <TenDayForecast
            daily={daily}
            current={current}
            hourly={hourly}
            T={T}
            timezone={timezone}
          />
        </div>

        <div className="forecast-overview__air">
          <AirQualityCard aqi={aqi} wet={wet} />
        </div>

        <div className="forecast-overview__precip">
          <PrecipitationCard
            ens={ensemble}
            hourly={hourly}
            timezone={timezone}
          />
        </div>

        <div className="forecast-overview__wind">
          <WindVisibilityCard current={current} />
        </div>

        <div className="forecast-overview__uv">
          <UvCard uv={today?.uv ?? 0} />
        </div>

        <div className="forecast-overview__sunset">
          <SunsetCard day={today} timezone={timezone} />
        </div>

        <div className="forecast-overview__trend">
          <TemperatureTrendCard daily={daily} T={T} timezone={timezone} />
        </div>
      </div>
    </section>
  );
}
