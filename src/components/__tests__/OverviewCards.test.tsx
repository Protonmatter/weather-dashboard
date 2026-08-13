import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DayPoint } from "../../lib/types";
import { TemperatureTrendCard } from "../OverviewCards";

function celsius(fahrenheit: number): number {
  return Math.round(((fahrenheit - 32) * 5) / 9);
}

describe("TemperatureTrendCard", () => {
  it("centres a series that becomes flat after unit conversion", () => {
    const daily: DayPoint[] = Array.from({ length: 7 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 7, 13 + index)),
      low: 49.8 + index * 0.05,
      high: 50.2 + index * 0.05,
      code: 1,
      uv: 3,
      sunrise: null,
      sunset: null,
    }));

    const markup = renderToStaticMarkup(
      <TemperatureTrendCard daily={daily} T={celsius} />
    );
    const points = markup.match(/<polyline[^>]*points="([^"]+)"/)?.[1];
    expect(points).toBeDefined();
    const yCoordinates = points!
      .split(" ")
      .map((point) => Number(point.split(",")[1]));
    expect(new Set(yCoordinates)).toEqual(new Set([54]));
  });
});
