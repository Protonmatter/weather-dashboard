import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useClock } from "./LocationClock";
import { usePrecipitationTimeline } from "../hooks/usePrecipitationTimeline";
import type { MapLoadState } from "../lib/map/state";
import type { MapForecastGrid, MapViewport } from "../lib/map/types";
import {
  precipitationAriaValueText,
  precipitationAttribution,
  precipitationLegend,
  precipitationSourceBadge,
  precipitationTimestampLabel,
} from "../lib/precipitation/presentation";
import type { PrecipitationFrame } from "../lib/precipitation/types";
import { radarProviderFor } from "../lib/radar/provider";
import {
  matchesRadarLayerIdentity,
  radarLayerContextKey,
  type RadarLayerIdentity,
} from "../lib/radar/layerState";
import type { Place } from "../lib/types";
import { ForecastPrecipitationLayer } from "./ForecastPrecipitationLayer";
import { ObservedRadarLayer } from "./ObservedRadarLayer";
import { useRadar } from "../hooks/useRadar";

const CONTROL = "glass-control glass-inset inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 bg-slate-950/55 px-3 text-white focus:outline-none focus:ring-2 focus:ring-white/80 disabled:cursor-not-allowed disabled:opacity-50";
const PLAYBACK_INTERVAL_MS = 900;

export interface PrecipitationTimelinePanelProps {
  place: Place;
  timezone: string;
  viewport: MapViewport;
  overlayHost: HTMLDivElement | null;
  active: boolean;
  reducedMotion: boolean;
  mapVisible: boolean;
  pageVisible: boolean;
  forecastState: MapLoadState<MapForecastGrid>;
  forecastGrid: MapForecastGrid | null;
  onRetryForecast(): void;
}

interface LoadedObservation {
  contextKey: string;
  sourceKey: string;
  frameId: string;
  validAt: Date;
}

interface ObservationFailure {
  contextKey: string;
  sourceKey: string;
  frameId: string;
  message: string;
}

function TimelineLegend({ frame }: { frame: PrecipitationFrame }) {
  const legend = precipitationLegend(frame);
  return (
    <div
      className="absolute bottom-2 left-2 z-20 max-w-[70%] rounded-lg bg-slate-950/75 px-2 py-1 text-[10px] text-white/90"
      data-testid="precipitation-legend"
    >
      <p className="font-semibold">{legend.title}</p>
      <div
        className="mt-1 h-1.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${legend.stops})` }}
        aria-hidden="true"
      />
      <div className="mt-1 flex justify-between gap-2" aria-hidden="true">
        {legend.labels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <p className="mt-1">{legend.note}</p>
    </div>
  );
}

export default function PrecipitationTimelinePanel({
  place,
  timezone,
  viewport,
  overlayHost,
  active,
  reducedMotion,
  mapVisible,
  pageVisible,
  forecastState,
  forecastGrid,
  onRetryForecast,
}: PrecipitationTimelinePanelProps) {
  const { state: radarState, source, retry: retryRadar } = useRadar(place, true);
  const now = useClock(60_000);
  const provider = source?.provider ?? radarProviderFor(place);
  const sourceKey = source
    ? `${source.provider}:${source.fetchedAt}:${source.frames.at(-1)?.id ?? "empty"}`
    : "loading";
  const imageContextKey = useMemo(
    () => radarLayerContextKey(place, viewport, provider),
    [
      place,
      provider,
      viewport.center.lat,
      viewport.center.lon,
      viewport.height,
      viewport.width,
      viewport.zoom,
    ]
  );
  const [loadedObservation, setLoadedObservation] = useState<LoadedObservation | null>(null);
  const [imageFailure, setImageFailure] = useState<ObservationFailure | null>(null);
  const [imageRetryGeneration, setImageRetryGeneration] = useState(0);

  const {
    timeline,
    selectedFrame,
    horizonHours,
    playing,
    selectTimestamp,
    step,
    setHorizonHours,
    setPlaying,
    stop,
  } = usePrecipitationTimeline({
    observations: source?.frames ?? [],
    observationProvider: provider,
    forecastTimes: forecastGrid?.times ?? [],
    now,
    reducedMotion,
  });

  const selectedObservation = selectedFrame?.kind === "observation" ? selectedFrame : null;
  const selectedForecast = selectedFrame?.kind === "forecast" ? selectedFrame : null;
  const currentObservationIdentity: RadarLayerIdentity | null = selectedObservation ? {
    contextKey: imageContextKey,
    sourceKey,
    frameId: selectedObservation.radarFrame.id,
  } : null;
  const currentObservationIdentityRef = useRef(currentObservationIdentity);
  currentObservationIdentityRef.current = currentObservationIdentity;
  const observationReady = Boolean(
    selectedObservation &&
    loadedObservation?.contextKey === imageContextKey &&
    loadedObservation.sourceKey === sourceKey &&
    loadedObservation.frameId === selectedObservation.radarFrame.id &&
    loadedObservation.validAt.getTime() === selectedObservation.validAt.getTime()
  );
  const retainedObservationFrame: PrecipitationFrame | null = selectedObservation &&
    !observationReady &&
    loadedObservation?.contextKey === imageContextKey &&
    loadedObservation.sourceKey === sourceKey
    ? {
      ...selectedObservation,
      id: `observation:${selectedObservation.provider}:${loadedObservation.frameId}`,
      validAt: loadedObservation.validAt,
      radarFrame: {
        ...selectedObservation.radarFrame,
        id: loadedObservation.frameId,
        validAt: loadedObservation.validAt,
      },
    }
    : null;
  const displayedFrame = retainedObservationFrame ?? selectedFrame;
  const currentImageFailure = selectedObservation &&
    imageFailure?.contextKey === imageContextKey &&
    imageFailure.sourceKey === sourceKey &&
    imageFailure.frameId === selectedObservation.radarFrame.id
    ? imageFailure.message
    : null;
  const forecastReady = Boolean(
    selectedForecast &&
    forecastGrid &&
    selectedForecast.forecastIndex >= 0 &&
    selectedForecast.forecastIndex < forecastGrid.times.length
  );
  const selectedReady = selectedFrame?.kind === "observation" ? observationReady : forecastReady;

  useEffect(() => {
    if (
      !active ||
      !playing ||
      reducedMotion ||
      !mapVisible ||
      !pageVisible ||
      timeline.frames.length < 2 ||
      !selectedReady ||
      currentImageFailure
    ) return;
    const timer = window.setInterval(() => step(1), PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [
    active,
    currentImageFailure,
    mapVisible,
    pageVisible,
    playing,
    reducedMotion,
    selectedReady,
    step,
    timeline.frames.length,
  ]);

  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  const radarUnavailable = !source && (radarState.status === "error" || radarState.status === "stale");
  const forecastUnavailable = !forecastGrid &&
    (forecastState.status === "error" || forecastState.status === "stale");
  const timelineUnavailable = timeline.frames.length === 0;
  const canPlay = !reducedMotion && timeline.frames.length > 1 && !timelineUnavailable;
  const timelineMinimum = timeline.earliestAt?.getTime() ?? 0;
  const timelineMaximum = timeline.latestAt?.getTime() ?? 0;
  const selectedValue = selectedFrame?.validAt.getTime() ?? timelineMinimum;
  const radarAttribution = source?.attribution ?? {
    label: "Radar provider unavailable",
    url: "https://www.weather.gov/",
  };
  const attribution = selectedFrame
    ? precipitationAttribution(selectedFrame, radarAttribution)
    : null;

  const overlay = overlayHost ? createPortal(
    <div
      className="absolute inset-0 z-10 pointer-events-none"
      hidden={!active}
      data-testid="precipitation-overlay"
    >
      <ObservedRadarLayer
        active={active && selectedObservation !== null}
        place={place}
        source={source}
        frame={selectedObservation?.radarFrame ?? null}
        viewport={viewport}
        retryGeneration={imageRetryGeneration}
        onLayerLoad={(event) => {
          if (!matchesRadarLayerIdentity(event, currentObservationIdentityRef.current)) return;
          setLoadedObservation({
            contextKey: event.contextKey,
            sourceKey: event.sourceKey,
            frameId: event.frameId,
            validAt: event.validAt,
          });
          setImageFailure((current) =>
            matchesRadarLayerIdentity(event, current)
              ? null
              : current
          );
        }}
        onLayerError={(event) => {
          if (!matchesRadarLayerIdentity(event, currentObservationIdentityRef.current)) return;
          stop();
          setImageFailure({
            contextKey: event.contextKey,
            sourceKey: event.sourceKey,
            frameId: event.frameId,
            message: event.message,
          });
        }}
      />
      <ForecastPrecipitationLayer
        active={active && selectedForecast !== null}
        grid={forecastGrid}
        forecastIndex={selectedForecast?.forecastIndex ?? null}
        viewport={viewport}
        ariaLabel={selectedForecast
          ? precipitationAriaValueText(selectedForecast, timezone)
          : "Modeled precipitation forecast unavailable"}
      />
      {active && selectedFrame && <TimelineLegend frame={selectedFrame} />}
    </div>,
    overlayHost
  ) : null;

  return (
    <>
      {overlay}
      <div
        id="precipitation-map-mode-panel"
        role="tabpanel"
        aria-labelledby="precipitation-map-tab"
        hidden={!active}
        className="mt-3"
        data-testid="precipitation-panel"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            className={`${CONTROL} gap-1.5`}
            onClick={() => setPlaying(!playing)}
            disabled={!canPlay}
            aria-label={playing ? "Pause precipitation timeline" : "Play precipitation timeline"}
            title={reducedMotion ? "Playback is off because reduced motion is enabled" : undefined}
            data-testid="precipitation-playback"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className={CONTROL}
            onClick={() => { stop(); step(-1); }}
            disabled={timelineUnavailable}
            aria-label="Previous precipitation frame"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className={CONTROL}
            onClick={() => { stop(); step(1); }}
            disabled={timelineUnavailable}
            aria-label="Next precipitation frame"
          >
            <span aria-hidden="true">›</span>
          </button>
          <span
            className="precipitation-source-badge"
            data-testid="precipitation-source"
          >
            {selectedFrame
              ? precipitationSourceBadge(selectedFrame)
              : radarUnavailable && forecastUnavailable
                ? "PRECIPITATION UNAVAILABLE"
                : "PRECIPITATION LOADING"}
          </span>
          <span
            className="min-w-0 flex-1 font-medium"
            aria-live={playing ? "off" : "polite"}
            data-testid="precipitation-valid-time"
          >
            {displayedFrame
              ? precipitationTimestampLabel(displayedFrame, timezone)
              : "Precipitation time unavailable"}
          </span>
        </div>

        <div className="precipitation-timeline-track">
          <div className="precipitation-segment-labels" aria-hidden="true">
            <span>{radarUnavailable ? "OBSERVED UNAVAILABLE" : "OBSERVED RADAR"}</span>
            <span>{forecastUnavailable ? "MODEL FORECAST UNAVAILABLE" : "MODEL FORECAST"}</span>
          </div>
          {timeline.earliestAt && timeline.latestAt && (
            <span
              className="precipitation-now-marker"
              style={{ left: `${timeline.nowPercent}%` }}
              data-testid="precipitation-now"
              data-now-percent={timeline.nowPercent.toFixed(6)}
            >
              NOW
            </span>
          )}
          <input
            type="range"
            min={timelineMinimum}
            max={timelineMaximum}
            value={selectedValue}
            disabled={timelineUnavailable}
            onChange={(event) => selectTimestamp(Number(event.currentTarget.value))}
            className="min-h-11 w-full accent-white"
            aria-label="Precipitation valid time"
            aria-valuetext={displayedFrame
              ? precipitationAriaValueText(displayedFrame, timezone)
              : "Precipitation timeline unavailable"}
            data-testid="precipitation-time"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-white/60">Future range</span>
          {([24, 48] as const).map((hours) => (
            <button
              key={hours}
              type="button"
              className={`${CONTROL} precipitation-horizon`}
              aria-pressed={horizonHours === hours}
              disabled={forecastGrid === null}
              onClick={() => setHorizonHours(hours)}
              data-testid={`precipitation-horizon-${hours}`}
            >
              Next {hours}h
            </button>
          ))}
          {attribution && (
            <a
              href={attribution.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex min-h-11 items-center underline"
              aria-label={attribution.label}
            >
              Data: {attribution.label}
            </a>
          )}
        </div>

        <div className="mt-1 min-h-5 text-[11px] text-white/65">
          {(radarState.status === "loading" || radarState.status === "refreshing") && !source && (
            <span role="status">Loading radar observations… </span>
          )}
          {radarUnavailable && (
            <span role="alert">
              Radar observations could not be loaded.{" "}
              <button type="button" className={`${CONTROL} underline`} onClick={retryRadar}>
                Retry radar
              </button>{" "}
            </span>
          )}
          {forecastUnavailable && (
            <span role="alert">
              Modeled forecast precipitation could not be loaded.{" "}
              <button type="button" className={`${CONTROL} underline`} onClick={onRetryForecast}>
                Retry forecast
              </button>{" "}
            </span>
          )}
          {currentImageFailure && (
            <span role="alert">
              {currentImageFailure}{" "}
              <button
                type="button"
                className={`${CONTROL} underline`}
                onClick={() => {
                  setImageFailure(null);
                  setImageRetryGeneration((value) => value + 1);
                }}
                aria-label="Retry radar imagery"
              >
                Retry imagery
              </button>{" "}
            </span>
          )}
          {!radarUnavailable && source?.coverage === "unavailable" && (
            <span>No radar frames are currently available for this provider. </span>
          )}
          {selectedFrame?.kind === "observation" && !currentImageFailure && (
            <span>Radar reflectivity shows precipitation intensity, not a surface total.</span>
          )}
          {selectedFrame?.kind === "forecast" && (
            <span>GFS hour-ending modeled precipitation is not radar reflectivity.</span>
          )}
          {reducedMotion && " Motion reduced; use the slider or previous and next controls."}
        </div>
      </div>
    </>
  );
}
