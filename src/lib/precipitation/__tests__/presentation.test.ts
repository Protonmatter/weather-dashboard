import { describe, expect, it } from "vitest";
import {
  precipitationAriaValueText,
  precipitationAttribution,
  precipitationLegend,
  precipitationSourceBadge,
  precipitationTimestampLabel,
} from "../presentation";
import type { ForecastPrecipitationFrame, ObservationPrecipitationFrame } from "../types";

const observation: ObservationPrecipitationFrame = {
  kind: "observation",
  id: "observation:noaa-mrms:o1",
  validAt: new Date("2026-08-13T16:00:00.000Z"),
  provider: "noaa-mrms",
  radarFrame: { id: "o1", validAt: new Date("2026-08-13T16:00:00.000Z") },
};
const forecast: ForecastPrecipitationFrame = {
  kind: "forecast",
  id: "forecast:open-meteo-gfs:2026-08-13T17:00:00.000Z",
  validAt: new Date("2026-08-13T17:00:00.000Z"),
  provider: "open-meteo-gfs",
  forecastIndex: 3,
};

describe("precipitation presentation", () => {
  it("labels observation frames as radar reflectivity", () => {
    expect(precipitationSourceBadge(observation)).toBe("OBSERVED · NOAA / NWS MRMS");
    expect(precipitationLegend(observation)).toMatchObject({
      title: "Radar reflectivity",
      note: "Precipitation intensity, not a surface total",
    });
    expect(precipitationTimestampLabel(observation, "America/New_York"))
      .toMatch(/^Observed /);
  });

  it("never labels GFS precipitation as radar or observed", () => {
    const badge = precipitationSourceBadge(forecast);
    const legend = precipitationLegend(forecast);
    const aria = precipitationAriaValueText(forecast, "America/New_York");

    expect(badge).toBe("MODEL FORECAST · Open-Meteo GFS");
    expect(legend).toEqual({
      title: "Modeled precipitation",
      stops: "rgba(0,0,0,0), #4fc3f7, #4464d9, #6d2ab3",
      labels: ["0", "1", "5", "10+ mm"],
      note: "Hour-ending modeled total, not radar reflectivity",
    });
    expect(aria).toMatch(/^Model forecast, Open-Meteo GFS, /);
    expect(`${badge} ${legend.title} ${aria}`).not.toMatch(/\bOBSERVED\b|\bMRMS\b|Radar observation/);
  });

  it("uses source-specific attribution", () => {
    const radar = { label: "NOAA / NWS MRMS", url: "https://www.weather.gov/" };
    expect(precipitationAttribution(observation, radar)).toBe(radar);
    expect(precipitationAttribution(forecast, radar)).toEqual({
      label: "Open-Meteo GFS",
      url: "https://open-meteo.com/en/docs/gfs-api",
    });
  });
});
