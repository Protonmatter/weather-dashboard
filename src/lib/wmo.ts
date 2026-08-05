import {
  Sun, Moon, Cloud, Cloudy, CloudSun, CloudMoon, CloudFog, CloudDrizzle,
  CloudRain, CloudSnow, CloudLightning,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface Condition {
  Icon: LucideIcon;
  label: string;
  wet: boolean;
  storm: boolean;
}

type Entry = readonly [LucideIcon, LucideIcon, string];

/** WMO 4677 code -> [day icon, night icon, label]. */
const TABLE: Record<number, Entry> = {
  0: [Sun, Moon, "Clear"],
  1: [Sun, Moon, "Mostly Clear"],
  2: [CloudSun, CloudMoon, "Partly Cloudy"],
  3: [Cloudy, Cloudy, "Overcast"],
  45: [CloudFog, CloudFog, "Fog"],
  48: [CloudFog, CloudFog, "Freezing Fog"],
  51: [CloudDrizzle, CloudDrizzle, "Light Drizzle"],
  53: [CloudDrizzle, CloudDrizzle, "Drizzle"],
  55: [CloudDrizzle, CloudDrizzle, "Heavy Drizzle"],
  56: [CloudDrizzle, CloudDrizzle, "Freezing Drizzle"],
  57: [CloudDrizzle, CloudDrizzle, "Freezing Drizzle"],
  61: [CloudRain, CloudRain, "Light Rain"],
  63: [CloudRain, CloudRain, "Rain"],
  65: [CloudRain, CloudRain, "Heavy Rain"],
  66: [CloudRain, CloudRain, "Freezing Rain"],
  67: [CloudRain, CloudRain, "Freezing Rain"],
  71: [CloudSnow, CloudSnow, "Light Snow"],
  73: [CloudSnow, CloudSnow, "Snow"],
  75: [CloudSnow, CloudSnow, "Heavy Snow"],
  77: [CloudSnow, CloudSnow, "Snow Grains"],
  80: [CloudRain, CloudRain, "Showers"],
  81: [CloudRain, CloudRain, "Showers"],
  82: [CloudRain, CloudRain, "Heavy Showers"],
  85: [CloudSnow, CloudSnow, "Snow Showers"],
  86: [CloudSnow, CloudSnow, "Snow Showers"],
  95: [CloudLightning, CloudLightning, "Thunderstorms"],
  96: [CloudLightning, CloudLightning, "Thunderstorms"],
  99: [CloudLightning, CloudLightning, "Thunderstorms"],
};

/** Codes 51-99 are all precipitating in WMO 4677. */
export const isWet = (code: number): boolean => code >= 51 && code <= 99;
export const isStorm = (code: number): boolean => code >= 95;

export function decodeWMO(code: number, isDay = true): Condition {
  const entry = TABLE[code];
  if (!entry) return { Icon: Cloud, label: "Cloudy", wet: isWet(code), storm: isStorm(code) };
  return {
    Icon: isDay ? entry[0] : entry[1],
    label: entry[2],
    wet: isWet(code),
    storm: isStorm(code),
  };
}
