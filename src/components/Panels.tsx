import { useEffect, useState } from "react";
import { Sun, Sunrise, Wind } from "lucide-react";
import { Card, Scale } from "./Card";
import { decodeWMO } from "../lib/wmo";
import { aqiBand, uvLabel, fmtHour, fmtClock, tempColor } from "../lib/units";
import { formatLocalWeekday, localDateKey } from "../lib/time";
import type { CurrentConditions, DayPoint, HourPoint, TempQuantiles } from "../lib/types";

type Convert = (f: number) => number;

/** Strip a button of its chrome so it can wrap arbitrary card content (RFC 0003 §2.1). */
const bareButton = {
  background: "transparent",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "inherit",
  cursor: "pointer",
} as const;

/**
 * Temperature uncertainty ribbon: the ensemble's 10th–90th percentile band with the
 * median traced through it, drawn beneath the hourly strip and column-aligned to it.
 * Only rendered for a live ensemble — a synthetic spread is never shown as real.
 */
function TemperatureBand({
  spread,
  T,
  active,
}: {
  spread: readonly TempQuantiles[];
  T: Convert;
  active?: number | null;
}) {
  const pts = spread.slice(0, 24);
  const n = pts.length;
  if (n < 2) return null;

  const H = 40;
  const lo = Math.min(...pts.map((p) => p.p10));
  const hi = Math.max(...pts.map((p) => p.p90));
  const span = Math.max(1, hi - lo);
  const X = (i: number): number => i + 0.5;
  const Y = (v: number): number => H - 3 - ((v - lo) / span) * (H - 6);

  const top = pts.map((p, i) => `${X(i)},${Y(p.p90)}`);
  const bottom = pts.map((p, i) => `${X(i)},${Y(p.p10)}`).reverse();
  const area = `M${top.join(" L")} L${bottom.join(" L")} Z`;
  const median = pts.map((p, i) => `${X(i)},${Y(p.p50)}`).join(" ");

  // Widest hour, for an honest one-line summary of how much the models disagree.
  let wi = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i]!.p90 - pts[i]!.p10 > pts[wi]!.p90 - pts[wi]!.p10) wi = i;
  }
  const widest = Math.round(T(pts[wi]!.p90) - T(pts[wi]!.p10));

  const mark = active != null && active < n ? pts[active] : null;

  return (
    <div style={{ minWidth: 700 }}>
      <svg
        viewBox={`0 0 ${n} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: 40, display: "block" }}
        role="img"
        aria-label={`Ensemble temperature range, up to ${widest} degrees between members at the widest hour`}
      >
        <path d={area} fill="rgba(124,224,255,0.16)" />
        <polyline
          points={median}
          fill="none"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {mark && active != null && (
          <g aria-hidden="true">
            <line
              x1={X(active)} y1={Y(mark.p90)} x2={X(active)} y2={Y(mark.p10)}
              stroke="#7ce0ff" strokeWidth={1.2} vectorEffect="non-scaling-stroke"
            />
            <circle cx={X(active)} cy={Y(mark.p50)} r={2.4} fill="#7ce0ff"
              vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.35 }}>
        Shaded band spans the ensemble's 10th–90th percentile; the line is the median.
        Models disagree by up to {widest}° at the widest hour.
      </p>
    </div>
  );
}

export function HourlyStrip({
  hourly,
  T,
  spread,
  timezone,
}: {
  hourly: readonly HourPoint[];
  T: Convert;
  spread?: readonly TempQuantiles[];
  timezone: string;
}) {
  const hours = hourly.slice(0, 24);

  // Preview follows hover/focus; a pin survives pointer leave (RFC 0003 §2.3).
  const [preview, setPreview] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const shown = pinned ?? preview;

  // An hour index is meaningless across locations.
  useEffect(() => {
    setPreview(null);
    setPinned(null);
  }, [hourly]);

  const h = shown != null ? hours[shown] : undefined;
  const q = shown != null ? spread?.[shown] : undefined;

  return (
    <Card className="mb-4 fadein">
      <div className="hscroll overflow-x-auto -mx-1 px-1">
        <div style={{ minWidth: 700 }}>
          <ul className="flex">
            {hours.map((hp, i) => {
              const c = decodeWMO(hp.code, hp.isDay);
              return (
                <li key={hp.time.toISOString()} className="flex-1" style={{ minWidth: 46 }}>
                  <button
                    type="button"
                    className="flex flex-col items-center gap-2 w-full py-1"
                    style={{
                      ...bareButton,
                      borderRadius: 10,
                      background: shown === i ? "rgba(255,255,255,0.09)" : "transparent",
                    }}
                    aria-pressed={pinned === i}
                    aria-label={`Inspect ${i === 0 ? "now" : fmtHour(hp.time, timezone)}`}
                    onPointerEnter={() => setPreview(i)}
                    onPointerLeave={() => setPreview(null)}
                    onFocus={() => setPreview(i)}
                    onClick={() => setPinned(pinned === i ? null : i)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setPinned(null);
                    }}
                  >
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.66)", fontWeight: 600 }}>
                      {i === 0 ? "Now" : fmtHour(hp.time, timezone)}
                    </span>
                    <c.Icon size={19} strokeWidth={1.7} />
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{T(hp.temp)}°</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {spread && spread.length > 1 && <TemperatureBand spread={spread} T={T} active={shown} />}
        </div>
      </div>
      <div aria-live="polite" style={{ minHeight: 32, marginTop: 6 }}>
        {h ? (
          <p style={{ fontSize: 12, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 600 }}>
              {shown === 0 ? "Now" : fmtHour(h.time, timezone)}
            </span>
            <span style={{ color: "rgba(255,255,255,0.66)" }}>
              {" "}· {decodeWMO(h.code, h.isDay).label} · {T(h.temp)}° · {Math.round(h.pop)}% precip
            </span>
            {q && (
              <span style={{ display: "block", color: "#7ce0ff", fontSize: 11.5 }}>
                Ensemble {T(q.p10)}–{T(q.p90)}°, median {T(q.p50)}°
              </span>
            )}
          </p>
        ) : (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            Hover, tap, or tab to an hour for its detail{spread && spread.length > 1 ? " and ensemble range" : ""}.
          </p>
        )}
      </div>
    </Card>
  );
}

const sameDay = (a: Date, b: Date, timezone: string): boolean =>
  localDateKey(a, timezone) === localDateKey(b, timezone);

export function TenDayForecast({
  daily,
  current,
  hourly,
  T,
  timezone,
}: {
  daily: readonly DayPoint[];
  current: CurrentConditions;
  hourly: readonly HourPoint[];
  T: Convert;
  timezone: string;
}) {
  const weekMin = Math.min(...daily.map((d) => d.low));
  const weekMax = Math.max(...daily.map((d) => d.high));
  const span = Math.max(1, weekMax - weekMin);

  // One day expands at a time; index resets when the place changes.
  const [expanded, setExpanded] = useState<number | null>(null);
  useEffect(() => setExpanded(null), [daily]);

  return (
    <Card title="10-Day Forecast" className="fadein">
      <ul>
        {daily.map((d, i) => {
          const c = decodeWMO(d.code, true);
          const left = ((d.low - weekMin) / span) * 100;
          const width = Math.max(4, ((d.high - d.low) / span) * 100);
          const dayRange = Math.max(1, d.high - d.low);
          const nowPos =
            i === 0 ? ((Math.min(Math.max(current.temp, d.low), d.high) - d.low) / dayRange) * 100 : null;
          const open = expanded === i;
          const dayHours = open ? hourly.filter((hp) => sameDay(hp.time, d.date, timezone)) : [];

          return (
            <li
              key={d.date.toISOString()}
              style={{ borderTop: i ? "1px solid rgba(255,255,255,0.10)" : "none" }}
            >
              <button
                type="button"
                className="flex items-center gap-3 py-2 w-full"
                style={bareButton}
                aria-expanded={open}
                aria-controls={`day-detail-${i}`}
                onClick={() => setExpanded(open ? null : i)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setExpanded(null);
                }}
              >
                <span style={{ width: 46, fontSize: 14, fontWeight: 500 }}>
                  {i === 0 ? "Today" : formatLocalWeekday(d.date, timezone)}
                </span>
                <c.Icon size={17} strokeWidth={1.7} />
                <span style={{ width: 30, textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
                  {T(d.low)}°
                </span>
                <div className="flex-1 relative" style={{ height: 4 }}>
                  <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.16)" }} />
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
                  {nowPos !== null && (
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
              </button>

              {open && (
                <div id={`day-detail-${i}`} className="pb-2">
                  {dayHours.length > 0 ? (
                    <div className="hscroll overflow-x-auto -mx-1 px-1">
                      <ul className="flex" style={{ minWidth: Math.min(700, dayHours.length * 44) }}>
                        {dayHours.map((hp) => {
                          const hc = decodeWMO(hp.code, hp.isDay);
                          return (
                            <li
                              key={hp.time.toISOString()}
                              className="flex flex-col items-center gap-1.5 flex-1"
                              style={{ minWidth: 40 }}
                            >
                              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
                                {fmtHour(hp.time, timezone)}
                              </span>
                              <hc.Icon size={15} strokeWidth={1.7} />
                              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{T(hp.temp)}°</span>
                              <span style={{ fontSize: 9.5, color: "rgba(124,224,255,0.85)" }}>
                                {hp.pop > 0 ? `${Math.round(hp.pop)}%` : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                      Hourly detail is not available this far out.
                    </p>
                  )}
                  <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                    UV {Math.round(d.uv)} ({uvLabel(d.uv)})
                    {d.sunrise && ` · Sunrise ${fmtClock(d.sunrise, timezone)}`}
                    {d.sunset && ` · Sunset ${fmtClock(d.sunset, timezone)}`}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function AirQualityCard({ aqi, wet }: { aqi: number | null; wet: boolean }) {
  if (aqi === null) {
    return (
      <Card title="Air Quality" icon={Wind} className="fadein">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          No air quality reading for this location.
        </p>
      </Card>
    );
  }

  const band = aqiBand(aqi);
  const note =
    aqi <= 50
      ? wet
        ? "Air quality is good. Rain is helping keep particle levels low."
        : "Air quality is good across the area."
      : aqi <= 100
        ? "Acceptable for most people. Sensitive groups may notice symptoms."
        : "Limit prolonged time outdoors if you're sensitive to pollution.";

  return (
    <Card title="Air Quality" icon={Wind} className="fadein">
      <div style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{Math.round(aqi)}</div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{band[1]}</div>
      <Scale
        stops="#3fd67c 0%, #f7d94c 25%, #f79a3e 45%, #ee5b5b 65%, #a25ddc 85%, #8b3a4d 100%"
        pos={(Math.min(aqi, 300) / 300) * 100}
        ticks={["GOOD", "MOD", "UNHEALTHY", "HAZARD"]}
        label={`US air quality index ${Math.round(aqi)}, ${band[1]}`}
      />
      <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 12, lineHeight: 1.35 }}>{note}</p>
    </Card>
  );
}

export function UvCard({ uv }: { uv: number }) {
  const note =
    uv <= 2
      ? "Low exposure today — no protection needed."
      : uv <= 5
        ? "Cloud cover keeps UV exposure minimal — sunscreen still optional."
        : "Use sunscreen and seek shade around midday.";

  return (
    <Card title="UV Index" icon={Sun} className="fadein">
      <div style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{Math.round(uv)}</div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{uvLabel(uv)}</div>
      <Scale
        stops="#3fd67c 0%, #f7d94c 30%, #f79a3e 55%, #ee5b5b 78%, #a25ddc 100%"
        pos={(Math.min(uv, 12) / 12) * 100}
        ticks={["LOW", "MOD", "HIGH", "EXT"]}
        label={`UV index ${Math.round(uv)}, ${uvLabel(uv)}`}
      />
      <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 12, lineHeight: 1.35 }}>{note}</p>
    </Card>
  );
}

export function SunsetCard({ day, timezone }: { day: DayPoint | undefined; timezone: string }) {
  const sunrise = day?.sunrise ?? null;
  const sunset = day?.sunset ?? null;

  const t =
    sunrise && sunset
      ? Math.min(1, Math.max(0, (Date.now() - sunrise.getTime()) / (sunset.getTime() - sunrise.getTime())))
      : 0.5;

  // Position on the quadratic bezier the dashed arc traces, not a linear approximation.
  const x = 6 + (194 - 6) * t;
  const y = (1 - t) * (1 - t) * 58 + 2 * (1 - t) * t * -12 + t * t * 58;

  return (
    <Card title="Sunset" icon={Sunrise} className="fadein">
      <div style={{ fontSize: 26, fontWeight: 400, lineHeight: 1.1 }}>{sunset ? fmtClock(sunset, timezone) : "—"}</div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.62)" }}>Tonight</div>
      <svg viewBox="0 0 200 78" className="w-full mt-2" style={{ overflow: "visible" }} aria-hidden="true">
        <line x1="0" y1="58" x2="200" y2="58" stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
        <path d="M6 58 Q100 -12 194 58" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.5" strokeDasharray="3 4" />
        <circle cx={x} cy={y} r="11" fill="#ffd76e" opacity="0.22" />
        <circle cx={x} cy={y} r="5.5" fill="#ffd76e" />
      </svg>
      <div className="flex justify-between" style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
        <span>Sunrise {sunrise ? fmtClock(sunrise, timezone) : "—"}</span>
        <span>Sunset {sunset ? fmtClock(sunset, timezone) : "—"}</span>
      </div>
    </Card>
  );
}
