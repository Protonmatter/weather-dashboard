import { useEffect, useRef, useState } from "react";
import { Droplets } from "lucide-react";
import { Card, Scale } from "./Card";
import { fmtHour } from "../lib/units";
import { MEASURABLE_24H } from "../lib/ensemble";
import { precipitationWindowLabel } from "../lib/presentation/precipitation";
import type { EnsembleSummary, HourPoint } from "../lib/types";

interface Props {
  ens: EnsembleSummary;
  hourly: readonly HourPoint[];
  timezone: string;
}

const W = 240;
const X = (i: number, n: number): number => (i / (n - 1)) * W;

/** p10-p90 band with the median traced through it, plus a rule at the inspected hour. */
function FanChart({ ens, active }: { ens: EnsembleSummary; active: number | null }) {
  const P = ens.perHour;
  if (P.length < 2) return null;

  const Y = (v: number): number => 52 - (v / ens.peak) * 44;

  const upper = P.map((p, i) => `${i ? "L" : "M"}${X(i, P.length).toFixed(1)},${Y(p.p90).toFixed(1)}`).join(" ");
  const lower = P.slice()
    .reverse()
    .map((p, i) => `L${X(P.length - 1 - i, P.length).toFixed(1)},${Y(p.p10).toFixed(1)}`)
    .join(" ");
  const median = P.map((p, i) => `${X(i, P.length).toFixed(1)},${Y(p.p50).toFixed(1)}`).join(" ");
  const mark = active != null ? P[active] : undefined;

  return (
    <>
      <path d={`${upper} ${lower} Z`} fill="rgba(124,224,255,0.26)" />
      <polyline points={median} fill="none" stroke="#7ce0ff" strokeWidth="1.8" strokeLinejoin="round" />
      {mark && active != null && (
        <g aria-hidden="true">
          <line
            x1={X(active, P.length)} y1={6} x2={X(active, P.length)} y2={52}
            stroke="rgba(255,255,255,0.55)" strokeWidth="1"
          />
          <circle cx={X(active, P.length)} cy={Y(mark.p50)} r="2.6" fill="#fff" />
        </g>
      )}
    </>
  );
}

function caption(ens: EnsembleSummary, timezone: string): string {
  if (!ens.live) return "Illustrative synthetic amounts derived from precipitation probabilities; these are not calibrated rainfall or uncertainty estimates.";
  if (ens.pop24 === 0) return `Every member stays below ${MEASURABLE_24H}″ during the displayed window.`;
  if (ens.pop24 === 100)
    return `All members reach ${MEASURABLE_24H}″; the central 80% of totals spans ${ens.t10.toFixed(2)}–${ens.t90.toFixed(2)}″.`;
  const peakHour = ens.validTimes?.[ens.wettest];
  const when = peakHour ? ` Highest median amount in the hour ending ${fmtHour(peakHour, timezone)}.` : "";
  return `The central 80% of member totals spans ${ens.t10.toFixed(2)}–${ens.t90.toFixed(2)}″; the median is ${ens.t50.toFixed(2)}″.${when}`;
}

export function PrecipitationCard({ ens, timezone }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Preview follows the pointer; a pin (click/Enter) survives leaving (RFC 0003 §2.3).
  const [preview, setPreview] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const shown = pinned ?? preview;

  useEffect(() => {
    setPreview(null);
    setPinned(null);
  }, [ens]);

  const n = ens.perHour.length;
  const hourAt = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || n < 2) return null;
    const i = Math.round(((clientX - rect.left) / rect.width) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  };

  const q = shown != null ? ens.perHour[shown] : undefined;
  const hourLabel = shown != null && ens.validTimes?.[shown]
    ? fmtHour(ens.validTimes[shown]!, timezone) : "time unavailable";
  const windowLabel = precipitationWindowLabel(ens, timezone);

  const quantiles: ReadonlyArray<readonly [string, number, string]> = q
    ? [
        ["P10", q.p10, "rgba(255,255,255,0.55)"],
        ["P50", q.p50, "#7ce0ff"],
        ["P90", q.p90, "rgba(255,255,255,0.85)"],
      ]
    : [
        ["P10", ens.t10, "rgba(255,255,255,0.55)"],
        ["P50", ens.t50, "#7ce0ff"],
        ["P90", ens.t90, "rgba(255,255,255,0.85)"],
      ];

  if (!ens.n || !n) return <Card title="Precipitation" icon={Droplets}><p>Precipitation window unavailable.</p></Card>;

  return (
    <Card title="Precipitation" icon={Droplets} className="fadein">
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{Math.round(ens.pop24)}%</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>members ≥ {MEASURABLE_24H} in</span>
      </div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.62)", marginBottom: 12 }}>
        {windowLabel} · {ens.n} {ens.live ? "members" : "modeled members (illustrative)"}
      </div>

      <Scale
        stops="#4a6a86 0%, #3f9ae0 50%, #7ce0ff 100%"
        pos={ens.pop24}
        ticks={["0%", "50%", "100%"]}
        label={`Share of ${ens.live ? "ensemble" : "synthetic"} members reaching ${MEASURABLE_24H} inches during ${windowLabel}`}
      />

      {/* Keyboard handling lives on a div: WebKit will not reliably focus an <svg>. */}
      <div
        role="group"
        tabIndex={0}
        aria-label="Precipitation fan — arrow keys inspect hours, Escape clears"
        className="mt-3"
        style={{ borderRadius: 8 }}
        onKeyDown={(e) => {
          if (n < 2) return;
          const cur = shown ?? 0;
          if (e.key === "ArrowRight") {
            setPinned(Math.min(n - 1, cur + 1));
            e.preventDefault();
          } else if (e.key === "ArrowLeft") {
            setPinned(Math.max(0, cur - 1));
            e.preventDefault();
          } else if (e.key === "Home") {
            setPinned(0);
            e.preventDefault();
          } else if (e.key === "End") {
            setPinned(n - 1);
            e.preventDefault();
          } else if (e.key === "Escape") {
            setPinned(null);
            setPreview(null);
          }
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 240 58"
          className="w-full"
          style={{ display: "block", touchAction: "pan-y", cursor: "crosshair" }}
          role="img"
          aria-label={
            `${ens.live ? "Ensemble" : "Illustrative synthetic"} precipitation spread. ${windowLabel}. Median window total ${ens.t50.toFixed(2)} inches, ` +
            `10th to 90th percentile ${ens.t10.toFixed(2)} to ${ens.t90.toFixed(2)} inches.`
          }
          onPointerMove={(e) => setPreview(hourAt(e.clientX))}
          onPointerLeave={() => setPreview(null)}
          onClick={(e) => {
            const i = hourAt(e.clientX);
            setPinned(pinned != null && pinned === i ? null : i);
          }}
        >
          <line x1="0" y1="52" x2="240" y2="52" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          <FanChart ens={ens} active={shown} />
        </svg>
      </div>

      <div className="flex justify-between" style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }} aria-hidden="true">
        {[0, Math.floor((n - 1) / 2), n - 1].map((index) => <span key={index}>{ens.validTimes?.[index] ? fmtHour(ens.validTimes[index]!, timezone) : "—"}</span>)}
      </div>
      <p className="mt-1 text-[10px] text-white/55">Hour-ending amounts · inches per hour-long interval</p>

      <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }} aria-live="polite">
        <div className="w-full">
          <div style={{ fontSize: 9, letterSpacing: "0.06em", color: q ? "#7ce0ff" : "rgba(255,255,255,0.45)" }}>
            {q ? `HOUR ENDING ${hourLabel.toUpperCase()}` : "WINDOW TOTALS"}
          </div>
          <div className="flex gap-2">
            {quantiles.map(([k, v, c]) => (
              <div key={k} className="flex-1">
                <div style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: c }}>{v.toFixed(2)}″</div>
              </div>
            ))}
            {q && (
              <div className="flex-1">
                <div style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }}>WET</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{Math.round(q.exceed)}%</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 10, lineHeight: 1.35 }}>
        {caption(ens, timezone)}
      </p>
    </Card>
  );
}
