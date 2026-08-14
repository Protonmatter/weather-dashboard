import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildPrecipitationTimeline,
  nearestPrecipitationFrame,
  reconcilePrecipitationSelection,
  stepPrecipitationFrame,
} from "../lib/precipitation/timeline";
import type {
  PrecipitationFrame,
  PrecipitationHorizonHours,
  PrecipitationSelection,
  PrecipitationTimeline,
} from "../lib/precipitation/types";
import type { RadarFrame, RadarProviderId } from "../lib/radar/types";

export interface UsePrecipitationTimelineInput {
  observations: readonly RadarFrame[];
  observationProvider: RadarProviderId;
  forecastTimes: readonly string[];
  now: Date;
  initialHorizon?: PrecipitationHorizonHours;
  reducedMotion: boolean;
}

export interface UsePrecipitationTimelineResult {
  timeline: PrecipitationTimeline;
  selectedFrame: PrecipitationFrame | null;
  horizonHours: PrecipitationHorizonHours;
  playing: boolean;
  selectTimestamp(targetMs: number): void;
  selectFrame(frame: PrecipitationFrame): void;
  step(direction: -1 | 1): void;
  setHorizonHours(value: PrecipitationHorizonHours): void;
  setPlaying(value: boolean): void;
  stop(): void;
}

const selectionFor = (frame: PrecipitationFrame | null): PrecipitationSelection | null =>
  frame ? { id: frame.id, validAtMs: frame.validAt.getTime() } : null;

export function usePrecipitationTimeline({
  observations,
  observationProvider,
  forecastTimes,
  now,
  initialHorizon = 24,
  reducedMotion,
}: UsePrecipitationTimelineInput): UsePrecipitationTimelineResult {
  const [horizonHours, setHorizonState] = useState<PrecipitationHorizonHours>(initialHorizon);
  const [selection, setSelection] = useState<PrecipitationSelection | null>(null);
  const [playing, setPlayingState] = useState(false);

  const timeline = useMemo(
    () => buildPrecipitationTimeline({
      observations,
      observationProvider,
      forecastTimes,
      now,
      horizonHours,
    }),
    [forecastTimes, horizonHours, now, observationProvider, observations]
  );

  const selectedFrame = useMemo(
    () => reconcilePrecipitationSelection(timeline, selection),
    [selection, timeline]
  );

  useEffect(() => {
    if (!selectedFrame) setPlayingState(false);
  }, [selectedFrame]);

  useEffect(() => {
    if (reducedMotion || timeline.frames.length < 2) setPlayingState(false);
  }, [reducedMotion, timeline.frames.length]);

  const selectFrame = useCallback((frame: PrecipitationFrame): void => {
    setPlayingState(false);
    setSelection(selectionFor(frame));
  }, []);

  const selectTimestamp = useCallback((targetMs: number): void => {
    const frame = nearestPrecipitationFrame(timeline, targetMs);
    setPlayingState(false);
    setSelection(selectionFor(frame));
  }, [timeline]);

  const step = useCallback((direction: -1 | 1): void => {
    setSelection(selectionFor(stepPrecipitationFrame(timeline, selectedFrame, direction)));
  }, [selectedFrame, timeline]);

  const setHorizonHours = useCallback((value: PrecipitationHorizonHours): void => {
    setHorizonState(value);
  }, []);

  const setPlaying = useCallback((value: boolean): void => {
    setPlayingState(value && !reducedMotion && timeline.frames.length > 1);
  }, [reducedMotion, timeline.frames.length]);

  const stop = useCallback((): void => setPlayingState(false), []);

  return {
    timeline,
    selectedFrame,
    horizonHours,
    playing,
    selectTimestamp,
    selectFrame,
    step,
    setHorizonHours,
    setPlaying,
    stop,
  };
}
