import { Sun, Sunrise, Wind, Droplets, Eye, Gauge } from "lucide-react";
import { Card, Scale } from "./Card";
import { decodeWMO } from "../lib/wmo";
import { aqiBand, uvLabel, fmtHour, fmtClock, tempColor, DAYS } from "../lib/units";
import type { LucideIcon } from "lucide-react";
import type { CurrentConditions, DayPoint, HourPoint } from "../lib/types";

type Convert = (f: number) => number;

export function HourlyStrip({ hourly, T }: { hourly: readonly HourPoint[]; T: Convert }) {
  return (
    <Card className="mb-4 fadein">
      <div className="hscroll overflow-x-auto -mx-1 px-1">
        <ul className="flex" style={{ minWidth: 700 }}>
          {hourly.slice(0, 24).map((h, i) => {
            const c = decodeWMO(h.code, h.isDay);
            return (
              <li key={h.time.toISOString()} className="flex flex-col items-center gap-2 flex-1" style={{ minWidth: 46 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.66)", fontWeight: 600 }}>
                  {i === 0 ? "Now" : fmtHour(h.time)}
                </span>
                <c.Icon size={19} strokeWidth={1.7} />
                <span style={{ fontSize: 15, fontWeight: 500 }}>{T(h.temp)}°</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

export function TenDayForecast({
  daily,
  current,
  T,
}: {
  daily: readonly DayPoint[];
  current: CurrentConditions;
  T: Convert;
}) {
  const weekMin = Math.min(...daily.map((d) => d.low));
  const weekMax = Math.max(...daily.map((d) => d.high));
  const span = Math.max(1, weekMax - weekMin);

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

          return (
            <li
              key={d.date.toISOString()}
              className="flex items-center gap-3 py-2"
              style={{ borderTop: i ? "1px solid rgba(255,255,255,0.10)" : "none" }}
            >
              <span style={{ width: 46, fontSize: 14, fontWeight: 500 }}>
                {i === 0 ? "Today" : DAYS[d.date.getDay()]}
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

export function SunsetCard({ day }: { day: DayPoint | undefined }) {
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
      <div style={{ fontSize: 26, fontWeight: 400, lineHeight: 1.1 }}>{sunset ? fmtClock(sunset) : "—"}</div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.62)" }}>Tonight</div>
      <svg viewBox="0 0 200 78" className="w-full mt-2" style={{ overflow: "visible" }} aria-hidden="true">
        <line x1="0" y1="58" x2="200" y2="58" stroke="rgba(255,255,255,0.24)" strokeWidth="1" />
        <path d="M6 58 Q100 -12 194 58" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.5" strokeDasharray="3 4" />
        <circle cx={x} cy={y} r="11" fill="#ffd76e" opacity="0.22" />
        <circle cx={x} cy={y} r="5.5" fill="#ffd76e" />
      </svg>
      <div className="flex justify-between" style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
        <span>Sunrise {sunrise ? fmtClock(sunrise) : "—"}</span>
        <span>Sunset {sunset ? fmtClock(sunset) : "—"}</span>
      </div>
    </Card>
  );
}

export function DetailsGrid({ current }: { current: CurrentConditions }) {
  const items: ReadonlyArray<readonly [LucideIcon, string, string]> = [
    [Droplets, "Humidity", `${current.humidity}%`],
    [Wind, "Wind", `${current.wind} mph`],
    [Eye, "Visibility", `${current.visibility.toFixed(1)} mi`],
    [Gauge, "Pressure", `${current.pressure.toFixed(2)} inHg`],
  ];
  return (
    <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
      {items.map(([Icon, label, value]) => (
        <Card key={label} title={label} icon={Icon} className="fadein">
          <div style={{ fontSize: 24, fontWeight: 300 }}>{value}</div>
        </Card>
      ))}
    </div>
  );
}
