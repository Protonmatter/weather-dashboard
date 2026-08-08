import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, tileProviderConfig, weatherBaseUrls } from "../config";

describe("map build-time configuration", () => {
  it("defaults to direct Open-Meteo and de-duplicates an identical configured origin", () => {
    expect(weatherBaseUrls({} as ImportMetaEnv)).toEqual(["https://api.open-meteo.com"]);
    expect(weatherBaseUrls({ VITE_MAP_FORECAST_BASE_URL: "https://api.open-meteo.com/" } as ImportMetaEnv))
      .toEqual(["https://api.open-meteo.com"]);
  });

  it("rejects insecure, credential-bearing, and query-bearing provider URLs", () => {
    expect(() => normalizeBaseUrl("http://example.com")).toThrow(/HTTPS/);
    expect(() => normalizeBaseUrl("https://user:secret@example.com")).toThrow(/credentials/);
    expect(() => normalizeBaseUrl("https://example.com?key=secret")).toThrow(/query/);
  });

  it("allows HTTP only for local development", () => {
    expect(normalizeBaseUrl("http://localhost:8787/")).toBe("http://localhost:8787");
  });

  it("requires a complete tile template and returns attribution as plain text", () => {
    expect(() => tileProviderConfig({ VITE_MAP_TILE_URL: "https://tiles.example.com/{z}/{x}.png" } as ImportMetaEnv))
      .toThrow(/\{y\}/);
    const config = tileProviderConfig({
      VITE_MAP_TILE_URL: "https://tiles.example.com/{z}/{x}/{y}.png",
      VITE_MAP_TILE_ATTRIBUTION: "Example tiles",
      VITE_MAP_TILE_ATTRIBUTION_URL: "https://tiles.example.com/licence",
    } as ImportMetaEnv);
    expect(config.attribution).toBe("Example tiles");
    expect(config.attributionUrl).toBe("https://tiles.example.com/licence");
  });
});
