import type { CSSProperties } from "react";

export type GlassSurface = "control" | "panel" | "hero" | "overlay" | "map";

const surfaces: Record<GlassSurface, CSSProperties> = {
  control: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    backdropFilter: "blur(20px) saturate(160%)",
    WebkitBackdropFilter: "blur(20px) saturate(160%)",
  },
  panel: {
    background: "rgba(12,25,42,0.46)",
    border: "1px solid rgba(255,255,255,0.16)",
    backdropFilter: "blur(32px) saturate(155%)",
    WebkitBackdropFilter: "blur(32px) saturate(155%)",
  },
  hero: {
    background: "linear-gradient(145deg, rgba(255,255,255,0.20), rgba(16,32,56,0.48))",
    border: "1px solid rgba(255,255,255,0.24)",
    backdropFilter: "blur(40px) saturate(170%)",
    WebkitBackdropFilter: "blur(40px) saturate(170%)",
  },
  overlay: {
    background: "rgba(3,10,22,0.72)",
    border: "1px solid rgba(255,255,255,0.14)",
    backdropFilter: "blur(36px) saturate(140%)",
    WebkitBackdropFilter: "blur(36px) saturate(140%)",
  },
  map: {
    background: "rgba(5,14,28,0.52)",
    border: "1px solid rgba(255,255,255,0.18)",
    backdropFilter: "blur(18px) saturate(140%)",
    WebkitBackdropFilter: "blur(18px) saturate(140%)",
  },
};

export function glassSurface(surface: GlassSurface = "panel"): CSSProperties {
  return {
    ...surfaces[surface],
    boxShadow: "0 18px 50px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.14)",
  };
}

export const glassRadius = {
  control: "rounded-full",
  panel: "rounded-3xl",
  hero: "rounded-[2rem]",
  overlay: "rounded-3xl",
  map: "rounded-3xl",
} as const;
