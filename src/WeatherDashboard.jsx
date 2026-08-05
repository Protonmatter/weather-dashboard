import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Sun, Moon, Cloud, Cloudy, CloudSun, CloudMoon, CloudFog, CloudDrizzle,
  CloudRain, CloudSnow, CloudLightning, Sunrise, Search, MapPin, RefreshCw,
  Loader2, Droplets, Wind, Eye, Gauge, X,
} from "lucide-react";

/* ---------------------------------------------------------------- helpers */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f2c = (f) => (f - 32) * (5 / 9);

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif';

/** Apple-ish temperature ramp: deep blue (cold) -> cyan -> green -> amber -> red */
function tempColor(f) {
  const t = clamp((f - 15) / 85, 0, 1);
  const hue = 225 - 225 * Math.pow(t, 0.92);
  const sat = 72 + 20 * t;
  const light = 52 + 8 * (1 - Math.abs(t - 0.5) * 2);
  return `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
}

/** WMO weather code -> { Icon, label, wet, storm } */
function decodeWMO(code, isDay = true) {
  const D = isDay;
  const map = {
    0: [D ? Sun : Moon, "Clear"],
    1: [D ? Sun : Moon, "Mostly Clear"],
    2: [D ? CloudSun : CloudMoon, "Partly Cloudy"],
    3: [Cloudy, "Overcast"],
    45: [CloudFog, "Fog"],
    48: [CloudFog, "Freezing Fog"],
    51: [CloudDrizzle, "Light Drizzle"],
    53: [CloudDrizzle, "Drizzle"],
    55: [CloudDrizzle, "Heavy Drizzle"],
    56: [CloudDrizzle, "Freezing Drizzle"],
    57: [CloudDrizzle, "Freezing Drizzle"],
    61: [CloudRain, "Light Rain"],
    63: [CloudRain, "Rain"],
    65: [CloudRain, "Heavy Rain"],
    66: [CloudRain, "Freezing Rain"],
    67: [CloudRain, "Freezing Rain"],
    71: [CloudSnow, "Light Snow"],
    73: [CloudSnow, "Snow"],
    75: [CloudSnow, "Heavy Snow"],
    77: [CloudSnow, "Snow Grains"],
    80: [CloudRain, "Showers"],
    81: [CloudRain, "Showers"],
    82: [CloudRain, "Heavy Showers"],
    85: [CloudSnow, "Snow Showers"],
    86: [CloudSnow, "Snow Showers"],
    95: [CloudLightning, "Thunderstorms"],
    96: [CloudLightning, "Thunderstorms"],
    99: [CloudLightning, "Thunderstorms"],
  };
  const [Icon, label] = map[code] || [Cloud, "Cloudy"];
  return {
    Icon,
    label,
    wet: code >= 51 && code <= 99,
    storm: code >= 95,
  };
}

const AQI_BANDS = [
  [50, "Good", "#3fd67c"],
  [100, "Moderate", "#f7d94c"],
  [150, "Unhealthy for Some", "#f79a3e"],
  [200, "Unhealthy", "#ee5b5b"],
  [300, "Very Unhealthy", "#a25ddc"],
  [500, "Hazardous", "#8b3a4d"],
];
const aqiBand = (v) => AQI_BANDS.find((b) => v <= b[0]) || AQI_BANDS[5];
const uvLabel = (v) =>
  v <= 2 ? "Low" : v <= 5 ? "Moderate" : v <= 7 ? "High" : v <= 10 ? "Very High" : "Extreme";

const fmtHour = (d) => {
  const h = d.getHours();
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ap}`;
};
const fmtClock = (d) => {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ap}`;
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ------------------------------------------------------------- fallback data
   Mirrors the reference screenshot so the app is never empty. */

function fallbackData() {
  const now = new Date();
  const base = new Date(now);
  base.setMinutes(0, 0, 0);
  const hourTemps = [67, 66, 65, 66, 68, 70, 69, 66, 62, 59, 57, 56, 55, 54, 54, 54, 54, 55, 56, 58, 61, 64, 68, 71];
  const hourCodes = [61, 61, 61, 3, 3, 3, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0];
  const pop = [72, 65, 58, 40, 24, 16, 10, 8, 6, 5, 4, 4, 3, 3, 4, 5, 6, 5, 4, 2, 2, 1, 1, 0];
  const hourly = hourTemps.map((t, i) => {
    const time = new Date(base.getTime() + i * 3600e3);
    const h = time.getHours();
    return { time, temp: t, code: hourCodes[i], isDay: h >= 7 && h < 18, pop: pop[i] };
  });
  const dayRows = [
    [54, 72, 61], [53, 73, 3], [54, 75, 0], [55, 76, 0], [56, 74, 3],
    [55, 77, 0], [56, 78, 0], [57, 76, 3], [56, 75, 0], [57, 77, 0],
  ];
  const daily = dayRows.map(([lo, hi, code], i) => {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    return { date, low: lo, high: hi, code, uv: 3, sunrise: setT(date, 7, 4), sunset: setT(date, 17, 12) };
  });
  return {
    place: { name: "Palo Alto", admin: "California", country: "United States" },
    current: { temp: 67, feels: 63, code: 61, isDay: true, humidity: 84, wind: 6, visibility: 7.2, pressure: 29.9 },
    hourly,
    daily,
    aqi: 28,
    ensemble: { ...ensembleStats(synthMembers(pop)), source: "modeled spread", live: false },
    demo: true,
  };
}
function setT(d, h, m) {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

/* ------------------------------------------------------------------ fetch */

async function loadWeather(lat, lon, place) {
  const wx =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,surface_pressure` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,is_day,visibility` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=10`;
  const aq =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi&timezone=auto`;

  const [wRes, aRes] = await Promise.all([fetch(wx), fetch(aq).catch(() => null)]);
  if (!wRes.ok) throw new Error("forecast unavailable");
  const w = await wRes.json();
  let aqi = null;
  try {
    if (aRes && aRes.ok) aqi = (await aRes.json())?.current?.us_aqi ?? null;
  } catch (_) {}

  const nowIdx = Math.max(
    0,
    w.hourly.time.findIndex((t) => new Date(t).getTime() >= Date.now() - 3600e3)
  );
  const hourly = w.hourly.time.slice(nowIdx, nowIdx + 24).map((t, i) => {
    const j = nowIdx + i;
    return {
      time: new Date(t),
      temp: Math.round(w.hourly.temperature_2m[j]),
      code: w.hourly.weather_code[j],
      isDay: w.hourly.is_day[j] === 1,
      pop: w.hourly.precipitation_probability?.[j] ?? 0,
    };
  });
  const daily = w.daily.time.map((t, i) => ({
    date: new Date(t + "T12:00:00"),
    low: Math.round(w.daily.temperature_2m_min[i]),
    high: Math.round(w.daily.temperature_2m_max[i]),
    code: w.daily.weather_code[i],
    uv: w.daily.uv_index_max[i],
    sunrise: new Date(w.daily.sunrise[i]),
    sunset: new Date(w.daily.sunset[i]),
  }));

  const ensemble = await ensembleFor(lat, lon, hourly);

  return {
    place,
    ensemble,
    current: {
      temp: Math.round(w.current.temperature_2m),
      feels: Math.round(w.current.apparent_temperature),
      code: w.current.weather_code,
      isDay: w.current.is_day === 1,
      humidity: Math.round(w.current.relative_humidity_2m),
      wind: Math.round(w.current.wind_speed_10m),
      visibility: hourly.length ? (w.hourly.visibility?.[nowIdx] ?? 16000) / 1609 : 10,
      pressure: w.current.surface_pressure * 0.02953,
    },
    hourly,
    daily,
    aqi,
    demo: false,
  };
}

/* --------------------------------------------------- ensemble / uncertainty */

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/** members: array of per-member hourly precipitation series (inches) */
function ensembleStats(members) {
  const n = members.length;
  const hours = members[0]?.length || 0;
  const perHour = [];
  for (let h = 0; h < hours; h++) {
    const col = members.map((m) => m[h]).sort((a, b) => a - b);
    perHour.push({
      p10: quantile(col, 0.1),
      p50: quantile(col, 0.5),
      p90: quantile(col, 0.9),
      exceed: (col.filter((v) => v >= 0.004).length / n) * 100,
    });
  }
  const totals = members.map((m) => m.reduce((a, b) => a + b, 0)).sort((a, b) => a - b);
  const wettest = perHour.reduce((best, p, i) => (p.p50 > perHour[best].p50 ? i : best), 0);
  return {
    n,
    perHour,
    t10: quantile(totals, 0.1),
    t50: quantile(totals, 0.5),
    t90: quantile(totals, 0.9),
    pop24: (totals.filter((v) => v >= 0.01).length / n) * 100,
    peak: Math.max(0.02, ...perHour.map((p) => p.p90)),
    wettest,
  };
}

/** Deterministic pseudo-members from hourly PoP — keeps the fan chart honest
    in shape when the ensemble endpoint is unreachable. Clearly labeled as modeled. */
function synthMembers(hourlyPop, seed = 7) {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return Array.from({ length: 31 }, () => {
    const bias = 0.5 + rnd() * 1.1;
    return hourlyPop.map((p) => {
      const prob = p / 100;
      return rnd() < prob ? +(prob * 0.1 * bias * (0.3 + rnd() * 1.7)).toFixed(4) : 0;
    });
  });
}

async function loadEnsemble(lat, lon) {
  const url =
    `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation&models=gfs025&forecast_days=2&precipitation_unit=inch&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("ensemble unavailable");
  const j = await r.json();
  const keys = Object.keys(j.hourly).filter((k) => k.startsWith("precipitation"));
  const start = Math.max(
    0,
    j.hourly.time.findIndex((t) => new Date(t).getTime() >= Date.now() - 3600e3)
  );
  const members = keys
    .map((k) => j.hourly[k].slice(start, start + 24).map((v) => v ?? 0))
    .filter((m) => m.length === 24);
  if (members.length < 3) throw new Error("too few members");
  return members;
}

async function ensembleFor(lat, lon, hourly) {
  try {
    const members = await loadEnsemble(lat, lon);
    return { ...ensembleStats(members), source: "GFS ensemble", live: true };
  } catch {
    return {
      ...ensembleStats(synthMembers(hourly.map((h) => h.pop || 0))),
      source: "modeled spread",
      live: false,
    };
  }
}

/* ------------------------------------------------------------ place search
   Three sources, queried in parallel, merged and de-duplicated:
     · Open-Meteo geocoding — cities worldwide, population-ranked, clean admin names
     · Zippopotam.us       — authoritative structured lookup for a known postal code
     · Photon (Komoot/OSM) — everything else: postcodes, addresses, landmarks, villages
   All three are keyless and CORS-enabled, so this runs entirely from the browser. */

const flag = (cc) =>
  cc && cc.length === 2
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : "";

/** Country tokens people actually type after a postal code. */
const COUNTRY_ALIASES = {
  us: "us", usa: "us", "united states": "us", america: "us",
  uk: "gb", gb: "gb", "great britain": "gb", "united kingdom": "gb", england: "gb",
  ca: "ca", canada: "ca", de: "de", germany: "de", deutschland: "de",
  fr: "fr", france: "fr", es: "es", spain: "es", it: "it", italy: "it",
  nl: "nl", netherlands: "nl", be: "be", belgium: "be", ch: "ch", switzerland: "ch",
  at: "at", austria: "at", pl: "pl", poland: "pl", pt: "pt", portugal: "pt",
  jp: "jp", japan: "jp", au: "au", australia: "au", nz: "nz", "new zealand": "nz",
  in: "in", india: "in", br: "br", brazil: "br", mx: "mx", mexico: "mx",
  se: "se", sweden: "se", no: "no", norway: "no", dk: "dk", denmark: "dk",
  fi: "fi", finland: "fi", ie: "ie", ireland: "ie", kr: "kr", "south korea": "kr",
  za: "za", "south africa": "za", tr: "tr", turkey: "tr", ru: "ru", russia: "ru",
};

/** Postal shapes, most-specific first. `cc` null means "shape is ambiguous across countries". */
const POSTAL_SHAPES = [
  { re: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, cc: "gb" },
  { re: /^[A-Z]\d[A-Z][\s-]?\d[A-Z]\d$/i, cc: "ca" },
  { re: /^\d{3}-?\d{4}$/, cc: "jp" },
  { re: /^\d{5}-\d{4}$/, cc: "us" },
  { re: /^\d{4}\s?[A-Z]{2}$/i, cc: "nl" },
  { re: /^\d{5}$/, cc: null },
  { re: /^\d{4}$/, cc: null },
  { re: /^\d{6}$/, cc: null },
];

function parseQuery(raw) {
  const q = raw.trim().replace(/\s+/g, " ");

  // "37.44, -122.14" — straight coordinates
  const coord = q.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (coord) {
    const lat = parseFloat(coord[1]);
    const lon = parseFloat(coord[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { kind: "coords", lat, lon };
  }

  // trailing country token: "75008 France", "SW1A 1AA UK", "10115, DE"
  let body = q;
  let cc = null;
  const parts = q.split(/[,\s]+/);
  for (let take = 2; take >= 1; take--) {
    if (parts.length <= take) continue;
    const tail = parts.slice(-take).join(" ").toLowerCase();
    if (COUNTRY_ALIASES[tail]) {
      cc = COUNTRY_ALIASES[tail];
      body = parts.slice(0, -take).join(" ");
      break;
    }
  }

  const shape = POSTAL_SHAPES.find((s) => s.re.test(body.replace(/,$/, "")));
  if (shape) return { kind: "postal", code: body.replace(/,$/, ""), cc: cc || shape.cc, text: q };
  return { kind: "text", text: q, cc };
}

async function fromOpenMeteo(text) {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=8&language=en&format=json`
  );
  if (!r.ok) throw new Error("open-meteo geocoding failed");
  const j = await r.json();
  return (j.results || []).map((x) => ({
    lat: x.latitude,
    lon: x.longitude,
    name: x.name,
    admin: x.admin1 || "",
    country: x.country || "",
    cc: (x.country_code || "").toLowerCase(),
    postcode: "",
    population: x.population || 0,
    src: "om",
  }));
}

async function fromZippopotam(code, cc) {
  const r = await fetch(`https://api.zippopotam.us/${cc}/${encodeURIComponent(code)}`);
  if (!r.ok) throw new Error("postal code not found");
  const j = await r.json();
  return (j.places || []).map((p) => ({
    lat: parseFloat(p.latitude),
    lon: parseFloat(p.longitude),
    name: p["place name"],
    admin: p.state || "",
    country: j.country || "",
    cc: (j["country abbreviation"] || cc).toLowerCase(),
    postcode: j["post code"] || code,
    population: 0,
    src: "zip",
    exact: true,
  }));
}

async function fromPhoton(text, cc) {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=8&lang=en` +
    (cc ? `&layer=city&layer=district&layer=locality&layer=house` : "");
  const r = await fetch(url);
  if (!r.ok) throw new Error("photon failed");
  const j = await r.json();
  return (j.features || []).map((f) => {
    const p = f.properties || {};
    return {
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      name: p.name || p.city || p.district || p.postcode || text,
      admin: p.state || p.county || "",
      country: p.country || "",
      cc: (p.countrycode || "").toLowerCase(),
      postcode: p.postcode || "",
      population: 0,
      src: "photon",
    };
  });
}

/** Fan out, merge, de-duplicate by ~1km grid, rank exact postal hits and big cities first. */
async function searchPlaces(raw) {
  const p = parseQuery(raw);

  if (p.kind === "coords") {
    return [
      {
        lat: p.lat,
        lon: p.lon,
        name: `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`,
        admin: "",
        country: "Pinned coordinates",
        cc: "",
        postcode: "",
        population: 0,
        src: "coords",
        exact: true,
      },
    ];
  }

  const jobs = [];
  if (p.kind === "postal") {
    const ccs = p.cc ? [p.cc] : ["us", "de", "fr", "es", "it"];
    ccs.forEach((cc) => jobs.push(fromZippopotam(p.code, cc)));
    jobs.push(fromPhoton(p.text, p.cc));
  } else {
    jobs.push(fromOpenMeteo(p.text));
    jobs.push(fromPhoton(p.text, p.cc));
  }

  const settled = await Promise.allSettled(jobs);
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (!all.length) {
    if (settled.every((s) => s.status === "rejected")) throw new Error("network");
    return [];
  }

  const seen = new Map();
  for (const r of all) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    if (p.cc && r.cc && r.cc !== p.cc) continue;
    const key = `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
    const prev = seen.get(key);
    if (!prev) seen.set(key, r);
    else
      seen.set(key, {
        ...prev,
        postcode: prev.postcode || r.postcode,
        admin: prev.admin || r.admin,
        country: prev.country || r.country,
        cc: prev.cc || r.cc,
        population: Math.max(prev.population, r.population),
        exact: prev.exact || r.exact,
      });
  }

  return [...seen.values()]
    .sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || b.population - a.population)
    .slice(0, 6);
}

/** Browser geolocation -> a named place, so the header isn't just numbers. */
async function locateMe() {
  const pos = await new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 600000 });
  });
  const { latitude: lat, longitude: lon } = pos.coords;
  let name = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  let admin = "";
  let country = "";
  let cc = "";
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    if (r.ok) {
      const j = await r.json();
      name = j.city || j.locality || j.principalSubdivision || name;
      admin = j.principalSubdivision || "";
      country = j.countryName || "";
      cc = (j.countryCode || "").toLowerCase();
    }
  } catch (_) {}
  return { lat, lon, name, admin, country, cc };
}

/* ------------------------------------------------------------- atmosphere */

function Backdrop({ wet, isDay, storm }) {
  const drops = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        len: 18 + Math.random() * 46,
        dur: 0.55 + Math.random() * 0.9,
        delay: Math.random() * 3,
        op: 0.1 + Math.random() * 0.3,
      })),
    []
  );
  const bokeh = useMemo(
    () =>
      [
        ["#ff4b3e", 8, 74, 190], ["#ffb347", 21, 88, 130], ["#5ad1ff", 3, 62, 150],
        ["#ff7a45", 34, 92, 110], ["#ffd76e", 62, 84, 140], ["#ff3b30", 79, 71, 170],
        ["#4fa8ff", 91, 86, 130], ["#ffe0a3", 47, 95, 120], ["#7be0c0", 68, 66, 110],
        ["#ff9ec7", 14, 55, 120],
      ].map(([c, x, y, s], i) => ({ c, x, y, s, i })),
    []
  );

  const sky = isDay
    ? storm
      ? "linear-gradient(180deg,#2b3a4a 0%,#3d5164 45%,#55697d 100%)"
      : wet
      ? "linear-gradient(180deg,#243a52 0%,#3a5c7d 48%,#5b7f9e 100%)"
      : "linear-gradient(180deg,#1b4a8f 0%,#2f7fc4 50%,#68b3e0 100%)"
    : "linear-gradient(180deg,#050a14 0%,#0d1a2e 45%,#16283f 100%)";

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: sky }} aria-hidden="true">
      {/* city bokeh */}
      <div className="absolute inset-0" style={{ opacity: isDay ? 0.28 : 0.85 }}>
        {bokeh.map((b) => (
          <div
            key={b.i}
            className="absolute rounded-full"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: b.s,
              height: b.s,
              background: b.c,
              filter: "blur(38px)",
              opacity: 0.55,
            }}
          />
        ))}
      </div>
      {/* vignette + glass haze */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%)",
        }}
      />
      {/* rain on glass */}
      {wet && (
        <div className="absolute inset-0 rainlayer">
          {drops.map((d) => (
            <span
              key={d.id}
              className="absolute rainstreak"
              style={{
                left: `${d.left}%`,
                top: `${d.top}%`,
                height: d.len,
                opacity: d.op,
                animationDuration: `${d.dur}s`,
                animationDelay: `${d.delay}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- cards */

const glass = {
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.16)",
  backdropFilter: "blur(28px) saturate(150%)",
  WebkitBackdropFilter: "blur(28px) saturate(150%)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.12)",
};

function Card({ title, icon: Icon, children, className = "", style }) {
  return (
    <section className={`rounded-3xl p-4 flex flex-col ${className}`} style={{ ...glass, ...style }}>
      {title && (
        <h2
          className="flex items-center gap-1.5 uppercase mb-3"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)", fontWeight: 600 }}
        >
          {Icon && <Icon size={13} strokeWidth={2.2} />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** Continuous scale with a marker — used by AQI, UV, precipitation likelihood */
function Scale({ stops, pos, ticks }) {
  return (
    <div>
      <div className="relative" style={{ height: 6 }}>
        <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} />
        <div
          className="absolute rounded-full"
          style={{
            left: `${clamp(pos, 0, 100)}%`,
            top: -3,
            width: 12,
            height: 12,
            marginLeft: -6,
            background: "#fff",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.28)",
          }}
        />
      </div>
      {ticks && (
        <div
          className="flex justify-between mt-1.5"
          style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }}
        >
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- app */

export default function WeatherDashboard() {
  const [data, setData] = useState(fallbackData);
  const [status, setStatus] = useState("demo"); // demo | loading | live | error
  const [message, setMessage] = useState("");
  const [unit, setUnit] = useState("F");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const T = (f) => Math.round(unit === "F" ? f : f2c(f));

  async function pick(place) {
    setOpen(false);
    setQuery("");
    setResults([]);
    setStatus("loading");
    try {
      const d = await loadWeather(place.lat, place.lon, place);
      setData(d);
      setStatus("live");
      setMessage("");
    } catch (e) {
      setStatus("error");
      setMessage("Couldn't reach the forecast service. Showing the sample forecast.");
      setData(fallbackData());
    }
  }

  async function runSearch(text) {
    const q = (text ?? query).trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    try {
      const r = await searchPlaces(q);
      setResults(r);
      setOpen(true);
      setMessage(r.length ? "" : `Nothing matched "${q}". Try adding a country — "10115 Germany".`);
    } catch {
      setResults([]);
      setMessage("Place search is unreachable from here. Coordinates like 35.68, 139.69 still work.");
    } finally {
      setSearching(false);
    }
  }

  // type-ahead: resolve as you type, but don't hammer the geocoders
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(t);
  }, [query]);

  async function useMyLocation() {
    setStatus("loading");
    setMessage("");
    try {
      const place = await locateMe();
      await pick(place);
    } catch (err) {
      setStatus(data.demo ? "demo" : "live");
      setMessage(
        err && err.code === 1
          ? "Location access was denied. Search for a city or postal code instead."
          : "Couldn't get your location. Search for a city or postal code instead."
      );
    }
  }

  // try the user's location once on load, then fall back silently
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        const d = await loadWeather(37.4419, -122.143, {
          name: "Palo Alto",
          admin: "California",
          country: "United States",
        });
        if (!cancelled) {
          setData(d);
          setStatus("live");
        }
      } catch {
        if (!cancelled) {
          setStatus("demo");
          setMessage("Live data is unavailable here — showing a sample forecast.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const { current, hourly, daily, place, aqi } = data;
  const cond = decodeWMO(current.code, current.isDay);
  const today = daily[0];

  const weekMin = Math.min(...daily.map((d) => d.low));
  const weekMax = Math.max(...daily.map((d) => d.high));
  const span = Math.max(1, weekMax - weekMin);

  const popNext = Math.max(...hourly.slice(0, 24).map((h) => h.pop || 0));
  const ens =
    data.ensemble ||
    { ...ensembleStats(synthMembers(hourly.map((h) => h.pop || 0))), source: "modeled spread", live: false };
  const band = aqi != null ? aqiBand(aqi) : null;
  const uv = today?.uv ?? 0;

  const sunPct = (() => {
    if (!today?.sunrise || !today?.sunset) return 0.5;
    const n = Date.now();
    return clamp((n - today.sunrise.getTime()) / (today.sunset.getTime() - today.sunrise.getTime()), 0, 1);
  })();

  const summary = (() => {
    const wetHours = hourly.slice(0, 12).filter((h) => decodeWMO(h.code).wet).length;
    if (wetHours >= 8) return `${cond.label} on and off through the evening.`;
    if (wetHours > 0)
      return `${cond.label} for the next few hours, then clearing. Mostly dry the rest of the week.`;
    return `${cond.label} conditions holding through the evening.`;
  })();

  return (
    <div
      className="relative w-full min-h-screen text-white"
      style={{ fontFamily: FONT, WebkitFontSmoothing: "antialiased" }}
    >
      <style>{`
        .rainstreak{width:1.5px;border-radius:9999px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.9));animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite}
        @keyframes fall{0%{transform:translate3d(0,-18vh,0)}100%{transform:translate3d(-6vh,112vh,0)}}
        .hscroll::-webkit-scrollbar{height:0}
        .hscroll{scrollbar-width:none}
        .fadein{animation:fadein .5s ease both}
        @keyframes fadein{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        input::placeholder{color:rgba(255,255,255,.5)}
        :focus-visible{outline:2px solid rgba(255,255,255,.85);outline-offset:2px;border-radius:12px}
        @media (prefers-reduced-motion: reduce){
          .rainlayer{display:none}
          .fadein{animation:none}
        }
      `}</style>

      <Backdrop wet={cond.wet} isDay={current.isDay} storm={cond.storm} />

      <div className="relative mx-auto px-4 py-6 sm:px-6 sm:py-8" style={{ maxWidth: 1180 }}>
        {/* ------------------------------------------------------ toolbar */}
        <div className="flex items-center gap-2 mb-6">
          <div ref={boxRef} className="relative flex-1" style={{ maxWidth: 420 }}>
            <div
              className="flex items-center gap-2 rounded-full px-3.5 py-2"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
            >
              <Search size={15} style={{ color: "rgba(255,255,255,0.6)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results.length) pick(results[0]);
                  if (e.key === "Escape") setOpen(false);
                }}
                onFocus={() => results.length && setOpen(true)}
                placeholder="City, postal code, or country"
                aria-label="Search for a city, postal code, or country"
                className="flex-1 bg-transparent text-sm"
                style={{ outline: "none", color: "#fff" }}
              />
              {query && (
                <button onClick={() => { setQuery(""); setResults([]); setOpen(false); }} aria-label="Clear search">
                  <X size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
                </button>
              )}
              {searching && <Loader2 size={14} className="animate-spin" />}
            </div>

            {open && results.length > 0 && (
              <ul
                className="absolute left-0 right-0 mt-2 rounded-2xl overflow-hidden z-20"
                style={{ ...glass, padding: 6 }}
              >
                {results.map((r, i) => (
                  <li key={i}>
                    <button
                      onClick={() => pick(r)}
                      className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5"
                      style={{ color: "#fff" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ fontSize: 15, width: 20, flexShrink: 0 }}>
                        {flag(r.cc) || <MapPin size={13} style={{ color: "rgba(255,255,255,0.55)" }} />}
                      </span>
                      <span className="flex-1" style={{ minWidth: 0 }}>
                        <span className="block truncate" style={{ fontSize: 13.5 }}>
                          {r.name}
                        </span>
                        <span className="block truncate" style={{ color: "rgba(255,255,255,0.5)", fontSize: 11.5 }}>
                          {[r.admin, r.country].filter(Boolean).join(", ") || "—"}
                        </span>
                      </span>
                      {r.postcode && (
                        <span
                          className="rounded-md px-1.5 py-0.5"
                          style={{
                            fontSize: 10.5,
                            color: "rgba(255,255,255,0.75)",
                            background: "rgba(255,255,255,0.14)",
                            flexShrink: 0,
                          }}
                        >
                          {r.postcode}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={useMyLocation}
            className="rounded-full p-2.5"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
            aria-label="Use my location"
            title="Use my location"
          >
            <MapPin size={15} />
          </button>
          <button
            onClick={() => setUnit(unit === "F" ? "C" : "F")}
            className="rounded-full px-3.5 py-2 text-sm"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
            aria-label={`Switch to ${unit === "F" ? "Celsius" : "Fahrenheit"}`}
          >
            °{unit}
          </button>
          <button
            onClick={() => pick({ ...place, lat: place.lat ?? 37.4419, lon: place.lon ?? -122.143 })}
            className="rounded-full p-2.5"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
            aria-label="Refresh forecast"
          >
            <RefreshCw size={15} className={status === "loading" ? "animate-spin" : ""} />
          </button>
        </div>

        {message && (
          <p className="mb-4 text-xs" style={{ color: "rgba(255,255,255,0.62)" }}>
            {message}
          </p>
        )}

        {/* --------------------------------------------------------- hero */}
        <header className="fadein mb-5 sm:mb-7">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em" }}>{place.name}</h1>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
              {[place.admin, place.country].filter(Boolean).join(", ")}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <div
              style={{
                fontSize: "clamp(76px, 15vw, 132px)",
                fontWeight: 200,
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
                marginTop: 2,
              }}
            >
              {T(current.temp)}°
            </div>
            <cond.Icon size={44} strokeWidth={1.4} style={{ marginTop: 16, opacity: 0.9 }} />
          </div>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.78)", marginTop: 6 }}>
            Feels Like: {T(current.feels)}° · H:{T(today.high)}° L:{T(today.low)}°
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.66)", maxWidth: 340, marginTop: 4, lineHeight: 1.35 }}>
            {summary}
          </p>
        </header>

        {/* ------------------------------------------------------- hourly */}
        <Card className="mb-4 fadein">
          <div className="hscroll overflow-x-auto -mx-1 px-1">
            <div className="flex" style={{ minWidth: 700 }}>
              {hourly.slice(0, 24).map((h, i) => {
                const c = decodeWMO(h.code, h.isDay);
                return (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1" style={{ minWidth: 46 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.66)", fontWeight: 600 }}>
                      {i === 0 ? "Now" : fmtHour(h.time)}
                    </span>
                    <c.Icon size={19} strokeWidth={1.7} style={{ opacity: 0.92 }} />
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{T(h.temp)}°</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* ---------------------------------------------------- main grid */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {/* 10-day */}
          <Card title="10-Day Forecast" icon={undefined} className="fadein" style={{ gridColumn: "span 1" }}>
            <ul>
              {daily.map((d, i) => {
                const c = decodeWMO(d.code, true);
                const left = ((d.low - weekMin) / span) * 100;
                const width = Math.max(4, ((d.high - d.low) / span) * 100);
                const nowPos =
                  i === 0 ? ((clamp(current.temp, d.low, d.high) - d.low) / Math.max(1, d.high - d.low)) * 100 : null;
                return (
                  <li
                    key={i}
                    className="flex items-center gap-3 py-2"
                    style={{ borderTop: i ? "1px solid rgba(255,255,255,0.10)" : "none" }}
                  >
                    <span style={{ width: 46, fontSize: 14, fontWeight: 500 }}>
                      {i === 0 ? "Today" : DAYS[d.date.getDay()]}
                    </span>
                    <c.Icon size={17} strokeWidth={1.7} style={{ opacity: 0.9, flexShrink: 0 }} />
                    <span
                      style={{ width: 30, textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.55)" }}
                    >
                      {T(d.low)}°
                    </span>
                    <div className="flex-1 relative" style={{ height: 4 }}>
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{ background: "rgba(255,255,255,0.16)" }}
                      />
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          top: 0,
                          height: 4,
                          background: `linear-gradient(90deg, ${tempColor(d.low)}, ${tempColor(d.high)})`,
                        }}
                      />
                      {nowPos != null && (
                        <div
                          className="absolute rounded-full"
                          style={{
                            left: `calc(${left}% + ${width}% * ${nowPos / 100})`,
                            top: -2,
                            width: 8,
                            height: 8,
                            marginLeft: -4,
                            background: "#fff",
                            boxShadow: "0 0 0 1.5px rgba(0,0,0,0.35)",
                          }}
                        />
                      )}
                    </div>
                    <span style={{ width: 30, textAlign: "right", fontSize: 14, fontWeight: 500 }}>{T(d.high)}°</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* right column */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {/* Air quality */}
            <Card title="Air Quality" icon={Wind} className="fadein">
              {aqi == null ? (
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                  No air quality reading for this location.
                </p>
              ) : (
                <>
                  <div style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{Math.round(aqi)}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{band[1]}</div>
                  <Scale
                    stops="#3fd67c 0%, #f7d94c 25%, #f79a3e 45%, #ee5b5b 65%, #a25ddc 85%, #8b3a4d 100%"
                    pos={(clamp(aqi, 0, 300) / 300) * 100}
                    ticks={["GOOD", "MOD", "UNHEALTHY", "HAZARD"]}
                  />
                  <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 12, lineHeight: 1.35 }}>
                    {aqi <= 50
                      ? cond.wet
                        ? "Air quality is good. Rain is helping keep particle levels low."
                        : "Air quality is good across the area."
                      : aqi <= 100
                      ? "Acceptable for most people. Sensitive groups may notice symptoms."
                      : "Limit prolonged time outdoors if you're sensitive to pollution."}
                  </p>
                </>
              )}
            </Card>

            {/* Precipitation — ensemble */}
            <Card title="Precipitation" icon={Droplets} className="fadein">
              <div className="flex items-baseline gap-1.5">
                <span style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{Math.round(ens.pop24)}%</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>chance</span>
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.62)", marginBottom: 12 }}>
                in the next 24 hours · {ens.n} {ens.live ? "members" : "modeled members"}
              </div>
              <Scale
                stops="#4a6a86 0%, #3f9ae0 50%, #7ce0ff 100%"
                pos={ens.pop24}
                ticks={["NONE", "LIKELY", "CERTAIN"]}
              />

              {/* fan chart: p10–p90 band with the median through it */}
              <svg viewBox="0 0 240 58" className="w-full mt-3" style={{ display: "block" }}>
                <line x1="0" y1="52" x2="240" y2="52" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                {(() => {
                  const P = ens.perHour;
                  if (P.length < 2) return null;
                  const X = (i) => (i / (P.length - 1)) * 240;
                  const Y = (v) => 52 - (v / ens.peak) * 44;
                  const band =
                    P.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.p90).toFixed(1)}`).join(" ") +
                    " " +
                    P.slice()
                      .reverse()
                      .map((p, i) => `L${X(P.length - 1 - i).toFixed(1)},${Y(p.p10).toFixed(1)}`)
                      .join(" ") +
                    " Z";
                  const med = P.map((p, i) => `${X(i).toFixed(1)},${Y(p.p50).toFixed(1)}`).join(" ");
                  return (
                    <>
                      <path d={band} fill="rgba(124,224,255,0.26)" />
                      <polyline points={med} fill="none" stroke="#7ce0ff" strokeWidth="1.8" strokeLinejoin="round" />
                    </>
                  );
                })()}
              </svg>
              <div
                className="flex justify-between"
                style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }}
              >
                <span>NOW</span>
                <span>+12H</span>
                <span>+24H</span>
              </div>

              {/* 24-hour accumulation quantiles */}
              <div
                className="flex gap-2 mt-3 pt-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}
              >
                {[
                  ["P10", ens.t10, "rgba(255,255,255,0.55)"],
                  ["P50", ens.t50, "#7ce0ff"],
                  ["P90", ens.t90, "rgba(255,255,255,0.85)"],
                ].map(([k, v, c]) => (
                  <div key={k} className="flex-1">
                    <div style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }}>{k}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: c }}>{v.toFixed(2)}″</div>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 10, lineHeight: 1.35 }}>
                {ens.t90 < 0.01
                  ? "Every member stays dry through tomorrow."
                  : ens.t10 >= 0.01
                  ? `All members are wet — totals land between ${ens.t10.toFixed(2)}″ and ${ens.t90.toFixed(2)}″.`
                  : `Half the members stay under ${ens.t50.toFixed(2)}″; the wettest tenth reach ${ens.t90.toFixed(
                      2
                    )}″. Heaviest around ${fmtHour(hourly[Math.min(ens.wettest, hourly.length - 1)].time)}.`}
              </p>
            </Card>

            {/* UV */}
            <Card title="UV Index" icon={Sun} className="fadein">
              <div style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{Math.round(uv)}</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{uvLabel(uv)}</div>
              <Scale
                stops="#3fd67c 0%, #f7d94c 30%, #f79a3e 55%, #ee5b5b 78%, #a25ddc 100%"
                pos={(clamp(uv, 0, 12) / 12) * 100}
                ticks={["LOW", "MOD", "HIGH", "EXT"]}
              />
              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 12, lineHeight: 1.35 }}>
                {uv <= 2
                  ? "Low exposure today — no protection needed."
                  : uv <= 5
                  ? "Cloud cover keeps UV exposure minimal — sunscreen still optional."
                  : "Use sunscreen and seek shade around midday."}
              </p>
            </Card>

            {/* Sunset */}
            <Card title="Sunset" icon={Sunrise} className="fadein">
              <div style={{ fontSize: 26, fontWeight: 400, lineHeight: 1.1 }}>
                {today.sunset ? fmtClock(today.sunset) : "—"}
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.62)" }}>Tonight</div>
              <svg viewBox="0 0 200 78" className="w-full mt-2" style={{ overflow: "visible" }}>
                <line x1="0" y1="58" x2="200" y2="58" stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
                <path
                  d="M6 58 Q100 -12 194 58"
                  fill="none"
                  stroke="rgba(255,255,255,0.32)"
                  strokeWidth="1.5"
                  strokeDasharray="3 4"
                />
                {(() => {
                  const t = sunPct;
                  const x = 6 + (194 - 6) * t;
                  const y = 58 + (-12 - 58) * 2 * t * (1 - t) - 0; // quadratic bezier y
                  const by = (1 - t) * (1 - t) * 58 + 2 * (1 - t) * t * -12 + t * t * 58;
                  return (
                    <>
                      <circle cx={x} cy={by} r="5.5" fill="#ffd76e" />
                      <circle cx={x} cy={by} r="11" fill="#ffd76e" opacity="0.22" />
                    </>
                  );
                })()}
              </svg>
              <div
                className="flex justify-between"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}
              >
                <span>Sunrise {today.sunrise ? fmtClock(today.sunrise) : "—"}</span>
                <span>Sunset {today.sunset ? fmtClock(today.sunset) : "—"}</span>
              </div>
            </Card>
          </div>
        </div>

        {/* ------------------------------------------------------ details */}
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {[
            [Droplets, "Humidity", `${current.humidity}%`],
            [Wind, "Wind", `${current.wind} mph`],
            [Eye, "Visibility", `${current.visibility.toFixed(1)} mi`],
            [Gauge, "Pressure", `${current.pressure.toFixed(2)} inHg`],
          ].map(([Icon, label, value], i) => (
            <Card key={i} title={label} icon={Icon} className="fadein">
              <div style={{ fontSize: 24, fontWeight: 300 }}>{value}</div>
            </Card>
          ))}
        </div>

        <footer
          className="mt-6 flex items-center justify-between"
          style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}
        >
          <span>
            {status === "live" ? "Live data from Open-Meteo" : "Sample forecast"} · {ens.source} ({ens.n}) · Updated{" "}
            {fmtClock(new Date())}
          </span>
          <span>{unit === "F" ? "Fahrenheit" : "Celsius"}</span>
        </footer>
      </div>
    </div>
  );
}
