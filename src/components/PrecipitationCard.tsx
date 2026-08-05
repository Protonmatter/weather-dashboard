import { Droplets } from "lucide-react";
import { Card, Scale } from "./Card";
import { fmtHour } from "../lib/units";
import type { EnsembleSummary, HourPoint } from "../lib/types";

interface Props {
  ens: EnsembleSummary;
  hourly: readonly HourPoint[];
}

/** p10-p90 band with the median traced through it. */
function FanChart({ ens }: { ens: EnsembleSummary }) {
  const P = ens.perHour;
  if (P.length < 2) return null;

  const X = (i: number): number => (i / (P.length - 1)) * 240;
  const Y = (v: number): number => 52 - (v / ens.peak) * 44;

  const upper = P.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.p90).toFixed(1)}`).join(" ");
  const lower = P.slice()
    .reverse()
    .map((p, i) => `L${X(P.length - 1 - i).toFixed(1)},${Y(p.p10).toFixed(1)}`)
    .join(" ");
  const median = P.map((p, i) => `${X(i).toFixed(1)},${Y(p.p50).toFixed(1)}`).join(" ");

  return (
    <>
      <path d={`${upper} ${lower} Z`} fill="rgba(124,224,255,0.26)" />
      <polyline points={median} fill="none" stroke="#7ce0ff" strokeWidth="1.8" strokeLinejoin="round" />
    </>
  );
}

function caption(ens: EnsembleSummary, hourly: readonly HourPoint[]): string {
  if (ens.t90 < 0.01) return "Every member stays dry through tomorrow.";
  if (ens.t10 >= 0.01)
    return `All members are wet — totals land between ${ens.t10.toFixed(2)}″ and ${ens.t90.toFixed(2)}″.`;
  const peakHour = hourly[Math.min(ens.wettest, hourly.length - 1)];
  const when = peakHour ? ` Heaviest around ${fmtHour(peakHour.time)}.` : "";
  return `Half the members stay under ${ens.t50.toFixed(2)}″; the wettest tenth reach ${ens.t90.toFixed(2)}″.${when}`;
}

export function PrecipitationCard({ ens, hourly }: Props) {
  const quantiles: ReadonlyArray<readonly [string, number, string]> = [
    ["P10", ens.t10, "rgba(255,255,255,0.55)"],
    ["P50", ens.t50, "#7ce0ff"],
    ["P90", ens.t90, "rgba(255,255,255,0.85)"],
  ];

  return (
    <Card title="Precipitation" icon={Droplets} className="fadein">
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{Math.round(ens.pop24)}%</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>chance</span>
      </div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.62)", marginBottom: 12 }}>
        in the next 24 hours · {ens.n} {ens.live ? "members" : "modeled members"}
      </div>

      <Scale
        stops="#4a6a86 0%, #3f9ae0 50%, #7ce0ff 100%"
        pos={ens.pop24}
        ticks={["NONE", "LIKELY", "CERTAIN"]}
        label="Precipitation likelihood over 24 hours"
      />

      <svg
        viewBox="0 0 240 58"
        className="w-full mt-3"
        style={{ display: "block" }}
        role="img"
        aria-label={`Ensemble precipitation spread. Median 24-hour total ${ens.t50.toFixed(2)} inches, 10th to 90th percentile ${ens.t10.toFixed(2)} to ${ens.t90.toFixed(2)} inches.`}
      >
        <line x1="0" y1="52" x2="240" y2="52" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <FanChart ens={ens} />
      </svg>

      <div className="flex justify-between" style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }} aria-hidden="true">
        <span>NOW</span>
        <span>+12H</span>
        <span>+24H</span>
      </div>

      <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        {quantiles.map(([k, v, c]) => (
          <div key={k} className="flex-1">
            <div style={{ fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)" }}>{k}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: c }}>{v.toFixed(2)}″</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 10, lineHeight: 1.35 }}>
        {caption(ens, hourly)}
      </p>
    </Card>
  );
}
