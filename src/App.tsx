import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Backdrop } from "./components/Backdrop";
import { SearchBar } from "./components/SearchBar";
import { Hero } from "./components/Hero";
import { PrecipitationCard } from "./components/PrecipitationCard";
import {
  HourlyStrip,
  TenDayForecast,
  AirQualityCard,
  UvCard,
  SunsetCard,
  DetailsGrid,
} from "./components/Panels";
import { VerificationPanel } from "./components/VerificationPanel";
import { Card } from "./components/Card";
import { usePlaceSearch, useWeatherLoader } from "./hooks/useSearch";
import { useViewport } from "./hooks/useViewport";
import { recordForecast } from "./lib/verification/store";
import { reconcile, scorecard, type Scorecard } from "./lib/verification/verify";
import { loadWeather } from "./lib/weather";
import { locateDevice } from "./lib/providers/device";
import { fallbackBundle } from "./lib/fallback";
import { decodeWMO } from "./lib/wmo";
import { f2c, fmtClock } from "./lib/units";
import { isAbort } from "./lib/http";
import type { Place, WeatherBundle } from "./lib/types";

const ForecastMap = lazy(() => import("./components/ForecastMap"));

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif';

const DEFAULT_PLACE: Place = {
  lat: 37.4419,
  lon: -122.143,
  name: "Palo Alto",
  admin: "California",
  country: "United States",
  cc: "us",
};

function DeferredForecastMap({
  place,
  target,
  unit,
  enabled,
}: {
  place: Place;
  target: "phone" | "tablet" | "cinema";
  unit: "F" | "C";
  enabled: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element || visible) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={host}>
      {visible ? (
        <Suspense fallback={<Card title="48-hour forecast map" className="mt-4 min-h-72">Loading map module…</Card>}>
          <ForecastMap place={place} target={target} unit={unit} enabled={enabled} />
        </Suspense>
      ) : (
        <Card title="48-hour forecast map" className="mt-4 min-h-72">
          <span className="text-xs text-white/60">Map loads as it approaches the viewport.</span>
        </Card>
      )}
    </div>
  );
}

export default function App() {
  const [unit, setUnit] = useState<"F" | "C">("F");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [score, setScore] = useState<Scorecard | null>(null);

  const search = usePlaceSearch(query);
  const target = useViewport();

  const loader = useCallback(
    (place: Place, signal: AbortSignal): Promise<WeatherBundle> => loadWeather(place, signal),
    []
  );
  const weather = useWeatherLoader<WeatherBundle>(fallbackBundle(), loader);

  const T = (f: number): number => Math.round(unit === "F" ? f : f2c(f));

  const pick = useCallback(
    (place: Place) => {
      setOpen(false);
      setQuery("");
      setNotice(null);
      void weather.load(place);
    },
    [weather]
  );

  useEffect(() => {
    if (search.results.length) setOpen(true);
  }, [search.results]);

  useEffect(() => {
    void weather.load(DEFAULT_PLACE);
    // Intentionally once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Archive each live forecast the moment it renders, then score whatever has elapsed.
  // Recording must happen before the outcome is knowable — scoring against data fetched
  // after the fact would prove nothing.
  useEffect(() => {
    const bundle = weather.data;
    if (!bundle.live || !bundle.ensemble.live) return;

    const ctrl = new AbortController();
    void (async () => {
      recordForecast({
        lat: bundle.place.lat,
        lon: bundle.place.lon,
        members: bundle.ensemble.memberSeries ?? [],
        // Cap to the ensemble's 24h window: a 240-hour axis against 24-hour member rows
        // would archive phantom zero-member records for every hour past the window.
        validTimes: bundle.hourly.slice(0, 24).map((h) => h.time),
        live: true,
        tempMembers: bundle.ensemble.tempMemberSeries,
      });
      try {
        await reconcile(ctrl.signal);
      } catch {
        // Verification is a side channel; a failure here must not disturb the forecast.
      }
      if (!ctrl.signal.aborted) setScore(scorecard());
    })();

    return () => ctrl.abort();
  }, [weather.data]);

  useEffect(() => {
    setScore(scorecard());
  }, []);

  const locate = useCallback(async () => {
    setNotice(null);
    try {
      const place = await locateDevice();
      pick(place);
    } catch (err) {
      if (isAbort(err)) return;
      const denied = (err as GeolocationPositionError)?.code === 1;
      setNotice(
        denied
          ? "Location access was denied. Search for a city or postal code instead."
          : "Couldn't get your location. Search for a city or postal code instead."
      );
    }
  }, [pick]);

  // RFC 0001 section 5: one codebase, three targets. Mobile-first defaults widen at
  // tablet and go denser and fuller-bleed on a 16:9 desktop.
  const layout = {
    phone: { max: 520, main: "minmax(0, 1fr)", side: "minmax(0, 1fr)", pad: "px-3 py-4", gap: "gap-3" },
    tablet: { max: 1180, main: "repeat(auto-fit, minmax(280px, 1fr))", side: "repeat(auto-fit, minmax(220px, 1fr))", pad: "px-4 py-6 sm:px-6 sm:py-8", gap: "gap-4" },
    cinema: { max: 1760, main: "minmax(360px, 1fr) minmax(0, 2fr)", side: "repeat(auto-fit, minmax(260px, 1fr))", pad: "px-10 py-10", gap: "gap-5" },
  }[target];

  const data = weather.data;
  const { current, hourly, daily, place, aqi, ensemble } = data;
  const cond = decodeWMO(current.code, current.isDay);
  const today = daily[0];
  const message = notice ?? weather.error ?? search.error;

  return (
    <div className="relative w-full min-h-screen text-white" style={{ fontFamily: FONT, WebkitFontSmoothing: "antialiased" }}>
      <Backdrop wet={cond.wet} isDay={current.isDay} storm={cond.storm} />

      <div className={`relative mx-auto ${layout.pad}`} style={{ maxWidth: layout.max }} data-target={target}>
        <SearchBar
          query={query}
          onQuery={setQuery}
          results={search.results}
          busy={search.busy}
          open={open}
          onOpen={setOpen}
          onPick={pick}
          onLocate={() => void locate()}
          onRefresh={() => void weather.load(place)}
          refreshing={weather.busy}
          unit={unit}
          onUnit={() => setUnit(unit === "F" ? "C" : "F")}
        />

        {message && (
          <p className="mb-4 text-xs" style={{ color: "rgba(255,255,255,0.62)" }} role="status">
            {message}
          </p>
        )}

        <Hero place={place} current={current} today={today} hourly={hourly} T={T} />
        <HourlyStrip hourly={hourly} T={T} spread={ensemble.tempSpread} />
        <DeferredForecastMap place={place} target={target} unit={unit} enabled={data.live} />

        <div className={`grid ${layout.gap}`} style={{ gridTemplateColumns: layout.main }}>
          <TenDayForecast daily={daily} current={current} hourly={hourly} T={T} />
          <div className={`grid ${layout.gap}`} style={{ gridTemplateColumns: layout.side }}>
            <AirQualityCard aqi={aqi} wet={cond.wet} />
            <PrecipitationCard ens={ensemble} hourly={hourly} />
            <UvCard uv={today?.uv ?? 0} />
            <SunsetCard day={today} />
          </div>
        </div>

        {score && (
          <div className="mt-4">
            <VerificationPanel score={score} />
          </div>
        )}

        <DetailsGrid current={current} />

        <footer className="mt-6 flex items-center justify-between" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
          <span>
            {data.live ? "Live data from Open-Meteo" : "Sample forecast"} · {ensemble.source} ({ensemble.n}) · Updated{" "}
            {fmtClock(new Date())}
          </span>
          <span>{unit === "F" ? "Fahrenheit" : "Celsius"}</span>
        </footer>
      </div>
    </div>
  );
}
