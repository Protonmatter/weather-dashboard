export type RadarProviderId = "noaa-mrms" | "rainviewer";

export interface RadarFrame {
  id: string;
  validAt: Date;
  path?: string;
}

export interface RadarAttribution {
  label: string;
  url: string;
}

export interface RadarSource {
  provider: RadarProviderId;
  frames: RadarFrame[];
  coverage: "available" | "unavailable";
  attribution: RadarAttribution;
  imageHost?: string;
  fetchedAt: number;
}

export interface RadarTile {
  z: number;
  x: number;
  y: number;
}
