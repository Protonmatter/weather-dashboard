export const GLASS_LEVELS = ["control", "panel", "hero", "overlay", "map"] as const;
export type GlassLevel = (typeof GLASS_LEVELS)[number];

export interface GlassClassOptions {
  interactive?: boolean;
  selected?: boolean;
  className?: string;
}

export function glassClass(
  level: GlassLevel,
  {
    interactive = false,
    selected = false,
    className = "",
  }: GlassClassOptions = {}
): string {
  return [
    "glass-surface",
    `glass-surface--${level}`,
    interactive ? "glass-surface--interactive" : "",
    selected ? "is-selected" : "",
    className,
  ].filter(Boolean).join(" ");
}
