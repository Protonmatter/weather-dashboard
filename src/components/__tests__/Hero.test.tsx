import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CurrentConditions, Place } from "../../lib/types";
import { Hero } from "../Hero";

const place: Place = {
  lat: 37.4419,
  lon: -122.143,
  name: "Palo Alto",
  admin: "California",
  country: "United States",
  cc: "us",
};

const current: CurrentConditions = {
  time: new Date("2026-08-13T07:00:00.000Z"),
  intervalSeconds: 900,
  temp: 67,
  feels: 63,
  humidity: 84,
  code: 61,
  isDay: true,
  wind: 6,
  pressure: 1013,
  precipitationIn: 0.03,
  precipRateMmH: 3.048,
  cloudCover: 80,
  visibility: 10,
};

describe("Hero precipitation provenance", () => {
  it("presents an explicit modeled rate instead of an ambiguous interval total", () => {
    const markup = renderToStaticMarkup(
      <Hero
        place={place}
        timeZone="America/Los_Angeles"
        current={current}
        hourly={[]}
        T={(value) => Math.round(value)}
      />
    );

    expect(markup).toContain("Modeled rate");
    expect(markup).toContain("0.12 in/h");
    expect(markup).not.toContain(">Interval<");
  });
});
