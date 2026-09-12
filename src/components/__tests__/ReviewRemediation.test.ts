import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fallbackBundle } from "../../lib/fallback";
import { ensembleStats } from "../../lib/ensemble";
import { Hero } from "../Hero";
import { UvCard } from "../Panels";
import { PrecipitationCard } from "../PrecipitationCard";
import { WeatherMetrics } from "../WeatherMetrics";
import { WindVisibilityCard } from "../OverviewCards";
import { ForecastOverview } from "../ForecastOverview";

describe("reviewed forecast presentation regressions", () => {
  it.each([3, 5])("recommends sun protection at moderate UV %s without inventing cloud cover", (uv) => {
    const markup = renderToStaticMarkup(createElement(UvCard, { uv }));
    expect(markup).toMatch(/protection|sunscreen/i);
    expect(markup).not.toMatch(/optional|cloud cover|minimal/i);
  });

  it("shows unavailable UV without a risk classification, gauge, or advice", () => {
    const markup = renderToStaticMarkup(createElement(UvCard, { uv: null }));
    expect(markup).toContain("Unavailable");
    expect(markup).not.toMatch(/Low|sunscreen|protection|sunglasses|left:/i);
  });

  it("retains missing UV through the overview instead of substituting zero", () => {
    const data = fallbackBundle();
    const markup = renderToStaticMarkup(createElement(ForecastOverview, {
      ...data, daily: data.daily.map((day) => ({ ...day, uv: null })), T: Math.round, target: "phone", wet: false,
    }));
    expect(markup).toContain("Unavailable");
    expect(markup).not.toMatch(/Low risk|sunglasses/i);
  });

  it("shows missing visibility and UV as unavailable in weather details and the overview card", () => {
    const data = fallbackBundle();
    const current = { ...data.current, visibility: null };
    const metrics = renderToStaticMarkup(createElement(WeatherMetrics, {
      current, uv: null, ensemble: data.ensemble, rainTodayIn: 0, placeKey: "fixture",
    }));
    expect(metrics).toContain('aria-label="UV index: Unavailable"');
    expect(metrics).toContain('aria-label="Visibility: Unavailable"');
    const card = renderToStaticMarkup(createElement(WindVisibilityCard, { current }));
    expect(card).toContain("Unavailable");
    expect(card).not.toContain(">mi<");
  });

  it("preserves a measured zero UV and zero visibility", () => {
    const data = fallbackBundle();
    const current = { ...data.current, visibility: 0 };
    const markup = renderToStaticMarkup(createElement(WeatherMetrics, {
      current, uv: 0, ensemble: data.ensemble, rainTodayIn: 0, placeKey: "fixture",
    }));
    expect(markup).toContain('aria-label="UV index: 0 · Low"');
    expect(markup).toContain('aria-label="Visibility: 0.0 mi"');
  });

  it("describes approaching rain without inventing a clearing transition or evening", () => {
    const data = fallbackBundle();
    const hourly = data.hourly.slice(0, 12).map((hour, index) => ({
      ...hour, time: new Date(Date.UTC(2026, 8, 12, index)), code: index === 11 ? 61 : 0,
    }));
    const markup = renderToStaticMarkup(createElement(Hero, {
      ...data, current: { ...data.current, code: 0 }, hourly, T: Math.round, timezone: "UTC",
    }));
    expect(markup).toMatch(/precipitation|rain/i);
    expect(markup).not.toMatch(/then clearing|evening/i);
    expect(markup).toContain("11AM");
  });

  it.each(["wet-tail", "dry-tail"] as const)("does not turn a %s quantile into universal agreement", (tail) => {
    const data = fallbackBundle();
    const members = Array.from({ length: 31 }, (_, index) => Array.from({ length: 24 }, () =>
      tail === "wet-tail" ? (index === 30 ? 0.1 : 0) : (index === 30 ? 0 : 0.1)));
    const ens = { ...ensembleStats(members), live: true, source: "GFS ensemble" };
    const markup = renderToStaticMarkup(createElement(PrecipitationCard, { ens, hourly: data.hourly, timezone: "UTC" }));
    expect(markup).not.toMatch(/Every member stays dry|All members are wet/);
  });

  it("identifies synthetic chart values as illustrative in its accessible name", () => {
    const data = fallbackBundle();
    const markup = renderToStaticMarkup(createElement(PrecipitationCard, {
      ens: data.ensemble, hourly: data.hourly, timezone: data.timezone,
    }));
    expect(markup).toMatch(/aria-label="[^"]*(?:Synthetic|Illustrative)/);
    expect(markup).not.toContain('aria-label="Ensemble precipitation spread.');
  });

  it("labels the actual complete precipitation window rather than NOW or generic next 24 hours", () => {
    const data = fallbackBundle();
    const ens = {
      ...data.ensemble,
      windowStart: new Date("2026-09-12T13:00:00Z"),
      windowEnd: new Date("2026-09-13T13:00:00Z"),
      validTimes: Array.from({ length: 24 }, (_, index) => new Date(Date.UTC(2026, 8, 12, 14 + index))),
    };
    const markup = renderToStaticMarkup(createElement(PrecipitationCard, { ens, hourly: data.hourly, timezone: "UTC" }));
    expect(markup).toContain("Sep 12");
    expect(markup).toContain("Sep 13");
    expect(markup).not.toMatch(/next 24 hours|>NOW<|>\+24H</);
    expect(markup).toMatch(/hour.ending/i);
  });
});
