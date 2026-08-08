const DEFAULT_WEATHER_BASE = "https://api.open-meteo.com";
const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_ATTRIBUTION = "© OpenStreetMap contributors";
const DEFAULT_ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright";

const secureUrl = (raw: string, label: string): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(`${label} must use HTTPS`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, a query, or a fragment`);
  }
  return url;
};

export function normalizeBaseUrl(raw?: string): string {
  const value = raw?.trim() || DEFAULT_WEATHER_BASE;
  const url = secureUrl(value, "map forecast base URL");
  return url.toString().replace(/\/$/, "");
}

export interface TileProviderConfig {
  template: string;
  attribution: string;
  attributionUrl: string;
}

export function tileProviderConfig(env: ImportMetaEnv = import.meta.env): TileProviderConfig {
  const template = env.VITE_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
  secureUrl(
    template.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0"),
    "map tile URL"
  );
  for (const token of ["{z}", "{x}", "{y}"]) {
    if (!template.includes(token)) throw new Error(`map tile URL must contain ${token}`);
  }
  const attributionUrl = secureUrl(
    env.VITE_MAP_TILE_ATTRIBUTION_URL?.trim() || DEFAULT_ATTRIBUTION_URL,
    "map attribution URL"
  ).toString();
  return {
    template,
    attribution: env.VITE_MAP_TILE_ATTRIBUTION?.trim() || DEFAULT_ATTRIBUTION,
    attributionUrl,
  };
}

export function weatherBaseUrls(env: ImportMetaEnv = import.meta.env): string[] {
  const configured = env.VITE_MAP_FORECAST_BASE_URL?.trim();
  const urls = configured
    ? [normalizeBaseUrl(configured), DEFAULT_WEATHER_BASE]
    : [DEFAULT_WEATHER_BASE];
  return [...new Set(urls)];
}
