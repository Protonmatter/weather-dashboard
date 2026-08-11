import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Backdrop } from "./components/Backdrop";
import { SearchBar } from "./components/SearchBar";
import { LocationOnboarding } from "./components/LocationOnboarding";
import { SavedLocationsBar } from "./components/SavedLocationsBar";
import { ComparisonBoundary } from "./components/ComparisonBoundary";
import { Hero } from "./components/Hero";
import { PrecipitationCard } from "./components/PrecipitationCard";
import {
  HourlyStrip,
  TenDayForecast,
  AirQualityCard,
  UvCard,
  SunsetCard,
} from "./components/Panels";
import { Card } from "./components/Card";
import { ForecastMapBoundary } from "./components/ForecastMapBoundary";
import { WeatherMetrics } from "./components/WeatherMetrics";
import { usePlaceSearch, useWeatherLoader } from "./hooks/useSearch";
import { useViewport } from "./hooks/useViewport";
import { recordForecast } from "./lib/verification/store";
import { reconcile, scorecard, type Scorecard } from "./lib/verification/verify";
import { loadWeather } from "./lib/weather";
import {
  DeviceLocationError,
  locateDevice,
  type DeviceLocationFailureKind,
} from "./lib/providers/device";
import {
  addSavedLocation,
  readLocationOnboardingComplete,
  readSavedLocations,
  removeSavedLocation,
  savedPlaceId,
  writeLocationOnboardingComplete,
  writeSavedLocations,
  type StorageLike,
} from "./lib/locations/store";
import { fallbackBundle } from "./lib/fallback";
import { decodeWMO } from "./lib/wmo";
import { f2c, fmtClock } from "./lib/units";
import { isAbort } from "./lib/http";
import { deriveWeatherScene } from "./lib/scene";
import { dateAtLocalTime } from "./lib/time";
import type { Place, WeatherBundle } from "./lib/types";
import type { ComparisonCache } from "./lib/comparison/types";

const ForecastMap = lazy(() => import("./components/ForecastMap"));
const ComparisonView = lazy(() => import("./components/ComparisonView"));
const VerificationPanel = lazy(async () => ({
  default: (await import("./components/VerificationPanel")).VerificationPanel,
}));

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

const LOCATION_MESSAGES: Record<DeviceLocationFailureKind, string> = {
  denied: "Location access is off. Allow it in browser settings or search for a place.",
  timeout: "Location timed out. Try again or search for a place.",
  unavailable: "Your location is unavailable. Try again or search for a place.",
  unsupported: "This browser does not support automatic location. Search for a place.",
  insecure: "Automatic location requires a secure connection. Search for a place.",
  unknown: "Location is unavailable. Try again or search for a place.",
};

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function DeferredForecastMap({
  place,
  timezone,
  target,
  unit,
  enabled,
}: {
  place: Place;
  timezone: string;
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
    <div ref={host} data-testid="forecast-map-shell">
      {visible ? (
        <ForecastMapBoundary>
          <Suspense fallback={<Card title="48-hour forecast map" className="mt-4 min-h-72">Loading map…</Card>}>
            <ForecastMap place={place} timezone={timezone} target={target} unit={unit} enabled={enabled} />
          </Suspense>
        </ForecastMapBoundary>
      ) : (
        <Card title="48-hour forecast map" className="mt-4 min-h-72">
          <span className="text-xs text-white/60">Map loads nearby.</span>
        </Card>
      )}
    </div>
  );
}

export default function App() {
  const [locationStorage] = useState<StorageLike | null>(browserStorage);
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => !readLocationOnboardingComplete(locationStorage)
  );
  const initiallyOnboardingOpen = useRef(onboardingOpen);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const compareButtonRef = useRef<HTMLButtonElement>(null);
  const [initialSavedState] = useState(() => readSavedLocations(locationStorage));
  const [savedLocations, setSavedLocations] = useState<Place[]>(initialSavedState.locations);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const comparisonCache = useRef<ComparisonCache>(new Map()).current;
  const selectionSequence = useRef(0);
  const [unit, setUnit] = useState<"F" | "C">("F");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [score, setScore] = useState<Scorecard | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (initialSavedState.warning) setNotice((current) => current ?? initialSavedState.warning);
  }, [initialSavedState.warning]);

  const search = usePlaceSearch(query);
  const target = useViewport();

  const loader = useCallback(
    (place: Place, signal: AbortSignal): Promise<WeatherBundle> => loadWeather(place, signal),
    []
  );
  const weather = useWeatherLoader<WeatherBundle>(fallbackBundle(), loader);
  const data = weather.data;
  const placeKey = `${data.place.lat}:${data.place.lon}`;
  const [rainTodayIn, setRainTodayIn] = useState(data.rainTodayIn);
  const weatherBusy = useRef<boolean>();
  const staleRefreshKey = useRef("");
  weatherBusy.current = weather.busy;

  useEffect(() => {
    const midnight = dateAtLocalTime(new Date(), data.timezone, 0, 0);
    const stale = data.updatedAt < midnight;
    setRainTodayIn(stale ? 0 : data.rainTodayIn);
    const key = `${placeKey}:${+midnight}`;
    if (stale && !weather.busy && staleRefreshKey.current !== key) {
      staleRefreshKey.current = key;
      void weather.load(data.place);
    }
  }, [data, placeKey, weather.busy, weather.load]);

  useEffect(() => {
    const { place, timezone } = data;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (): void => {
      const now = new Date();
      timer = setTimeout(() => {
        setRainTodayIn(0);
        if (!weatherBusy.current) {
          staleRefreshKey.current = `${placeKey}:${+dateAtLocalTime(new Date(), timezone, 0, 0)}`;
          void weather.load(place);
        }
        schedule();
      }, +dateAtLocalTime(now, timezone, 0, 0, 1) - +now);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [data.place, data.timezone, placeKey, weather.load]);

  const T = (f: number): number => Math.round(unit === "F" ? f : f2c(f));

  const pick = useCallback(
    async (place: Place) => {
      const sequence = ++selectionSequence.current;
      setOpen(false);
      setQuery("");
      setNotice(null);
      setPendingPlaceId(savedPlaceId(place));
      try {
        await weather.load(place);
      } finally {
        if (sequence === selectionSequence.current) setPendingPlaceId(null);
      }
    },
    [weather]
  );

  const persistSavedLocations = useCallback((locations: readonly Place[]) => {
    const next = writeSavedLocations(locationStorage, locations);
    setSavedLocations(next.locations);
    if (next.warning) setNotice(next.warning);
    if (next.locations.length < 2) setCompare(false);
  }, [locationStorage]);

  const saveCurrentLocation = useCallback(() => {
    const result = addSavedLocation(savedLocations, data.place);
    if (!result.ok) {
      setNotice({
        duplicate: "This location is already saved.",
        invalid: "This location cannot be saved.",
        limit: "Remove a saved location before adding another.",
      }[result.reason]);
      return;
    }
    persistSavedLocations(result.locations);
    setNotice(`${data.place.name} saved in this browser.`);
  }, [data.place, persistSavedLocations, savedLocations]);

  const removeSaved = useCallback((id: string) => {
    persistSavedLocations(removeSavedLocation(savedLocations, id));
  }, [persistSavedLocations, savedLocations]);

  const openFullForecast = useCallback((candidate: Place) => {
    setCompare(false);
    void pick(candidate);
  }, [pick]);

  useEffect(() => {
    if (search.results.length) setOpen(true);
  }, [search.results]);

  useEffect(() => {
    if (!initiallyOnboardingOpen.current) void weather.load(DEFAULT_PLACE);
    // Intentionally once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishOnboarding = useCallback(() => {
    const persisted = writeLocationOnboardingComplete(locationStorage);
    setOnboardingOpen(false);
    if (!persisted) setNotice("Your location choice is remembered for this session only.");
  }, [locationStorage]);

  const skipLocation = useCallback(() => {
    finishOnboarding();
    void weather.load(DEFAULT_PLACE);
  }, [finishOnboarding, weather]);

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
    setLocating(true);
    try {
      const place = await locateDevice();
      if (onboardingOpen) finishOnboarding();
      await pick(place);
    } catch (err) {
      if (isAbort(err)) return;
      const failure = err instanceof DeviceLocationError
        ? err.kind
        : "unknown";
      if (onboardingOpen) {
        finishOnboarding();
        void weather.load(DEFAULT_PLACE);
      }
      setNotice(LOCATION_MESSAGES[failure]);
    } finally {
      setLocating(false);
    }
  }, [finishOnboarding, onboardingOpen, pick, weather]);

  // RFC 0001 section 5: one codebase, three targets. Mobile-first defaults widen at
  // tablet and go denser and fuller-bleed on a 16:9 desktop.
  const layout = {
    phone: { max: 520, main: "minmax(0, 1fr)", side: "minmax(0, 1fr)", pad: "px-3 py-4", gap: "gap-3" },
    tablet: { max: 1180, main: "repeat(auto-fit, minmax(280px, 1fr))", side: "repeat(auto-fit, minmax(220px, 1fr))", pad: "px-4 py-6 sm:px-6 sm:py-8", gap: "gap-4" },
    cinema: { max: 1760, main: "minmax(360px, 1fr) minmax(0, 2fr)", side: "repeat(auto-fit, minmax(260px, 1fr))", pad: "px-10 py-10", gap: "gap-5" },
  }[target];

  const { current, hourly, daily, place, aqi, ensemble } = data;
  const activePlaceId = savedPlaceId(place);
  const canSaveCurrent = !savedLocations.some((candidate) => savedPlaceId(candidate) === activePlaceId);
  const cond = decodeWMO(current.code, current.isDay);
  const scene = deriveWeatherScene(current);
  const today = daily[0];
  const message = notice ?? weather.error ?? search.error;

  return (
    <div className="relative w-full min-h-screen overflow-x-clip text-white" style={{ fontFamily: FONT, WebkitFontSmoothing: "antialiased" }}>
      <Backdrop scene={scene} />

      <LocationOnboarding
        open={onboardingOpen}
        busy={locating}
        onUseLocation={() => void locate()}
        onNotNow={skipLocation}
        restoreFocusRef={searchInputRef}
      />

      <div className={`relative mx-auto ${layout.pad}`} style={{ maxWidth: layout.max }} data-target={target}>
        <SearchBar
          inputRef={searchInputRef}
          query={query}
          onQuery={setQuery}
          results={search.results}
          busy={search.busy}
          open={open}
          onOpen={setOpen}
          onPick={pick}
          onLocate={() => void locate()}
          locating={locating}
          onRefresh={() => void weather.load(place)}
          refreshing={weather.busy}
          unit={unit}
          onUnit={() => setUnit(unit === "F" ? "C" : "F")}
        />

        <SavedLocationsBar
          locations={savedLocations}
          activeId={activePlaceId}
          pendingId={pendingPlaceId}
          canSaveCurrent={canSaveCurrent}
          compare={compare}
          compareButtonRef={compareButtonRef}
          onSelect={(candidate) => void pick(candidate)}
          onSaveCurrent={saveCurrentLocation}
          onRemove={removeSaved}
          onCompare={() => setCompare((currentCompare) => !currentCompare)}
        />

        {message && (
          <p className="mb-4 text-xs" style={{ color: "rgba(255,255,255,0.62)" }} role="status">
            {message}
          </p>
        )}

        {compare ? (
          <ComparisonBoundary onExit={() => setCompare(false)} restoreFocusRef={compareButtonRef}>
            <Suspense fallback={<p className="min-h-64 text-sm text-white/60" role="status">Opening comparison…</p>}>
              <ComparisonView
                places={savedLocations}
                unit={unit}
                cache={comparisonCache}
                onOpenFull={openFullForecast}
              />
            </Suspense>
          </ComparisonBoundary>
        ) : (
          <>
        <Hero place={place} current={current} today={today} hourly={hourly} T={T} timezone={data.timezone} />
        <HourlyStrip hourly={hourly} T={T} spread={ensemble.tempSpread} timezone={data.timezone} />

        <div
          className={`grid ${layout.gap}`}
          style={{ gridTemplateColumns: layout.main }}
          data-testid="forecast-summary"
        >
          <TenDayForecast daily={daily} current={current} hourly={hourly} T={T} timezone={data.timezone} />
          <div className={`grid ${layout.gap}`} style={{ gridTemplateColumns: layout.side }}>
            <AirQualityCard aqi={aqi} wet={cond.wet} />
            <PrecipitationCard ens={ensemble} hourly={hourly} timezone={data.timezone} />
            <UvCard uv={today?.uv ?? 0} />
            <SunsetCard day={today} timezone={data.timezone} />
          </div>
        </div>

            <WeatherMetrics
              current={current}
              uv={today?.uv ?? 0}
              rainTodayIn={rainTodayIn}
              ensemble={ensemble}
              placeKey={placeKey}
            />

        <DeferredForecastMap place={place} timezone={data.timezone} target={target} unit={unit} enabled={data.live} />

            {score && (
              <div className="mt-4">
                <Suspense fallback={<Card title="Forecast verification">Loading verification…</Card>}>
                  <VerificationPanel score={score} />
                </Suspense>
              </div>
            )}

        <footer className="mt-6 flex items-center justify-between" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
          <span>
            {data.live ? "Live data from Open-Meteo" : "Sample forecast"} · {ensemble.source} ({ensemble.n}) · Updated{" "}
            {fmtClock(data.updatedAt, data.timezone)}
          </span>
          <span>{unit === "F" ? "Fahrenheit" : "Celsius"}</span>
        </footer>
          </>
        )}
      </div>
    </div>
  );
}
