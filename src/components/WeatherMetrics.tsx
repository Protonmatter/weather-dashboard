import { useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { uvLabel } from "../lib/units";
import type { CurrentConditions, EnsembleSummary } from "../lib/types";

type MetricId = "humidity" | "uv" | "rain-today" | "rain-next" | "wind" | "visibility" | "pressure";

interface Metric {
  id: MetricId;
  label: string;
  value: string;
  preview: string;
  detail: string;
}

interface Props {
  current: CurrentConditions;
  uv: number;
  rainTodayIn: number;
  ensemble: EnsembleSummary;
  placeKey: string;
}

export function WeatherMetrics({ current, uv, rainTodayIn, ensemble, placeKey }: Props) {
  const [preview, setPreview] = useState<MetricId | null>(null);
  const [pinned, setPinned] = useState<MetricId | null>(null);
  const previousPlaceKey = useRef(placeKey);
  useEffect(() => {
    if (previousPlaceKey.current === placeKey) return;
    previousPlaceKey.current = placeKey;
    setPreview(null);
    setPinned(null);
  }, [placeKey]);

  const metrics: Metric[] = [
    {
      id: "humidity",
      label: "Humidity",
      value: `${current.humidity}%`,
      preview: `${current.humidity}% relative humidity`,
      detail: `Relative humidity is ${current.humidity}%. This is the share of moisture in the air relative to what it can hold at the current temperature.`,
    },
    {
      id: "uv",
      label: "UV index",
      value: `${Math.round(uv)} · ${uvLabel(uv)}`,
      preview: `UV ${Math.round(uv)}, ${uvLabel(uv)}`,
      detail: `UV index peaks at ${Math.round(uv)} today (${uvLabel(uv)}). The daily maximum can occur later than the current conditions.`,
    },
    {
      id: "rain-today",
      label: "Rain today",
      value: `${rainTodayIn.toFixed(2)} in`,
      preview: `${rainTodayIn.toFixed(2)} inches estimated since local midnight`,
      detail: `Estimated rainfall since local midnight is ${rainTodayIn.toFixed(2)} inches. This is an Open-Meteo model/analysis estimate, not a physical rain-gauge observation.`,
    },
    {
      id: "rain-next",
      label: "Next 24h precip",
      value: `${ensemble.t50.toFixed(2)} in`,
      preview: ensemble.live
        ? `${ensemble.t50.toFixed(2)} inches ensemble precipitation median in the next 24 hours`
        : `${ensemble.t50.toFixed(2)} inches modeled precipitation estimate in the next 24 hours`,
      detail: ensemble.live
        ? `The next-24-hour precipitation ensemble median is ${ensemble.t50.toFixed(2)} inches, with a 10th–90th percentile range of ${ensemble.t10.toFixed(2)}–${ensemble.t90.toFixed(2)} inches across ${ensemble.n} members. This total can include rain, showers, or snow water equivalent.`
        : `The modeled estimate for precipitation in the next 24 hours is ${ensemble.t50.toFixed(2)} inches. Live ensemble data are unavailable, so this deterministic fallback must not be interpreted as observed or ensemble uncertainty.`,
    },
    {
      id: "wind",
      label: "Wind",
      value: `${current.wind} mph`,
      preview: `${current.wind} miles per hour at 10 metres`,
      detail: `Wind speed is ${current.wind} mph at 10 metres above ground in the selected forecast grid cell.`,
    },
    {
      id: "visibility",
      label: "Visibility",
      value: `${current.visibility.toFixed(1)} mi`,
      preview: `${current.visibility.toFixed(1)} miles visibility`,
      detail: `Estimated horizontal visibility is ${current.visibility.toFixed(1)} miles. Fog, precipitation, smoke, and haze can reduce this value.`,
    },
    {
      id: "pressure",
      label: "Pressure",
      value: `${current.pressure.toFixed(2)} inHg`,
      preview: `${current.pressure.toFixed(2)} inches of mercury surface pressure`,
      detail: `Surface pressure is ${current.pressure.toFixed(2)} inHg. The forecast-map contours use mean-sea-level pressure instead so terrain does not create false systems.`,
    },
  ];
  const shown = metrics.find((metric) => metric.id === preview);
  const detail = metrics.find((metric) => metric.id === pinned);

  return (
    <Card title="Weather details" className="mt-4 fadein" data-testid="weather-metrics">
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        {metrics.map((metric) => {
          const tooltipId = `weather-metric-tooltip-${metric.id}`;
          return (
            <div key={metric.id} className="relative">
              <button
                type="button"
                className={`min-h-11 w-full rounded-2xl border px-3 py-2 text-left transition-colors ${pinned === metric.id ? "border-white/45 bg-white/20" : "border-white/15 bg-white/[0.07] hover:bg-white/[0.13]"}`}
                data-testid={`weather-metric-${metric.id}`}
                aria-label={`${metric.label}: ${metric.value}`}
                aria-pressed={pinned === metric.id}
                aria-describedby={preview === metric.id ? tooltipId : undefined}
                onPointerEnter={() => setPreview(metric.id)}
                onPointerLeave={() => setPreview(null)}
                onFocus={() => setPreview(metric.id)}
                onBlur={() => setPreview(null)}
                onClick={() => setPinned((value) => value === metric.id ? null : metric.id)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setPinned(null);
                }}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-white/55">{metric.label}</span>
                <span className="mt-1 block text-lg font-light tabular-nums">{metric.value}</span>
              </button>
              {preview === metric.id && shown && (
                <div
                  id={tooltipId}
                  role="tooltip"
                  className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 w-48 -translate-x-1/2 rounded-xl border border-white/15 bg-slate-950/95 px-3 py-2 text-center text-[11px] leading-snug text-white shadow-xl"
                >
                  {shown.preview}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {detail && (
        <div
          className="mt-3 rounded-2xl border border-white/15 bg-slate-950/35 px-4 py-3"
          data-testid="weather-metric-detail"
          aria-live="polite"
        >
          <div className="text-sm font-semibold">{detail.label}</div>
          <p className="mt-1 text-xs leading-relaxed text-white/65">{detail.detail}</p>
        </div>
      )}
    </Card>
  );
}
