import { formatLocalDate } from "../time";
import { fmtClock } from "../units";
import type { EnsembleSummary } from "../types";

export function precipitationWindowLabel(ensemble: EnsembleSummary, timezone: string): string {
  const { windowStart, windowEnd } = ensemble;
  if (!windowStart || !windowEnd) return "Window timing unavailable";
  return `${formatLocalDate(windowStart, timezone)} ${fmtClock(windowStart, timezone)} – ${formatLocalDate(windowEnd, timezone)} ${fmtClock(windowEnd, timezone)} (${timezone})`;
}
