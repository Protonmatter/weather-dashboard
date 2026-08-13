import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type CardElement = "section" | "article" | "header" | "div";
type CardLevel = "panel" | "hero" | "overlay" | "map";
type CardPadding = "compact" | "default" | "none";

const paddingClass: Record<CardPadding, string> = {
  compact: "p-3",
  default: "p-4",
  none: "p-0",
};

interface CardProps {
  as?: CardElement;
  level?: CardLevel;
  padding?: CardPadding;
  title?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
}

export function Card({
  as = "section",
  level = "panel",
  padding = "default",
  title,
  icon: Icon,
  children,
  className = "",
  style,
  "data-testid": testId,
}: CardProps) {
  const Element = as;
  return (
    <Element
      className={`glass-surface glass-surface--${level} flex flex-col ${paddingClass[padding]} ${className}`}
      style={style}
      data-testid={testId}
      data-glass-level={level}
    >
      {title && (
        <h2
          className="mb-3 flex items-center gap-1.5 uppercase"
          style={{ fontSize: 11, letterSpacing: "0.08em", color: "rgba(255,255,255,0.62)", fontWeight: 600 }}
        >
          {Icon && <Icon size={13} strokeWidth={2.2} />}
          {title}
        </h2>
      )}
      {children}
    </Element>
  );
}

interface ScaleProps {
  stops: string;
  pos: number;
  ticks?: readonly string[];
  label?: string;
}

export function Scale({ stops, pos, ticks, label }: ScaleProps) {
  const clamped = Math.min(100, Math.max(0, pos));
  return (
    <div>
      <div className="relative" style={{ height: 6 }} role="meter" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} />
        <div className="absolute rounded-full" style={{ left: `${clamped}%`, top: -3, width: 12, height: 12, marginLeft: -6, background: "#fff", boxShadow: "0 0 0 2px rgba(0,0,0,0.28)" }} />
      </div>
      {ticks && (
        <div className="mt-1.5 flex justify-between" style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }} aria-hidden="true">
          {ticks.map((tick) => <span key={tick}>{tick}</span>)}
        </div>
      )}
    </div>
  );
}
