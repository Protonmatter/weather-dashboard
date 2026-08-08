import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const glass: CSSProperties = {
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.16)",
  backdropFilter: "blur(28px) saturate(150%)",
  WebkitBackdropFilter: "blur(28px) saturate(150%)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.12)",
};

interface CardProps {
  title?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
}

export function Card({ title, icon: Icon, children, className = "", style, "data-testid": testId }: CardProps) {
  return (
    <section className={`rounded-3xl p-4 flex flex-col ${className}`} style={{ ...glass, ...style }} data-testid={testId}>
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

interface ScaleProps {
  stops: string;
  /** Marker position, 0-100. */
  pos: number;
  ticks?: readonly string[];
  label?: string;
}

/** Continuous gradient scale with a marker. Shared by AQI, UV and precipitation. */
export function Scale({ stops, pos, ticks, label }: ScaleProps) {
  const clamped = Math.min(100, Math.max(0, pos));
  return (
    <div>
      <div
        className="relative"
        style={{ height: 6 }}
        role="meter"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} />
        <div
          className="absolute rounded-full"
          style={{
            left: `${clamped}%`,
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
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
