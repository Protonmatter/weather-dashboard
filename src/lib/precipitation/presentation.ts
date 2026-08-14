import { formatLocalDate, formatLocalTime, timezoneLabel } from "../time";
import type { PrecipitationFrame, SourceAttribution } from "./types";

export interface PrecipitationLegend {
  title: string;
  stops: string;
  labels: readonly string[];
  note: string;
}

const GFS_ATTRIBUTION: SourceAttribution = {
  label: "Open-Meteo GFS",
  url: "https://open-meteo.com/en/docs/gfs-api",
};

export function precipitationProviderLabel(frame: PrecipitationFrame): string {
  if (frame.kind === "forecast") return "Open-Meteo GFS";
  return frame.provider === "noaa-mrms" ? "NOAA / NWS MRMS" : "RainViewer";
}

export function precipitationSourceBadge(frame: PrecipitationFrame): string {
  return frame.kind === "observation"
    ? `OBSERVED · ${precipitationProviderLabel(frame)}`
    : "MODEL FORECAST · Open-Meteo GFS";
}

export function precipitationTimestampLabel(
  frame: PrecipitationFrame,
  timeZone: string
): string {
  const time = `${formatLocalTime(frame.validAt, timeZone)} ${timezoneLabel(frame.validAt, timeZone)}`;
  const date = formatLocalDate(frame.validAt, timeZone);
  return frame.kind === "observation"
    ? `Observed ${time} · ${date}`
    : `Forecast for ${time} · ${date}`;
}

export function precipitationAriaValueText(
  frame: PrecipitationFrame,
  timeZone: string
): string {
  const local = `${formatLocalTime(frame.validAt, timeZone)} ${timezoneLabel(frame.validAt, timeZone)}, ${formatLocalDate(frame.validAt, timeZone)}`;
  return frame.kind === "observation"
    ? `Observed, ${precipitationProviderLabel(frame)}, ${local}`
    : `Model forecast, Open-Meteo GFS, ${local}`;
}

export function precipitationLegend(frame: PrecipitationFrame): PrecipitationLegend {
  if (frame.kind === "observation") {
    return {
      title: "Radar reflectivity",
      stops: "transparent, #42d6ff, #3fd05a, #ffe04a, #ff7b31, #e82f45, #bd44dd",
      labels: ["Light", "Moderate", "Heavy"],
      note: "Precipitation intensity, not a surface total",
    };
  }
  return {
    title: "Modeled precipitation",
    stops: "rgba(0,0,0,0), #4fc3f7, #4464d9, #6d2ab3",
    labels: ["0", "1", "5", "10+ mm"],
    note: "Hour-ending modeled total, not radar reflectivity",
  };
}

export function precipitationAttribution(
  frame: PrecipitationFrame,
  radarAttribution: SourceAttribution
): SourceAttribution {
  return frame.kind === "observation" ? radarAttribution : GFS_ATTRIBUTION;
}
